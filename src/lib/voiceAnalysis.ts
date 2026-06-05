/**
 * Voice Analysis — extracts writing style characteristics from example documents.
 * Produces a detailed style profile that can be used to instruct the LLM to write
 * in the same voice.
 */

import { chatCompletion, type ChatMessage } from "./openrouter";
import { useMemoryStore } from "../store/memoryStore";
import { useModelStore } from "../store/modelStore";

const ANALYSIS_PROMPT = `You are an expert writing style analyst. Analyze the following text samples from the same author and produce a detailed, actionable writing style profile.

Your analysis must cover ALL of the following dimensions with specific, concrete observations:

## 1. Sentence Structure
- Average sentence length (short/medium/long)
- Sentence variety patterns (does the author mix lengths? favor fragments? use run-ons?)
- Subordinate clause usage (frequent complex sentences vs. simple declarative)
- Opening patterns (how do sentences typically start?)

## 2. Vocabulary & Word Choice
- Register level (casual/conversational, professional, academic, technical)
- Vocabulary sophistication (simple everyday words vs. elevated diction)
- Jargon usage (domain-specific terms, acronyms, insider language)
- Preferred verbs (active vs. passive, strong vs. weak)
- Characteristic phrases or expressions the author repeats

## 3. Tone & Attitude
- Emotional register (warm, distant, authoritative, playful, serious)
- Relationship to reader (peer, teacher, mentor, entertainer)
- Confidence level (assertive, hedging, exploratory)
- Humor usage (none, subtle, frequent, sarcastic)

## 4. Paragraph & Flow
- Paragraph length tendency
- Transition style (explicit connectors vs. implicit flow)
- Use of white space and breaks
- How ideas are sequenced (thesis-first, building-up, narrative)

## 5. Formatting Habits
- Use of bold, italic, headers
- List usage (bullet points, numbered lists)
- Punctuation preferences (em dashes, semicolons, ellipses, exclamation marks)
- Capitalization patterns

## 6. Content Approach
- How complex ideas are explained (analogies, examples, step-by-step)
- Level of detail (high-level overview vs. granular)
- Use of data/evidence vs. opinion
- How arguments are structured

## 7. Distinctive Quirks
- Any unique patterns, catchphrases, or stylistic signatures
- What makes this voice immediately recognizable

Produce the profile as a set of concise, directive instructions that another AI could follow to perfectly replicate this writing style. Write them as "you" instructions (e.g., "Use short punchy sentences. Favor active voice. Address the reader directly.").

Be extremely specific — don't say "writes clearly" (that's generic). Say "keeps sentences under 15 words, uses one-syllable verbs, avoids adverbs entirely."`;

/**
 * Analyze example texts and produce a style profile.
 */
export async function analyzeVoice(exampleTexts: string[]): Promise<string> {
  const { apiKey } = useMemoryStore.getState();
  const { primaryModel } = useModelStore.getState();

  const combinedExamples = exampleTexts
    .map((text, i) => `--- Sample ${i + 1} ---\n${text.slice(0, 3000)}`)
    .join("\n\n");

  const messages: ChatMessage[] = [
    { role: "system", content: ANALYSIS_PROMPT },
    { role: "user", content: combinedExamples },
  ];

  return await chatCompletion(apiKey, primaryModel.id, messages);
}

/**
 * Build the system prompt injection for a voice preset.
 * This gets prepended to all canvas AI edit prompts when a voice is active.
 */
export function buildVoiceInstruction(voicePreset: {
  name: string;
  styleAnalysis: string;
}): string {
  return `CRITICAL WRITING STYLE REQUIREMENT — Voice: "${voicePreset.name}"

You MUST write in the following style. This is not optional. Every word, sentence, and paragraph must match this voice profile exactly. The output should read as if written by the same person who wrote the example documents.

${voicePreset.styleAnalysis}

Remember: Match this voice precisely. Do not fall back to generic AI writing. The reader should not be able to tell the difference between this output and the original author's work.`;
}
