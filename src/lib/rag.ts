import { useMemoryStore } from "../store/memoryStore";

const CHUNK_SIZE = 1500;    // ~375 tokens per chunk
const CHUNK_OVERLAP = 200;  // overlap for continuity
const TOP_K = 5;            // return top 5 most relevant chunks
const RAG_THRESHOLD = 15000; // only use RAG for files > 15K chars

export function shouldUseRag(text: string): boolean {
  return text.length > RAG_THRESHOLD;
}

export interface RagChunk {
  text: string;
  index: number;
}

export function chunkText(text: string): RagChunk[] {
  const chunks: RagChunk[] = [];
  let start = 0;
  let index = 0;

  while (start < text.length) {
    let end = start + CHUNK_SIZE;

    // Try to break at a paragraph or sentence boundary
    if (end < text.length) {
      const slice = text.slice(start, end + 100);
      const paragraphBreak = slice.lastIndexOf("\n\n");
      const sentenceBreak = slice.lastIndexOf(". ");
      if (paragraphBreak > CHUNK_SIZE * 0.6) {
        end = start + paragraphBreak + 2;
      } else if (sentenceBreak > CHUNK_SIZE * 0.6) {
        end = start + sentenceBreak + 2;
      }
    }

    chunks.push({ text: text.slice(start, end).trim(), index });
    index++;
    start = end - CHUNK_OVERLAP;
  }

  return chunks.filter((c) => c.text.length > 20);
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

async function getEmbeddings(texts: string[], apiKey: string): Promise<number[][]> {
  const response = await fetch("https://openrouter.ai/api/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "openai/text-embedding-3-small",
      input: texts,
    }),
  });

  if (!response.ok) {
    throw new Error(`Embedding API error: ${response.status}`);
  }

  const data = await response.json();
  return data.data
    .sort((a: any, b: any) => a.index - b.index)
    .map((d: any) => d.embedding);
}

export async function retrieveRelevantChunks(
  text: string,
  query: string,
  fileName: string,
): Promise<string> {
  const apiKey = useMemoryStore.getState().apiKey;
  if (!apiKey) return text; // can't embed without key

  try {
    console.log(`[Aki:rag] Chunking ${fileName} (${text.length} chars)...`);
    const chunks = chunkText(text);
    console.log(`[Aki:rag] Created ${chunks.length} chunks, embedding...`);

    // Embed all chunks + the query in one batch
    const textsToEmbed = [...chunks.map((c) => c.text), query];
    const embeddings = await getEmbeddings(textsToEmbed, apiKey);

    const queryEmbedding = embeddings[embeddings.length - 1];
    const chunkEmbeddings = embeddings.slice(0, -1);

    // Score and rank chunks
    const scored = chunks.map((chunk, i) => ({
      chunk,
      score: cosineSimilarity(queryEmbedding, chunkEmbeddings[i]),
    }));
    scored.sort((a, b) => b.score - a.score);

    // Take top K, then re-sort by original position for coherence
    const topChunks = scored
      .slice(0, TOP_K)
      .sort((a, b) => a.chunk.index - b.chunk.index);

    const result = topChunks
      .map((s) => `[Chunk ${s.chunk.index + 1}, relevance: ${(s.score * 100).toFixed(0)}%]\n${s.chunk.text}`)
      .join("\n\n---\n\n");

    console.log(`[Aki:rag] Selected ${topChunks.length}/${chunks.length} chunks (top scores: ${scored.slice(0, 3).map((s) => (s.score * 100).toFixed(0) + "%").join(", ")})`);

    return `[RAG-retrieved excerpts from ${fileName} — ${topChunks.length} of ${chunks.length} sections, selected by relevance to your question]\n\n${result}`;
  } catch (err) {
    console.warn("[Aki:rag] Retrieval failed, falling back to summarization:", err);
    return text; // caller will still apply summarization
  }
}
