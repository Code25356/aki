import * as XLSX from "xlsx";
import mammoth from "mammoth";
import type { Attachment } from "../store/chatStore";
import { processPdf } from "./pdf";
import { chatCompletion, type ChatMessage, type ContentPart } from "./openrouter";
import { useMemoryStore } from "../store/memoryStore";
import { useModelStore } from "../store/modelStore";

const MAX_IMAGE_DIM = 1568; // Claude's max; GPT uses 2048 but 1568 is safe for all
const JPEG_QUALITY = 0.85;
const SUMMARIZE_THRESHOLD = 8000; // chars — roughly 2K tokens
const CHEAP_VISION_MODEL = "google/gemini-2.0-flash-001"; // fast + cheap, supports vision

async function maybeCondense(text: string, fileName: string): Promise<string> {
  if (text.length <= SUMMARIZE_THRESHOLD) return text;

  const apiKey = useMemoryStore.getState().apiKey;
  if (!apiKey) return text;

  try {
    console.log(`[Aki:file] Pre-summarizing ${fileName} (${text.length} chars) with ${CHEAP_VISION_MODEL}`);
    const messages: ChatMessage[] = [
      {
        role: "system",
        content:
          "You are a document preprocessor. Create a detailed structured summary of the following document. Preserve all key facts, numbers, names, dates, and important details. Use headings and bullet points. The summary should be thorough enough that someone can answer specific questions about the document from your summary alone. Do NOT omit important details.",
      },
      {
        role: "user",
        content: `Document: ${fileName}\n\n${text}`,
      },
    ];
    const summary = await chatCompletion(apiKey, CHEAP_VISION_MODEL, messages);
    console.log(`[Aki:file] Summarized: ${text.length} → ${summary.length} chars`);
    return `[Pre-processed summary of ${fileName}]\n\n${summary}\n\n[Original: ${text.length} characters, summarized for efficiency]`;
  } catch (err) {
    console.warn("[Aki:file] Summarization failed, using original:", err);
    return text;
  }
}

/** Send page images to a cheap vision model to extract text (for scanned PDFs or non-vision main model) */
async function extractTextViaVision(pageImages: Attachment[], fileName: string): Promise<string> {
  const apiKey = useMemoryStore.getState().apiKey;
  if (!apiKey) throw new Error("No API key");

  console.log(`[Aki:file] Extracting text via vision model from ${pageImages.length} pages of ${fileName}`);

  const parts: ContentPart[] = [
    { type: "text", text: `Extract ALL text from these document pages of "${fileName}". Preserve the structure, headings, paragraphs, tables, and lists. Output the raw text content only, no commentary.` },
  ];
  for (const img of pageImages) {
    parts.push({ type: "image_url", image_url: { url: img.dataUrl } });
  }

  const messages: ChatMessage[] = [
    { role: "user", content: parts },
  ];

  const text = await chatCompletion(apiKey, CHEAP_VISION_MODEL, messages);
  console.log(`[Aki:file] Vision-extracted ${text.length} chars from ${fileName}`);
  return text;
}

let attachIdCounter = 0;
function nextId() {
  return `att-${Date.now()}-${++attachIdCounter}`;
}

function textToDataUrl(text: string): string {
  return "data:text/plain;base64," + btoa(unescape(encodeURIComponent(text)));
}

function compressImage(dataUrl: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;

      // Downscale if larger than max
      if (width > MAX_IMAGE_DIM || height > MAX_IMAGE_DIM) {
        const scale = MAX_IMAGE_DIM / Math.max(width, height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, width, height);

      // Use JPEG for photos/screenshots (much smaller), keep PNG for transparency
      const isPng = dataUrl.startsWith("data:image/png");
      const hasTransparency = isPng && checkTransparency(ctx, width, height);

      if (hasTransparency) {
        resolve(canvas.toDataURL("image/png"));
      } else {
        resolve(canvas.toDataURL("image/jpeg", JPEG_QUALITY));
      }
    };
    img.onerror = () => resolve(dataUrl); // fallback to original
    img.src = dataUrl;
  });
}

function checkTransparency(ctx: CanvasRenderingContext2D, w: number, h: number): boolean {
  // Sample a grid of pixels to check for transparency
  const step = Math.max(1, Math.floor(Math.min(w, h) / 20));
  const data = ctx.getImageData(0, 0, w, h).data;
  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      const alpha = data[(y * w + x) * 4 + 3];
      if (alpha < 250) return true;
    }
  }
  return false;
}

function dataUrlToArrayBuffer(dataUrl: string): ArrayBuffer {
  const base64 = dataUrl.split(",")[1];
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

async function processExcel(dataUrl: string, fileName: string): Promise<Attachment[]> {
  const buffer = dataUrlToArrayBuffer(dataUrl);
  const workbook = XLSX.read(buffer, { type: "array" });

  const sheets: string[] = [];
  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name];
    const csv = XLSX.utils.sheet_to_csv(sheet);
    if (csv.trim()) {
      sheets.push(`--- Sheet: ${name} ---\n${csv}`);
    }
  }

  const raw = sheets.join("\n\n") || "(Empty spreadsheet)";
  const text = await maybeCondense(raw, fileName);
  return [{
    id: nextId(),
    type: "file",
    name: fileName,
    mimeType: "text/plain",
    dataUrl: textToDataUrl(text),
  }];
}

async function processWord(dataUrl: string, fileName: string): Promise<Attachment[]> {
  const buffer = dataUrlToArrayBuffer(dataUrl);
  const result = await mammoth.extractRawText({ arrayBuffer: buffer });
  const raw = result.value.trim() || "(Empty document)";
  const text = await maybeCondense(raw, fileName);
  return [{
    id: nextId(),
    type: "file",
    name: fileName,
    mimeType: "text/plain",
    dataUrl: textToDataUrl(text),
  }];
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

const EXCEL_TYPES = new Set([
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
]);
const WORD_TYPES = new Set([
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
]);

function isExcel(file: File): boolean {
  return EXCEL_TYPES.has(file.type) || /\.(xlsx?|csv)$/i.test(file.name);
}

function isWord(file: File): boolean {
  return WORD_TYPES.has(file.type) || /\.docx?$/i.test(file.name);
}

function isPdf(file: File): boolean {
  return file.type === "application/pdf" || file.name.endsWith(".pdf");
}

export async function processFile(file: File): Promise<Attachment[]> {
  const dataUrl = await readFileAsDataUrl(file);

  try {
    if (isPdf(file)) {
      return await processPdfFile(dataUrl, file.name);
    }

    if (isExcel(file)) {
      return processExcel(dataUrl, file.name);
    }

    if (isWord(file)) {
      return processWord(dataUrl, file.name);
    }

    // Images — resize and compress
    if (file.type.startsWith("image/")) {
      const compressed = await compressImage(dataUrl);
      return [{
        id: nextId(),
        type: "image",
        name: file.name,
        mimeType: compressed.startsWith("data:image/jpeg") ? "image/jpeg" : "image/png",
        dataUrl: compressed,
      }];
    }

    // Everything else: plain text/code files — condense if large
    if (file.size > SUMMARIZE_THRESHOLD) {
      try {
        const base64 = dataUrl.split(",")[1];
        const raw = decodeURIComponent(escape(atob(base64)));
        const text = await maybeCondense(raw, file.name);
        return [{
          id: nextId(),
          type: "file",
          name: file.name,
          mimeType: "text/plain",
          dataUrl: textToDataUrl(text),
        }];
      } catch {
        // binary file — fall through
      }
    }
  } catch (err) {
    console.error(`[Aki:file] Processing failed for ${file.name}:`, err);

    // For binary formats (PDF, Excel, Word), don't send raw binary — it's useless
    if (isPdf(file) || isExcel(file) || isWord(file)) {
      return [{
        id: nextId(),
        type: "file",
        name: file.name,
        mimeType: "text/plain",
        dataUrl: textToDataUrl(`[Failed to process ${file.name}. The file could not be read.]`),
      }];
    }
  }

  // Fallback: attach raw file (only for text-based formats)
  return [{
    id: nextId(),
    type: "file",
    name: file.name,
    mimeType: file.type || "application/octet-stream",
    dataUrl,
  }];
}

/**
 * PDF processing with vision-aware routing:
 * - Vision model: return page images (best accuracy)
 * - Non-vision model: return extracted text
 * - Both: attach extractedText on image attachments so chatStore can pick the right format
 */
async function processPdfFile(dataUrl: string, fileName: string): Promise<Attachment[]> {
  const result = await processPdf(dataUrl, fileName);
  const { primaryModel } = useModelStore.getState();

  // Get text — either from Rust extraction or vision OCR fallback
  let extractedText = result.text;
  if (!extractedText && result.pageImages.length > 0) {
    // Scanned PDF — no Rust text. Use cheap vision model to OCR.
    try {
      extractedText = await extractTextViaVision(result.pageImages, fileName);
    } catch (err) {
      console.warn("[Aki:pdf] Vision OCR fallback failed:", err);
    }
  }

  // Condense text if we have it
  if (extractedText) {
    extractedText = await maybeCondense(extractedText, fileName);
  }

  const hasImages = result.pageImages.length > 0;

  if (primaryModel.vision && hasImages) {
    // Vision model with images: send page images, attach extractedText as fallback for eval
    return result.pageImages.map((img) => ({
      ...img,
      extractedText: extractedText || undefined,
    }));
  }

  // Non-vision model OR no images available: send text if we have it
  if (extractedText) {
    return [{
      id: nextId(),
      type: "file",
      name: fileName,
      mimeType: "text/plain",
      dataUrl: textToDataUrl(extractedText),
    }];
  }

  // Have images but no text (vision model case already handled above) —
  // this means non-vision model + scanned PDF + OCR failed. Send images anyway
  // as last resort (model may or may not handle them).
  if (hasImages) {
    return result.pageImages;
  }

  // Nothing worked — report failure
  return [{
    id: nextId(),
    type: "file",
    name: fileName,
    mimeType: "text/plain",
    dataUrl: textToDataUrl(`[Failed to process ${fileName}. The file could not be read.]`),
  }];
}
