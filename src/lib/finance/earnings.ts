import { invoke } from "@tauri-apps/api/core";

export interface EarningsEvent {
  date: string;
  epsEstimate: number;
  epsActual: number | null;
  revenueEstimate: number;
  revenueActual: number | null;
  surprise: number | null; // % beat/miss
}

export interface EarningsData {
  symbol: string;
  name: string;
  nextEarningsDate: string | null;
  recentQuarters: EarningsEvent[];
  avgSurprise: number;
  beatRate: number; // % of quarters that beat
  upcomingEstimate: { eps: number; revenue: number } | null;
}

async function fetchJson(url: string): Promise<any> {
  const body = await invoke<string>("fetch_url", { url });
  return JSON.parse(body);
}

export async function fetchEarnings(symbol: string): Promise<EarningsData> {
  const modules = "earningsHistory,earningsTrend,calendarEvents,price";
  const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol.toUpperCase())}?modules=${modules}`;
  const data = await fetchJson(url);

  const result = data.quoteSummary?.result?.[0];
  if (!result) throw new Error(`No earnings data for "${symbol}"`);

  const price = result.price || {};
  const history = result.earningsHistory?.history || [];
  const trend = result.earningsTrend?.trend || [];
  const calendar = result.calendarEvents?.earnings || {};

  // Parse historical quarters
  const recentQuarters: EarningsEvent[] = history.slice(-8).map((q: any) => {
    const epsEst = q.epsEstimate?.raw ?? 0;
    const epsAct = q.epsActual?.raw ?? null;
    const surprise = q.surprisePercent?.raw ?? null;
    return {
      date: q.quarter?.fmt || "Unknown",
      epsEstimate: epsEst,
      epsActual: epsAct,
      revenueEstimate: 0,
      revenueActual: null,
      surprise,
    };
  });

  // Beat rate
  const withSurprise = recentQuarters.filter((q) => q.surprise !== null);
  const beats = withSurprise.filter((q) => q.surprise! > 0);
  const beatRate = withSurprise.length > 0 ? (beats.length / withSurprise.length) * 100 : 0;
  const avgSurprise = withSurprise.length > 0
    ? withSurprise.reduce((a, q) => a + q.surprise!, 0) / withSurprise.length
    : 0;

  // Next earnings date
  const earningsDates = calendar.earningsDate || [];
  const nextEarningsDate = earningsDates.length > 0 ? earningsDates[0]?.fmt || null : null;

  // Upcoming estimates from trend
  const currentQuarter = trend.find((t: any) => t.period === "0q");
  const upcomingEstimate = currentQuarter ? {
    eps: currentQuarter.earningsEstimate?.avg?.raw ?? 0,
    revenue: currentQuarter.revenueEstimate?.avg?.raw ?? 0,
  } : null;

  return {
    symbol: symbol.toUpperCase(),
    name: price.shortName || price.longName || symbol,
    nextEarningsDate,
    recentQuarters,
    avgSurprise,
    beatRate,
    upcomingEstimate,
  };
}

export function formatEarnings(data: EarningsData): string {
  const lines: string[] = [];

  lines.push(`═══ EARNINGS: ${data.symbol} (${data.name}) ═══\n`);

  // Upcoming
  if (data.nextEarningsDate) {
    lines.push(`📅 Next Earnings: ${data.nextEarningsDate}`);
    if (data.upcomingEstimate) {
      lines.push(`   Consensus EPS Estimate: $${data.upcomingEstimate.eps.toFixed(2)}`);
      if (data.upcomingEstimate.revenue > 0) {
        const revB = data.upcomingEstimate.revenue / 1e9;
        lines.push(`   Revenue Estimate: $${revB.toFixed(2)}B`);
      }
    }
  } else {
    lines.push("No upcoming earnings date available.");
  }
  lines.push("");

  // Track record
  lines.push("── EARNINGS TRACK RECORD ──");
  lines.push(`Beat Rate: ${data.beatRate.toFixed(0)}% (${Math.round(data.beatRate * data.recentQuarters.length / 100)} of ${data.recentQuarters.length} quarters)`);
  lines.push(`Avg Surprise: ${data.avgSurprise >= 0 ? "+" : ""}${data.avgSurprise.toFixed(1)}%`);
  lines.push("");

  // History table
  if (data.recentQuarters.length > 0) {
    lines.push("── RECENT QUARTERS ──");
    lines.push("Quarter     | EPS Est  | EPS Act  | Surprise");
    lines.push("------------|----------|----------|----------");
    for (const q of data.recentQuarters.slice(-6)) {
      const est = `$${q.epsEstimate.toFixed(2)}`.padEnd(8);
      const act = q.epsActual !== null ? `$${q.epsActual.toFixed(2)}`.padEnd(8) : "N/A     ";
      const surp = q.surprise !== null ? `${q.surprise >= 0 ? "+" : ""}${q.surprise.toFixed(1)}%` : "—";
      lines.push(`${q.date.padEnd(11)} | ${est} | ${act} | ${surp}`);
    }
  }
  lines.push("");

  // Interpretation
  lines.push("── INTERPRETATION ──");
  if (data.beatRate >= 80) {
    lines.push("• Strong serial beater — historically reliable at exceeding estimates");
  } else if (data.beatRate >= 60) {
    lines.push("• Beats more often than misses — generally positive earnings catalyst");
  } else {
    lines.push("• Mixed track record — earnings are a coin flip, position carefully");
  }

  if (data.avgSurprise > 5) {
    lines.push("• Avg surprise >5% — analysts may be structurally underestimating this company");
  }

  if (data.nextEarningsDate) {
    lines.push(`• Implied move: expect increased volatility around ${data.nextEarningsDate}`);
  }

  return lines.join("\n");
}
