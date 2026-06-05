import type { AnalysisTimeframe, ComparisonEntry, SectorEntry, TechnicalReport, TimeRange, Interval } from "./types";
import { fetchOHLCV, fetchQuote, fetchMultipleQuotes, fetchFundamentals } from "./api";
import { computeAllIndicators } from "./indicators";
import { generateSignal } from "./signals";
import {
  formatMultipleQuotes,
  formatTechnicalReport,
  formatFundamentals,
  formatComparison,
  formatSectorPerformance,
  formatHistorical,
  formatVolumeAnalysis,
} from "./formatters";
import { fetchEarnings, formatEarnings } from "./earnings";
import { fetchOptionsChain, formatOptionsAnalysis } from "./options";
import { fetchMacroContext, formatMacroContext } from "./macro";

// ─── Public API ─────────────────────────────────────────────────

export async function handleGetQuote(symbols: string[]): Promise<string> {
  const quotes = await fetchMultipleQuotes(symbols);
  if (quotes.length === 0) return `No data found for: ${symbols.join(", ")}`;
  return formatMultipleQuotes(quotes);
}

export async function handleTechnicalAnalysis(symbol: string, timeframe: AnalysisTimeframe): Promise<string> {
  const config: Record<AnalysisTimeframe, { range: TimeRange; interval: Interval; label: string }> = {
    short: { range: "1mo", interval: "1d", label: "1 month (daily)" },
    medium: { range: "6mo", interval: "1d", label: "6 months (daily)" },
    long: { range: "2y", interval: "1wk", label: "2 years (weekly)" },
  };

  const { range, interval, label } = config[timeframe];
  const { bars, meta } = await fetchOHLCV(symbol, range, interval);

  if (bars.length < 30) {
    return `Insufficient data for ${symbol} (only ${bars.length} bars). Need at least 30 for meaningful TA.`;
  }

  const indicators = computeAllIndicators(bars);
  const signal = generateSignal(bars, indicators);

  const report: TechnicalReport = {
    symbol: meta.symbol || symbol.toUpperCase(),
    name: meta.shortName || meta.longName || symbol,
    price: bars[bars.length - 1].close,
    timeframe: label,
    indicators,
    signal,
  };

  return formatTechnicalReport(report);
}

export async function handleHistoricalData(symbol: string, range: TimeRange, interval: Interval): Promise<string> {
  const { bars, meta } = await fetchOHLCV(symbol, range, interval);
  if (bars.length === 0) return `No historical data for ${symbol}.`;
  return formatHistorical(meta.symbol || symbol.toUpperCase(), bars, range);
}

export async function handleFundamentals(symbol: string): Promise<string> {
  const data = await fetchFundamentals(symbol);
  return formatFundamentals(data);
}

export async function handleCompareStocks(symbols: string[], includeTA: boolean = false): Promise<string> {
  const entries: ComparisonEntry[] = [];

  const results = await Promise.allSettled(
    symbols.map(async (sym) => {
      const [quote, fundamentals] = await Promise.allSettled([
        fetchQuote(sym),
        fetchFundamentals(sym),
      ]);

      const q = quote.status === "fulfilled" ? quote.value : null;
      const f = fundamentals.status === "fulfilled" ? fundamentals.value : null;

      let signal: string | undefined;
      if (includeTA) {
        try {
          const { bars } = await fetchOHLCV(sym, "3mo", "1d");
          if (bars.length >= 30) {
            const ind = computeAllIndicators(bars);
            const sig = generateSignal(bars, ind);
            signal = sig.rating;
          }
        } catch { /* skip TA if fails */ }
      }

      return {
        symbol: sym.toUpperCase(),
        name: q?.name || f?.name || sym,
        price: q?.price || 0,
        changePercent: q?.changePercent || 0,
        marketCap: f?.marketCap || 0,
        peRatio: f?.peRatio || 0,
        revenue: f?.revenue || 0,
        profitMargin: f?.profitMargin || 0,
        revenueGrowth: f?.revenueGrowth || 0,
        beta: f?.beta || 0,
        signal,
      } as ComparisonEntry;
    })
  );

  for (const r of results) {
    if (r.status === "fulfilled") entries.push(r.value);
  }

  return formatComparison(entries);
}

const SECTOR_ETFS: { name: string; etf: string }[] = [
  { name: "Technology", etf: "XLK" },
  { name: "Financials", etf: "XLF" },
  { name: "Healthcare", etf: "XLV" },
  { name: "Energy", etf: "XLE" },
  { name: "Industrials", etf: "XLI" },
  { name: "Communication", etf: "XLC" },
  { name: "Consumer Disc.", etf: "XLY" },
  { name: "Consumer Staples", etf: "XLP" },
  { name: "Utilities", etf: "XLU" },
  { name: "Real Estate", etf: "XLRE" },
  { name: "Materials", etf: "XLB" },
];

export async function handleSectorPerformance(range: TimeRange): Promise<string> {
  const entries: SectorEntry[] = [];

  const results = await Promise.allSettled(
    SECTOR_ETFS.map(async ({ name, etf }) => {
      const { bars } = await fetchOHLCV(etf, range, "1d");
      if (bars.length < 2) return null;
      const first = bars[0].close;
      const last = bars[bars.length - 1].close;
      const returnPercent = ((last - first) / first) * 100;
      return { name, etf, returnPercent, price: last } as SectorEntry;
    })
  );

  for (const r of results) {
    if (r.status === "fulfilled" && r.value) entries.push(r.value);
  }

  return formatSectorPerformance(entries, range);
}

export async function handleVolumeAnalysis(symbol: string, range: TimeRange): Promise<string> {
  const { bars, meta } = await fetchOHLCV(symbol, range, "1d");
  if (bars.length < 20) return `Insufficient data for volume analysis on ${symbol}.`;

  const indicators = computeAllIndicators(bars);
  return formatVolumeAnalysis(meta.symbol || symbol.toUpperCase(), bars, indicators.volume);
}

export async function handleEarnings(symbol: string): Promise<string> {
  const data = await fetchEarnings(symbol);
  return formatEarnings(data);
}

export async function handleOptionsFlow(symbol: string): Promise<string> {
  const data = await fetchOptionsChain(symbol);
  return formatOptionsAnalysis(data);
}

export async function handleMacroContext(): Promise<string> {
  const data = await fetchMacroContext();
  return formatMacroContext(data);
}

// Re-export types used by chatStore
export type { StockQuote, TimeRange, Interval, AnalysisTimeframe } from "./types";
