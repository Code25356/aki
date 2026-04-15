import { invoke } from "@tauri-apps/api/core";
import * as pdfjsLib from "pdfjs-dist";
import type { Attachment } from "../store/chatStore";

// Disable worker — only used for image rendering fallback
pdfjsLib.GlobalWorkerOptions.workerSrc = "";

export interface PdfResult {
  text: string | null;
  pageImages: Attachment[];
}

export async function processPdf(
  dataUrl: string,
  fileName: string,
): Promise<PdfResult> {
  const base64 = dataUrl.split(",")[1];

  // Phase 1: Try Rust-side text extraction (fast, reliable)
  let text: string | null = null;
  try {
    const extracted: string = await invoke("extract_pdf_text", { base64Data: base64 });
    const cleaned = extracted.replace(/\s+/g, " ").trim();
    if (cleaned.length > 100) {
      text = extracted.trim();
      console.log(`[Aki:pdf] Rust extracted ${text.length} chars from ${fileName}`);
    }
  } catch (err) {
    console.warn("[Aki:pdf] Rust extraction failed:", err);
  }

  // Phase 2: Render pages as images (for vision models or scanned PDF fallback)
  let pageImages: Attachment[] = [];
  try {
    pageImages = await renderPagesToImages(base64, fileName);
    console.log(`[Aki:pdf] Rendered ${pageImages.length} page images from ${fileName}`);
  } catch (err) {
    console.warn("[Aki:pdf] Image rendering failed:", err);
  }

  return { text, pageImages };
}

async function renderPagesToImages(
  base64: string,
  fileName: string,
): Promise<Attachment[]> {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

  const pdf = await pdfjsLib.getDocument({
    data: bytes,
    useWorkerFetch: false,
    isEvalSupported: false,
    useSystemFonts: true,
  }).promise;

  const pageImages: Attachment[] = [];
  const maxPages = Math.min(pdf.numPages, 10);

  for (let i = 1; i <= maxPages; i++) {
    const page = await pdf.getPage(i);
    const scale = 1.5;
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext("2d")!;

    await page.render({ canvasContext: ctx, viewport, canvas } as any).promise;

    const imageDataUrl = canvas.toDataURL("image/jpeg", 0.85);
    pageImages.push({
      id: `pdf-page-${Date.now()}-${i}`,
      type: "image",
      name: `${fileName} (page ${i})`,
      mimeType: "image/jpeg",
      dataUrl: imageDataUrl,
    });
  }

  return pageImages;
}
