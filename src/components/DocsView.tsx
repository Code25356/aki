import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

interface DocSection {
  id: string;
  title: string;
  content: string;
}

const sections: DocSection[] = [
  {
    id: "getting-started",
    title: "Getting Started",
    content: `Aki is your personal AI assistant that runs natively on your Mac. It connects to any LLM via OpenRouter and gives you tools like web search, Google Drive, Gmail, financial data, and more — all in one place.

**Quick Setup:**
1. Open the **Brain** tab
2. Paste your OpenRouter API key (get one free at openrouter.ai)
3. Start chatting!

**Tip:** Use \`Cmd+Shift+Space\` from anywhere on your Mac to instantly show/hide Aki.`,
  },
  {
    id: "models",
    title: "Choosing Models",
    content: `Aki supports any model available on OpenRouter. Pick a primary model based on your task, and optionally an eval model for quality checks.

**Primary Model:** Your main conversation model.
**Eval Model (optional):** A second model that critiques the primary's response. If issues are found, the primary revises. Great for high-stakes work.

**Quick recommendation:**
- *Daily driver:* Gemini 3.5 Flash or Qwen 3.6 Plus (fast, cheap, capable)
- *Hard problems:* Claude Opus 4.6 or GPT 5.4 (best reasoning)
- *Best value:* DeepSeek V4 Pro or Tencent Hy3 (cheapest per token)
- *Coding:* Claude Sonnet 4.6 or DeepSeek V4 Pro
- *Vision/images:* GPT 5.4, Claude Opus/Sonnet, Grok 4.3, Gemini 3.5 Flash`,
  },
  {
    id: "model-guide",
    title: "Model Guide & Pricing",
    content: `All pricing is per 1 million tokens via OpenRouter. Context = max conversation length.

**Claude Opus 4.6** — Anthropic's flagship. Best for complex reasoning, long documents, nuanced writing.
- Input: $5.00 / Output: $25.00 / Context: 1M tokens / Vision: Yes
- Use when: You need the absolute best quality and don't mind the cost.

**Claude Sonnet 4.6** — Anthropic's workhorse. Frontier coding, agents, professional tasks.
- Input: $3.00 / Output: $15.00 / Context: 1M tokens / Vision: Yes
- Use when: Coding, analysis, agentic workflows. 90% of Opus quality at 60% the price.

**GPT 5.4** — OpenAI's top model. Strong all-rounder with excellent instruction following.
- Input: $2.50 / Output: $15.00 / Context: 1M tokens / Vision: Yes
- Use when: General tasks, multimodal work, structured outputs.

**GPT 5.4 Mini** — OpenAI's efficient model. Surprisingly capable for the price.
- Input: $0.75 / Output: $4.50 / Context: 400K tokens / Vision: Yes
- Use when: High-volume tasks, quick Q&A, budget-conscious vision work.

**xAI Grok 4.3** — Fast, large context, great for real-time knowledge.
- Input: $1.25 / Output: $2.50 / Context: 1M tokens / Vision: Yes
- Use when: Real-time knowledge, long contexts, low output cost.

**Google Gemini 3.5 Flash** — Fast, multimodal, massive context.
- Input: $1.50 / Output: $9.00 / Context: 1M tokens / Vision: Yes
- Use when: Large documents, multimodal tasks, speed matters.

**Qwen 3.6 Plus** — Alibaba's flagship. Excellent multilingual and reasoning.
- Input: $0.33 / Output: $1.95 / Context: 1M tokens / Vision: Yes
- Use when: Multilingual tasks, great value for general use.

**DeepSeek V4 Pro** — Chinese open-weight giant. Exceptional coding and math.
- Input: $0.44 / Output: $0.87 / Context: 1M tokens / Vision: No
- Use when: Coding, math, technical tasks on a budget. Best price/performance.

**Tencent Hy3 Preview** — Ultra-cheap MoE model for agentic workflows.
- Input: $0.07 / Output: $0.26 / Context: 262K tokens / Vision: No
- Use when: High-volume agentic tasks, cost is the top priority.

**Xiaomi MiMo-V2.5-Pro** — Strong reasoning and code from Xiaomi.
- Input: $1.00 / Output: $3.00 / Context: 1M tokens / Vision: No
- Use when: Coding and reasoning at moderate cost.

**Xiaomi MiMo-V2-Flash** — Fast multimodal model.
- Input: ~$0.20 / Output: ~$0.60 / Context: 128K tokens / Vision: Yes
- Use when: Quick vision tasks, budget multimodal.

**Cost comparison (cheapest → most expensive output):**
Hy3 ($0.26) → DeepSeek V4 ($0.87) → Qwen 3.6+ ($1.95) → Grok 4.3 ($2.50) → MiMo-V2.5 ($3.00) → GPT 5.4 Mini ($4.50) → Gemini 3.5 Flash ($9.00) → GPT 5.4 / Sonnet 4.6 ($15.00) → Opus 4.6 ($25.00)`,
  },
  {
    id: "web-search",
    title: "Web Search",
    content: `Aki can search the web in real-time to answer questions about current events, prices, news, or anything your model's training data might not cover.

**Setup:** Add your Tavily API key in Brain settings (free tier available at tavily.com).

**How it works:** The AI automatically decides when to search. You can also toggle the globe icon in the input bar to force-enable or disable search.

**Example prompts:**
- "What's the latest news about Apple's earnings?"
- "Find me the best restaurants in SF that opened this year"
- "What's the current weather in Tokyo?"`,
  },
  {
    id: "deep-research",
    title: "Deep Research Mode",
    content: `For complex questions that need thorough investigation, enable Deep Research mode by clicking the **microscope icon** in the input bar.

When active, Aki will:
1. Perform multiple web searches with different queries
2. Cross-reference information across sources
3. Identify and resolve conflicting data
4. Produce a structured report with findings, analysis, and sources

**When to use it:**
- Market research and competitive analysis
- Investigating a technical topic in depth
- Fact-checking claims with multiple sources
- Any question where a single search isn't enough

**Example:** Enable deep research, then ask: "What are the pros and cons of Rust vs Go for building web services in 2025?"

The icon turns blue when active. It auto-disables after your next message.`,
  },
  {
    id: "google-drive",
    title: "Google Drive Integration",
    content: `Connect Google Drive to let Aki read, create, and edit files in your Drive.

**Setup:**
1. In Brain settings, add your Google OAuth Client ID and Secret
2. Add your Drive folder ID (from the URL when you open a folder in Drive)
3. Click "Connect" to authorize

**Using Drive in a conversation:**
- Click the **hard drive icon** in the input bar to select a folder
- Aki can then list, read, create, and update files in that folder

**Example prompts:**
- "List my files" → shows what's in your connected folder
- "Read the file called Q1 Report" → reads and displays the content
- "Create a new doc called Meeting Notes with today's discussion"
- "Update the Budget file with the new numbers"

**Exporting:** Click the **download icon** to export your entire conversation as a Google Doc.`,
  },
  {
    id: "pinned-docs",
    title: "Pinned Documents (Multi-doc Workspace)",
    content: `Pin Drive files to a conversation so Aki always has them as context — no need to re-upload or re-read them every time.

**How to use:**
1. Connect a Drive folder first (hard drive icon)
2. Click the **pin icon** in the input bar
3. Select files from the dropdown to pin them
4. Pinned docs appear as blue chips above the input

Pinned docs are injected into every message as context, so you can ask the AI to cross-reference, compare, or build upon them.

**Example:** Pin your "Company Strategy" and "Q1 Metrics" docs, then ask: "Based on our strategy goals and Q1 numbers, where are we behind?"

Click the X on a chip to unpin. Pinned docs persist with the conversation.`,
  },
  {
    id: "gmail",
    title: "Gmail Integration",
    content: `Aki can read, search, and send emails from your Gmail account using the same Google OAuth connection as Drive.

**Setup:** Enable Gmail in Brain settings (uses the same OAuth credentials as Drive — you may need to disconnect and reconnect).

**What Aki can do:**
- Search and list emails with any Gmail query
- Read full email contents
- Send emails (always confirms with you first)

**Example prompts:**
- "Show me unread emails from this week"
- "Read the latest email from Sarah"
- "Draft an email to john@company.com about the project update"
- "Reply to that email saying I'll be there at 3pm"

**Tip:** Aki uses message IDs internally, so multi-step workflows (list → read → reply) work seamlessly.`,
  },
  {
    id: "financial-data",
    title: "Stock & Financial Data",
    content: `Aki can fetch real-time stock, ETF, and crypto prices — no API key needed.

**Supported symbols:**
- Stocks: AAPL, TSLA, MSFT, etc.
- ETFs: SPY, QQQ, VTI, etc.
- Crypto: BTC-USD, ETH-USD, SOL-USD, etc.

**Example prompts:**
- "What's Apple's stock price?"
- "Compare NVDA and AMD prices today"
- "How's Bitcoin doing?"
- "Show me the S&P 500 (SPY) and Nasdaq (QQQ)"

Returns: current price, daily change (%), open/high/low, volume.`,
  },
  {
    id: "canvas-mode",
    title: "Canvas / Document Mode",
    content: `Switch to Canvas mode for focused document writing. Instead of a back-and-forth chat, you get a clean document surface that the AI iterates on.

**How to use:**
1. Click the **pen/edit icon** in the input bar
2. The view switches to a full document canvas
3. Type instructions below — the AI writes/updates the document
4. Click the chat bubble icon to switch back

**Best for:**
- Writing long-form content (articles, reports, memos)
- Iterating on a single document with multiple rounds of edits
- Drafting when you don't want chat clutter

**Example workflow:**
1. Enter canvas mode
2. "Write a press release about our Series B funding"
3. "Make the tone more formal and add a quote from our CEO"
4. "Shorten it to 300 words"
5. Copy the final result or export to Drive

**Tip:** Use the copy icon in the canvas header to grab the content.`,
  },
  {
    id: "eval-diff",
    title: "Eval & Diff View",
    content: `When you have an Eval Model set, Aki automatically reviews its own answers for errors and revises if needed.

**How it works:**
1. Primary model generates an answer
2. Eval model critiques it for factual errors, hallucinations, or gaps
3. If issues are found, the primary model writes a corrected version
4. A badge shows the eval status (evaluating → revising → done)

**Diff View:** After a revision, expand the eval notes to see:
- **Original** — the pre-revision answer
- **Diff** — line-by-line comparison showing what changed (red = removed, green = added)

This is great for understanding exactly what the model corrected.`,
  },
  {
    id: "templates",
    title: "Templates",
    content: `Templates give you pre-built prompting frameworks for common tasks.

**Using templates:**
- In an empty chat, click any template button to load it
- Or type \`/\` in the input to see the template picker
- Fill in the topic at the end of the loaded prompt

**Built-in templates:**
- Competitive Analysis
- Growth Memo
- Budget Justification
- Press Article
- Research Brief

**Custom templates:** Go to Brain > Templates to add your own. Each template has a name, description, and prompt text.`,
  },
  {
    id: "memory",
    title: "Memory & Personalization",
    content: `Aki remembers things about you across conversations to give better, personalized responses.

**Types of memory:**
- **Manual Memory:** Free-text context you write in Brain settings (role, preferences, projects)
- **Auto Memory:** Facts Aki picks up from conversations (shown as chips in Brain settings, deletable)
- **Style Examples:** Save writing samples so Aki matches your tone and voice

**How auto-memory works:** After each conversation turn, Aki extracts any new facts worth remembering (preferences, project details, etc.) and saves them automatically.

**Style memory:** When Aki writes something you like, click the **palette icon** on that message to save it as a style reference. Future writing will match that tone.

**Tip:** You can delete any auto-memory from Brain settings if it's wrong or outdated.`,
  },
  {
    id: "voice",
    title: "Voice Input",
    content: `Speak instead of typing using the microphone button.

**Setup:** Add your Groq API key in Brain settings (free at console.groq.com).

**How to use:**
1. Click the **mic icon** — it turns red and starts recording
2. Speak your message
3. Click again to stop — your speech is transcribed and inserted into the input

Uses Groq's Whisper model for fast, accurate transcription.`,
  },
  {
    id: "attachments",
    title: "File & Image Attachments",
    content: `Drag and drop or click the paperclip to attach files and images.

**Supported formats:**
- Images: PNG, JPG, GIF, WebP (analyzed with vision models)
- Documents: PDF, DOCX, TXT, MD, CSV, JSON, XML
- Code: JS, TS, Python, Rust, Go, Java, C/C++, HTML, CSS, SQL

**How it works:**
- Images are sent directly to vision-capable models
- Documents are extracted to text and included in context
- Large files use RAG (retrieval-augmented generation) to find relevant sections

**Tip:** Paste screenshots directly with Cmd+V — great for asking about UI mockups, error messages, or diagrams.`,
  },
  {
    id: "conversations",
    title: "Conversation Management",
    content: `**Pin messages:** Click the pin icon on any message to mark it as important.

**Fork conversations:** Click the branch icon on a message to create a new conversation starting from that point — useful for exploring alternative directions without losing your original thread.

**Search:** Use the search bar in the sidebar to find past conversations by title or content.

**Keyboard shortcut:** \`Cmd+Shift+Space\` shows/hides Aki from anywhere on your Mac.`,
  },
  {
    id: "usage",
    title: "Usage & Cost Tracking",
    content: `Aki tracks your API usage across all conversations.

View your stats in Brain settings:
- Total cost (estimated from token counts)
- Total input/output tokens
- Reset button to start fresh

**Tip:** Different models have different costs. Check openrouter.ai/models for current pricing.`,
  },
];

function DocSectionView({ section, defaultOpen }: { section: DocSection; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border-b border-[var(--color-sidebar-border)] last:border-b-0">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-[var(--color-hover)] transition-colors cursor-pointer"
      >
        {open ? <ChevronDown size={14} className="shrink-0 text-[var(--color-text-secondary)]" /> : <ChevronRight size={14} className="shrink-0 text-[var(--color-text-secondary)]" />}
        <span className="text-[13px] font-medium text-[var(--color-text-primary)]">{section.title}</span>
      </button>
      {open && (
        <div className="px-4 pb-4 pl-9 text-[13px] leading-relaxed text-[var(--color-text-secondary)] whitespace-pre-line">
          {section.content.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/).map((part, i) => {
            if (part.startsWith("**") && part.endsWith("**")) {
              return <strong key={i} className="text-[var(--color-text-primary)] font-medium">{part.slice(2, -2)}</strong>;
            }
            if (part.startsWith("*") && part.endsWith("*") && !part.startsWith("**")) {
              return <em key={i}>{part.slice(1, -1)}</em>;
            }
            if (part.startsWith("`") && part.endsWith("`")) {
              return <code key={i} className="px-1 py-0.5 rounded bg-[var(--color-hover)] text-[var(--color-accent)] text-[12px]">{part.slice(1, -1)}</code>;
            }
            return <span key={i}>{part}</span>;
          })}
        </div>
      )}
    </div>
  );
}

export default function DocsView() {
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto py-6 px-6" style={{ maxWidth: "min(100%, 720px)" }}>
        <div className="mb-6">
          <h1 className="text-xl font-semibold mb-1">Aki User Guide</h1>
          <p className="text-[13px] text-[var(--color-text-secondary)]">
            Everything you need to know about using Aki. Click any section to expand.
          </p>
        </div>

        <div className="border border-[var(--color-sidebar-border)] rounded-xl overflow-hidden">
          {sections.map((section, i) => (
            <DocSectionView key={section.id} section={section} defaultOpen={i === 0} />
          ))}
        </div>

        <div className="mt-6 text-center text-[12px] text-[var(--color-text-secondary)]">
          Built with Tauri + React + OpenRouter
        </div>
      </div>
    </div>
  );
}
