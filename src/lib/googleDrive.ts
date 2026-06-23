/**
 * Google Drive integration via OAuth2 + REST API.
 *
 * OAuth flow: Desktop app loopback redirect.
 * 1. Open browser to Google consent URL
 * 2. User approves
 * 3. Google redirects to http://localhost:{port}
 * 4. We capture the auth code from Tauri's oauth_callback command
 * 5. Exchange code for access + refresh tokens
 * 6. Store refresh token in localStorage, use access token for API calls
 */

import { processPdf } from "./pdf";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const DRIVE_API = "https://www.googleapis.com/drive/v3";
const DOCS_API = "https://docs.googleapis.com/v1/documents";

const SCOPES = "https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/documents https://www.googleapis.com/auth/gmail.modify";
const REDIRECT_URI = "http://localhost:19847/oauth/callback";

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  size?: string;
}

export interface DriveTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // unix ms
}

let oauthState: string | null = null;

export function buildAuthUrl(clientId: string): string {
  // Generate CSRF protection state parameter
  oauthState = crypto.randomUUID();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    scope: SCOPES,
    access_type: "offline",
    prompt: "consent",
    state: oauthState,
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

export function getOAuthState(): string | null {
  return oauthState;
}

export async function exchangeCodeForTokens(
  code: string,
  clientId: string,
  clientSecret: string,
): Promise<DriveTokens> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: REDIRECT_URI,
      grant_type: "authorization_code",
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token exchange failed: ${text}`);
  }

  const data = await res.json();
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
}

export async function refreshAccessToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string,
): Promise<{ accessToken: string; expiresAt: number }> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token refresh failed: ${text}`);
  }

  const data = await res.json();
  return {
    accessToken: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
}

async function getValidToken(
  tokens: DriveTokens,
  clientId: string,
  clientSecret: string,
  onTokenRefresh: (tokens: DriveTokens) => void,
): Promise<string> {
  // Refresh 5 min before expiry
  if (Date.now() > tokens.expiresAt - 5 * 60 * 1000) {
    const refreshed = await refreshAccessToken(tokens.refreshToken, clientId, clientSecret);
    const updated = { ...tokens, accessToken: refreshed.accessToken, expiresAt: refreshed.expiresAt };
    onTokenRefresh(updated);
    return refreshed.accessToken;
  }
  return tokens.accessToken;
}

export async function listFiles(
  folderId: string,
  tokens: DriveTokens,
  clientId: string,
  clientSecret: string,
  onTokenRefresh: (tokens: DriveTokens) => void,
): Promise<DriveFile[]> {
  const accessToken = await getValidToken(tokens, clientId, clientSecret, onTokenRefresh);

  const query = `'${folderId}' in parents and trashed = false`;
  const params = new URLSearchParams({
    q: query,
    fields: "files(id,name,mimeType,modifiedTime,size)",
    pageSize: "100",
    orderBy: "modifiedTime desc",
  });

  const res = await fetch(`${DRIVE_API}/files?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Drive list failed: ${text}`);
  }

  const data = await res.json();
  return data.files || [];
}

export async function readFile(
  fileId: string,
  mimeType: string,
  tokens: DriveTokens,
  clientId: string,
  clientSecret: string,
  onTokenRefresh: (tokens: DriveTokens) => void,
): Promise<string> {
  const accessToken = await getValidToken(tokens, clientId, clientSecret, onTokenRefresh);

  // Google Docs/Sheets/Slides need export
  const isGoogleDoc = mimeType.startsWith("application/vnd.google-apps.");

  let url: string;
  if (isGoogleDoc) {
    // Export as plain text (or CSV for sheets)
    let exportMime = "text/plain";
    if (mimeType === "application/vnd.google-apps.spreadsheet") {
      exportMime = "text/csv";
    }
    url = `${DRIVE_API}/files/${fileId}/export?mimeType=${encodeURIComponent(exportMime)}`;
  } else {
    url = `${DRIVE_API}/files/${fileId}?alt=media`;
  }

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Drive read failed: ${text}`);
  }

  // For text-based files, return as string
  const contentType = res.headers.get("content-type") || "";
  if (
    contentType.includes("text/") ||
    contentType.includes("json") ||
    contentType.includes("csv") ||
    isGoogleDoc
  ) {
    return await res.text();
  }

  // For binary files (PDFs, images), extract content
  const buffer = await res.arrayBuffer();
  const bytes = new Uint8Array(buffer);

  // Convert to base64
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = btoa(binary);

  // PDFs: use processPdf which does text extraction + image fallback
  if (mimeType === "application/pdf") {
    const dataUrl = `data:application/pdf;base64,${base64}`;
    const result = await processPdf(dataUrl, "document.pdf");
    if (result.text && result.text.trim().length > 100) {
      return result.text;
    }
    // Text extraction failed — return page images as base64 for vision
    if (result.pageImages.length > 0) {
      const imageUrls = result.pageImages.map((img) => img.dataUrl);
      return `[PDF_IMAGES:${JSON.stringify(imageUrls)}]`;
    }
    return "[PDF file — could not extract text or render pages. Try attaching it directly to the chat.]";
  }

  // Images: return as base64 data URL for vision model processing
  if (mimeType.startsWith("image/")) {
    return `[IMAGE:data:${mimeType};base64,${base64}]`;
  }

  return `[Binary file, ${bytes.length} bytes, mime: ${mimeType}]`;
}

export async function listFolders(
  tokens: DriveTokens,
  clientId: string,
  clientSecret: string,
  onTokenRefresh: (tokens: DriveTokens) => void,
  parentId?: string,
): Promise<DriveFile[]> {
  const accessToken = await getValidToken(tokens, clientId, clientSecret, onTokenRefresh);

  let query = "mimeType = 'application/vnd.google-apps.folder' and trashed = false";
  if (parentId) {
    query += ` and '${parentId}' in parents`;
  } else {
    query += " and 'root' in parents";
  }

  const params = new URLSearchParams({
    q: query,
    fields: "files(id,name,mimeType,modifiedTime)",
    pageSize: "50",
    orderBy: "name",
  });

  const res = await fetch(`${DRIVE_API}/files?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Drive folder list failed: ${text}`);
  }

  const data = await res.json();
  return data.files || [];
}

export async function createFile(
  name: string,
  content: string,
  folderId: string,
  tokens: DriveTokens,
  clientId: string,
  clientSecret: string,
  onTokenRefresh: (tokens: DriveTokens) => void,
  asGoogleDoc: boolean = false,
): Promise<DriveFile> {
  const accessToken = await getValidToken(tokens, clientId, clientSecret, onTokenRefresh);

  const metadata: Record<string, unknown> = { name, parents: [folderId] };
  if (asGoogleDoc) {
    metadata.mimeType = "application/vnd.google-apps.document";
  }

  const boundary = "----DriveUploadBoundary";
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n${content}\r\n` +
    `--${boundary}--`;

  const res = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,modifiedTime",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body,
    },
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Drive create failed: ${text}`);
  }

  return await res.json();
}

export async function updateFile(
  fileId: string,
  content: string,
  tokens: DriveTokens,
  clientId: string,
  clientSecret: string,
  onTokenRefresh: (tokens: DriveTokens) => void,
): Promise<DriveFile> {
  const accessToken = await getValidToken(tokens, clientId, clientSecret, onTokenRefresh);

  const res = await fetch(
    `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media&fields=id,name,mimeType,modifiedTime`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "text/plain; charset=UTF-8",
      },
      body: content,
    },
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Drive update failed: ${text}`);
  }

  return await res.json();
}

/**
 * Extract a Google Doc ID from various URL formats.
 */
export function extractGoogleDocId(url: string): string | null {
  // https://docs.google.com/document/d/DOC_ID/edit...
  const match = url.match(/docs\.google\.com\/document\/d\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

/**
 * Read a Google Doc's full text content using the Docs API.
 */
export async function readGoogleDoc(
  docId: string,
  tokens: DriveTokens,
  clientId: string,
  clientSecret: string,
  onTokenRefresh: (tokens: DriveTokens) => void,
): Promise<{ title: string; content: string }> {
  const accessToken = await getValidToken(tokens, clientId, clientSecret, onTokenRefresh);

  const res = await fetch(`${DOCS_API}/${docId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const text = await res.text();
    if (res.status === 401) {
      throw new Error(`Authentication expired. Please reconnect your Google account in the Brain tab.`);
    } else if (res.status === 403) {
      throw new Error(`Permission denied. Make sure the document is shared with your Google account, or make it accessible via link.`);
    } else if (res.status === 404) {
      throw new Error(`Document not found. Check the URL or document ID.`);
    }
    throw new Error(`Google Docs read failed (${res.status}): ${text}`);
  }

  const doc = await res.json();
  const title = doc.title || "Untitled";

  // Extract text from the document body
  let content = "";
  if (doc.body?.content) {
    for (const element of doc.body.content) {
      if (element.paragraph) {
        for (const textRun of element.paragraph.elements || []) {
          if (textRun.textRun?.content) {
            content += textRun.textRun.content;
          }
        }
      } else if (element.table) {
        // Flatten table cells
        for (const row of element.table.tableRows || []) {
          const cells: string[] = [];
          for (const cell of row.tableCells || []) {
            let cellText = "";
            for (const cellElement of cell.content || []) {
              if (cellElement.paragraph) {
                for (const textRun of cellElement.paragraph.elements || []) {
                  if (textRun.textRun?.content) {
                    cellText += textRun.textRun.content.trim();
                  }
                }
              }
            }
            cells.push(cellText);
          }
          content += cells.join(" | ") + "\n";
        }
      }
    }
  }

  return { title, content: content.trim() };
}

export interface DocEdit {
  /** "replace" finds oldText and replaces with newText. "insert" inserts text at a position. "delete" removes text. */
  type: "replace" | "insert" | "delete";
  oldText?: string;
  newText?: string;
  index?: number;
}

/**
 * Apply batch edits to a Google Doc using the Docs API batchUpdate.
 */
export async function editGoogleDoc(
  docId: string,
  edits: DocEdit[],
  tokens: DriveTokens,
  clientId: string,
  clientSecret: string,
  onTokenRefresh: (tokens: DriveTokens) => void,
): Promise<string> {
  const accessToken = await getValidToken(tokens, clientId, clientSecret, onTokenRefresh);

  // Convert edits to Google Docs API requests
  // Process in reverse order so indices don't shift
  const requests: any[] = [];

  for (const edit of edits) {
    if (edit.type === "replace" && edit.oldText && edit.newText !== undefined) {
      requests.push({
        replaceAllText: {
          containsText: {
            text: edit.oldText,
            matchCase: true,
          },
          replaceText: edit.newText,
        },
      });
    } else if (edit.type === "insert" && edit.newText && edit.index !== undefined) {
      requests.push({
        insertText: {
          location: { index: edit.index },
          text: edit.newText,
        },
      });
    } else if (edit.type === "delete" && edit.oldText) {
      // Delete by replacing with empty string
      requests.push({
        replaceAllText: {
          containsText: {
            text: edit.oldText,
            matchCase: true,
          },
          replaceText: "",
        },
      });
    }
  }

  if (requests.length === 0) {
    return "No valid edits to apply.";
  }

  const res = await fetch(`${DOCS_API}/${docId}:batchUpdate`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ requests }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google Docs edit failed (${res.status}): ${text}`);
  }

  return `Successfully applied ${requests.length} edit(s) to the document.`;
}

/**
 * Format folder contents for LLM context
 */
export function formatFileListForLLM(files: DriveFile[]): string {
  if (files.length === 0) return "The folder is empty.";

  let result = "Files in Google Drive folder:\n\n";
  result += "| # | Name | Type | Modified |\n|---|------|------|----------|\n";
  files.forEach((f, i) => {
    const type = f.mimeType.replace("application/vnd.google-apps.", "Google ").replace("application/", "");
    const modified = f.modifiedTime ? new Date(f.modifiedTime).toLocaleDateString() : "—";
    result += `| ${i + 1} | ${f.name} | ${type} | ${modified} |\n`;
  });
  result += `\nTo read a file, use the read_drive_file tool with the file name.`;
  return result;
}
