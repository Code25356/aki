import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface Template {
  id: string;
  name: string;
  description: string;
  prompt: string;
}

interface TemplateState {
  templates: Template[];
  addTemplate: (t: Omit<Template, "id">) => void;
  removeTemplate: (id: string) => void;
  updateTemplate: (id: string, updates: Partial<Omit<Template, "id">>) => void;
}

const DEFAULT_TEMPLATES: Template[] = [
  {
    id: "competitive-analysis",
    name: "Competitive Analysis",
    description: "Structured competitor comparison framework",
    prompt: `Write a competitive analysis using this structure:

**Overview**: One paragraph on the competitive landscape
**Key Competitors**: Table with columns (Company, Core Product, Target Segment, Pricing, Key Differentiator)
**Strengths vs. Weaknesses**: For each competitor, 2-3 bullet points each
**Strategic Implications**: What this means for our positioning
**Recommended Actions**: 3-5 specific next steps

Topic: `,
  },
  {
    id: "growth-memo",
    name: "Growth Memo",
    description: "Internal strategy memo format",
    prompt: `Write an internal growth memo using this structure:

**Context**: What prompted this analysis (2-3 sentences)
**Current State**: Key metrics, where we are today
**Opportunity**: The growth lever being proposed, with TAM/sizing
**Approach**: How we execute (phases, timeline)
**Resource Ask**: What's needed (headcount, budget, tools)
**Success Metrics**: How we measure if this worked
**Risks**: Top 3 risks and mitigations

Topic: `,
  },
  {
    id: "budget-justification",
    name: "Budget Justification",
    description: "Business case for resource allocation",
    prompt: `Write a budget justification using this structure:

**Request Summary**: One sentence on what you need and why
**Business Impact**: Revenue/efficiency impact with numbers
**Cost Breakdown**: Table (Item, Cost, Frequency, Annual Total)
**ROI Calculation**: Expected return vs. investment
**Alternatives Considered**: 2-3 options you evaluated
**Timeline**: When spend starts, when impact materializes
**Risk if Not Funded**: What happens if we don't do this

Topic: `,
  },
  {
    id: "press-article",
    name: "Press Article",
    description: "Article/press piece format",
    prompt: `Write a press article/feature piece using this structure:

**Headline**: Compelling, specific, not clickbait
**Lede**: Opening paragraph that hooks (who, what, why it matters)
**Context**: Background the reader needs (2-3 paragraphs)
**Core Narrative**: The main story with quotes, data, specifics
**Implications**: Why this matters beyond the immediate story
**Closing**: Forward-looking final paragraph

Write in a natural journalistic tone. No bullet points in the article body.

Topic: `,
  },
  {
    id: "research-brief",
    name: "Research Brief",
    description: "Market/competitive research summary",
    prompt: `Research and summarize using this structure:

**Question**: What we're trying to answer
**Key Findings**: 3-5 most important discoveries (sourced)
**Data Points**: Specific numbers, stats, benchmarks found
**Sources**: Where each finding came from
**Gaps**: What we still don't know
**Recommended Next Steps**: What to dig into further

Research topic: `,
  },
];

let idCounter = 0;

export const useTemplateStore = create<TemplateState>()(
  persist(
    (set) => ({
      templates: DEFAULT_TEMPLATES,
      addTemplate: (t) =>
        set((state) => ({
          templates: [
            ...state.templates,
            { ...t, id: `tmpl-${Date.now()}-${++idCounter}` },
          ],
        })),
      removeTemplate: (id) =>
        set((state) => ({
          templates: state.templates.filter((t) => t.id !== id),
        })),
      updateTemplate: (id, updates) =>
        set((state) => ({
          templates: state.templates.map((t) =>
            t.id === id ? { ...t, ...updates } : t,
          ),
        })),
    }),
    { name: "aki-templates" },
  ),
);
