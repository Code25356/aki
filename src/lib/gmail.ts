/**
 * Gmail integration via REST API.
 * Reuses the same OAuth tokens as Google Drive (shared scope).
 */

import type { DriveTokens } from "./googleDrive";
import { refreshAccessToken } from "./googleDrive";

const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";

export interface GmailMessage {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  to: string;
  date: string;
  snippet: string;
  body?: string;
  labels: string[];
}

async function getValidToken(
  tokens: DriveTokens,
  clientId: string,
  clientSecret: string,
  onTokenRefresh: (tokens: DriveTokens) => void,
): Promise<string> {
  if (Date.now() > tokens.expiresAt - 5 * 60 * 1000) {
    const refreshed = await refreshAccessToken(tokens.refreshToken, clientId, clientSecret);
    const updated = { ...tokens, accessToken: refreshed.accessToken, expiresAt: refreshed.expiresAt };
    onTokenRefresh(updated);
    return refreshed.accessToken;
  }
  return tokens.accessToken;
}

function decodeBase64Url(str: string): string {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/");
  return atob(padded);
}

function getHeader(headers: Array<{ name: string; value: string }>, name: string): string {
  return headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || "";
}

function extractBody(payload: any): string {
  // Try plain text first
  if (payload.mimeType === "text/plain" && payload.body?.data) {
    return decodeBase64Url(payload.body.data);
  }

  // Multipart: find text/plain or text/html
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === "text/plain" && part.body?.data) {
        return decodeBase64Url(part.body.data);
      }
    }
    // Fallback to HTML stripped
    for (const part of payload.parts) {
      if (part.mimeType === "text/html" && part.body?.data) {
        const html = decodeBase64Url(part.body.data);
        return html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
      }
      // Nested multipart
      if (part.parts) {
        const nested = extractBody(part);
        if (nested) return nested;
      }
    }
  }

  // Direct HTML body
  if (payload.mimeType === "text/html" && payload.body?.data) {
    const html = decodeBase64Url(payload.body.data);
    return html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
  }

  return "";
}

export async function listEmails(
  tokens: DriveTokens,
  clientId: string,
  clientSecret: string,
  onTokenRefresh: (tokens: DriveTokens) => void,
  query: string = "",
  maxResults: number = 10,
): Promise<GmailMessage[]> {
  const accessToken = await getValidToken(tokens, clientId, clientSecret, onTokenRefresh);

  const params = new URLSearchParams({
    maxResults: String(maxResults),
  });
  if (query) params.set("q", query);

  const listRes = await fetch(`${GMAIL_API}/messages?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!listRes.ok) {
    const text = await listRes.text();
    throw new Error(`Gmail list failed: ${text}`);
  }

  const listData = await listRes.json();
  const messageIds: string[] = (listData.messages || []).map((m: any) => m.id);

  if (messageIds.length === 0) return [];

  // Fetch metadata for each message
  const messages: GmailMessage[] = [];
  for (const id of messageIds) {
    const msgRes = await fetch(`${GMAIL_API}/messages/${id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Date`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!msgRes.ok) continue;
    const msg = await msgRes.json();
    const headers = msg.payload?.headers || [];
    messages.push({
      id: msg.id,
      threadId: msg.threadId,
      subject: getHeader(headers, "Subject") || "(no subject)",
      from: getHeader(headers, "From"),
      to: getHeader(headers, "To"),
      date: getHeader(headers, "Date"),
      snippet: msg.snippet || "",
      labels: msg.labelIds || [],
    });
  }

  return messages;
}

export async function readEmail(
  messageId: string,
  tokens: DriveTokens,
  clientId: string,
  clientSecret: string,
  onTokenRefresh: (tokens: DriveTokens) => void,
): Promise<GmailMessage> {
  const accessToken = await getValidToken(tokens, clientId, clientSecret, onTokenRefresh);

  const res = await fetch(`${GMAIL_API}/messages/${messageId}?format=full`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gmail read failed: ${text}`);
  }

  const msg = await res.json();
  const headers = msg.payload?.headers || [];
  const body = extractBody(msg.payload);

  return {
    id: msg.id,
    threadId: msg.threadId,
    subject: getHeader(headers, "Subject") || "(no subject)",
    from: getHeader(headers, "From"),
    to: getHeader(headers, "To"),
    date: getHeader(headers, "Date"),
    snippet: msg.snippet || "",
    body: body || msg.snippet || "",
    labels: msg.labelIds || [],
  };
}

export async function sendEmail(
  to: string,
  subject: string,
  body: string,
  tokens: DriveTokens,
  clientId: string,
  clientSecret: string,
  onTokenRefresh: (tokens: DriveTokens) => void,
  replyToMessageId?: string,
  threadId?: string,
): Promise<string> {
  const accessToken = await getValidToken(tokens, clientId, clientSecret, onTokenRefresh);

  // Build RFC 2822 email
  const headers = [
    `To: ${to}`,
    `Subject: ${subject}`,
    `Content-Type: text/plain; charset=UTF-8`,
  ];
  if (replyToMessageId) {
    headers.push(`In-Reply-To: ${replyToMessageId}`);
    headers.push(`References: ${replyToMessageId}`);
  }

  const raw = btoa(
    headers.join("\r\n") + "\r\n\r\n" + body,
  )
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const reqBody: any = { raw };
  if (threadId) reqBody.threadId = threadId;

  const res = await fetch(`${GMAIL_API}/messages/send`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(reqBody),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gmail send failed: ${text}`);
  }

  const data = await res.json();
  return data.id;
}

export function formatEmailListForLLM(emails: GmailMessage[]): string {
  if (emails.length === 0) return "No emails found.";

  let result = "Emails:\n\n";
  result += "| ID | From | Subject | Date |\n|---|------|---------|------|\n";
  emails.forEach((e) => {
    const from = e.from.replace(/"/g, "").split("<")[0].trim();
    const date = new Date(e.date).toLocaleDateString();
    const subject = e.subject.length > 50 ? e.subject.slice(0, 47) + "..." : e.subject;
    result += `| ${e.id} | ${from} | ${subject} | ${date} |\n`;
  });
  result += `\nUse read_email with the message_id to read full contents.`;
  return result;
}
