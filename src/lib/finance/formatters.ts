import type { StockQuote, TechnicalReport, FundamentalsData, ComparisonEntry, SectorEntry, OHLCVBar } from "./types";

function fmt(n: number, decimals: number = 2): string {
  return n.toFixed(decimals);
}

function fmtLarge(n: number): string {
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  return `$${n.toLocaleString()}`;
}

function pct(n: number): string {
  const sign = n >= 0 ? "+" : "";
  return `${sign}${(n * 100).toFixed(1)}%`;
}

function arrow(val: number): string {
  return val > 0 ? "↑" : val < 0 ? "↓" : "→";
}

// ─── Quote Format ───────────────────────────────────────────────

export function formatQuote(quote: StockQuote): string {
  const dir = quote.change >= 0 ? "+" : "";
  return [
    `**${quote.symbol}** — ${quote.name}`,
    `Price: $${fmt(quote.price)} (${dir}${fmt(quote.change)}, ${dir}${fmt(quote.changePercent)}%)`,
    `Open: $${fmt(quote.open)} | High: $${fmt(quote.high)} | Low: $${fmt(quote.low)}`,
    `Prev Close: $${fmt(quote.previousClose)} | Volume: ${quote.volume.toLocaleString()}`,
  ].join("\n");
}

export function formatMultipleQuotes(quotes: StockQuote[]): string {
  if (quotes.length === 0) return "No quotes found.";
  return quotes.map(formatQuote).join("\n\n");
}

// ─── Technical Analysis Report ──────────────────────────────────

export function formatTechnicalReport(report: TechnicalReport): string {
  const { indicators: ind, signal, price } = report;
  const lines: string[] = [];

  lines.push(`═══ TECHNICAL ANALYSIS: ${report.symbol} ═══`);
  lines.push(`Timeframe: ${report.timeframe} | Last: $${fmt(price)}`);
  lines.push("");

  // TREND
  lines.push("── TREND ──");
  lines.push(`SMA(20): $${fmt(ind.sma20)} (price ${fmt(((price - ind.sma20) / ind.sma20) * 100)}% ${price > ind.sma20 ? "above" : "below"}) ${arrow(price - ind.sma20)}`);
  lines.push(`SMA(50): $${fmt(ind.sma50)} (price ${fmt(((price - ind.sma50) / ind.sma50) * 100)}% ${price > ind.sma50 ? "above" : "below"}) ${arrow(price - ind.sma50)}`);
  lines.push(`SMA(200): $${fmt(ind.sma200)} (price ${fmt(((price - ind.sma200) / ind.sma200) * 100)}% ${price > ind.sma200 ? "above" : "below"}) ${arrow(price - ind.sma200)}`);
  const trendNote = ind.goldenCross ? `golden cross ${ind.crossDaysAgo} days ago` :
                    ind.deathCross ? `death cross ${ind.crossDaysAgo} days ago` : "";
  lines.push(`Trend: ${ind.trendAlignment.toUpperCase()}${trendNote ? ` (${trendNote})` : ""}`);
  lines.push("");

  // MOMENTUM
  lines.push("── MOMENTUM ──");
  const rsiZone = ind.rsi > 70 ? "overbought" : ind.rsi < 30 ? "oversold" : ind.rsi > 60 ? "bullish" : ind.rsi < 40 ? "bearish" : "neutral";
  lines.push(`RSI(14): ${fmt(ind.rsi, 1)} (${rsiZone})`);
  lines.push(`Stochastic: %K=${fmt(ind.stochastic.k, 1)}, %D=${fmt(ind.stochastic.d, 1)} (${ind.stochastic.crossover !== "none" ? ind.stochastic.crossover + " crossover" : "no crossover"})`);
  lines.push(`ROC(14): ${fmt(ind.roc, 1)}% (${ind.roc > 0 ? "positive" : "negative"} momentum)`);
  lines.push("");

  // MACD
  lines.push("── MACD ──");
  lines.push(`MACD: ${fmt(ind.macd.macd)} | Signal: ${fmt(ind.macd.signal)} | Histogram: ${fmt(ind.macd.histogram)} (${ind.macd.histogram > 0 ? "expanding" : "contracting"})`);
  const macdStatus = ind.macd.crossover !== "none"
    ? `${ind.macd.crossover} crossover ${ind.macd.crossoverBarsAgo} bars ago`
    : `no recent crossover`;
  lines.push(`Status: ${macdStatus}, histogram ${ind.macd.histogram > 0 ? "positive" : "negative"}`);
  lines.push("");

  // VOLATILITY
  lines.push("── VOLATILITY ──");
  lines.push(`Bollinger: Upper=$${fmt(ind.bollinger.upper)} | Mid=$${fmt(ind.bollinger.middle)} | Lower=$${fmt(ind.bollinger.lower)}`);
  lines.push(`Position: ${fmt(ind.bollinger.percentB, 0)}% (${ind.bollinger.percentB > 80 ? "near upper band" : ind.bollinger.percentB < 20 ? "near lower band" : "mid-band"}) | Bandwidth: ${fmt(ind.bollinger.bandwidth)}%${ind.bollinger.squeeze ? " (SQUEEZE)" : ""}`);
  lines.push(`ATR(14): $${fmt(ind.atr)} (${ind.atr / price > 0.03 ? "high" : ind.atr / price > 0.015 ? "moderate" : "low"} volatility)`);
  lines.push("");

  // VOLUME
  lines.push("── VOLUME ──");
  lines.push(`OBV Trend: ${ind.volume.obvTrend} ${arrow(ind.volume.obvTrend === "rising" ? 1 : ind.volume.obvTrend === "falling" ? -1 : 0)}`);
  lines.push(`Relative Volume: ${fmt(ind.volume.relativeVolume, 1)}x (${ind.volume.relativeVolume > 1.5 ? "high" : ind.volume.relativeVolume < 0.5 ? "low" : "average"})`);
  lines.push(`Accumulation/Distribution: ${ind.volume.adTrend}`);
  lines.push("");

  // KEY LEVELS
  lines.push("── KEY LEVELS ──");
  if (ind.supportResistance.resistances.length > 0) {
    lines.push(`Resistance: ${ind.supportResistance.resistances.map((r) => `$${fmt(r)}`).join(", ")}`);
  }
  if (ind.supportResistance.supports.length > 0) {
    lines.push(`Support: ${ind.supportResistance.supports.map((s) => `$${fmt(s)}`).join(", ")}`);
  }
  const fibLevels = ind.fibonacci.levels.filter((l) => l.ratio > 0 && l.ratio < 1);
  lines.push(`Fibonacci: ${fibLevels.map((l) => `${(l.ratio * 100).toFixed(1)}% at $${fmt(l.price)}`).join(", ")}`);
  lines.push("");

  // SIGNAL
  lines.push("═══ SIGNAL ═══");
  lines.push(`Rating: ${signal.rating} | Confidence: ${signal.confidence}% | Score: ${signal.score > 0 ? "+" : ""}${fmt(signal.score)}`);
  if (signal.reasons.length > 0) {
    lines.push("Reasons:");
    for (const r of signal.reasons) lines.push(`• ${r}`);
  }
  if (signal.watchLevels.length > 0) {
    lines.push(`Watch: ${signal.watchLevels.map((l) => `${l.label} $${fmt(l.price)}`).join(" | ")}`);
  }
  if (signal.risks.length > 0) {
    lines.push("Risks:");
    for (const r of signal.risks) lines.push(`⚠ ${r}`);
  }

  return lines.join("\n");
}

// ─── Fundamentals Format ────────────────────────────────────────

export function formatFundamentals(data: FundamentalsData): string {
  const lines: string[] = [];

  lines.push(`═══ FUNDAMENTALS: ${data.symbol} ═══`);
  lines.push(`${data.name} | ${data.sector} — ${data.industry}`);
  lines.push("");

  lines.push("── VALUATION ──");
  lines.push(`Market Cap: ${fmtLarge(data.marketCap)} | EV: ${fmtLarge(data.enterpriseValue)}`);
  lines.push(`P/E (trailing): ${fmt(data.peRatio)} | P/E (forward): ${fmt(data.forwardPE)} | PEG: ${fmt(data.pegRatio)}`);
  lines.push(`Price/Book: ${fmt(data.priceToBook)} | Price/Sales: ${fmt(data.priceToSales)}`);
  lines.push("");

  lines.push("── EARNINGS ──");
  lines.push(`EPS (TTM): $${fmt(data.eps)} | EPS (Forward): $${fmt(data.forwardEps)}`);
  lines.push(`Revenue: ${fmtLarge(data.revenue)} | Revenue Growth: ${pct(data.revenueGrowth)}`);
  lines.push("");

  lines.push("── MARGINS & PROFITABILITY ──");
  lines.push(`Gross: ${pct(data.grossMargin)} | Operating: ${pct(data.operatingMargin)} | Net: ${pct(data.profitMargin)}`);
  lines.push(`ROE: ${pct(data.roe)} | FCF: ${fmtLarge(data.freeCashFlow)}`);
  lines.push("");

  lines.push("── FINANCIAL HEALTH ──");
  lines.push(`Debt/Equity: ${fmt(data.debtToEquity)} | Current Ratio: ${fmt(data.currentRatio)}`);
  lines.push(`Beta: ${fmt(data.beta)} | Dividend Yield: ${data.dividendYield > 0 ? pct(data.dividendYield) : "None"}`);
  lines.push("");

  lines.push("── PRICE CONTEXT ──");
  lines.push(`52-Week: $${fmt(data.fiftyTwoWeekLow)} — $${fmt(data.fiftyTwoWeekHigh)}`);
  lines.push(`Avg Volume: ${data.averageVolume.toLocaleString()}`);
  if (data.targetPrice > 0) lines.push(`Analyst Target: $${fmt(data.targetPrice)} | Recommendation: ${data.recommendationKey || "N/A"}`);

  return lines.join("\n");
}

// ─── Comparison Format ──────────────────────────────────────────

export function formatComparison(entries: ComparisonEntry[]): string {
  if (entries.length === 0) return "No comparison data.";

  const lines: string[] = [];
  lines.push("═══ STOCK COMPARISON ═══\n");

  // Table header
  const header = "Symbol     | Price      | Change  | Mkt Cap    | P/E    | Revenue    | Margin | Growth | Signal";
  const sep    = "-----------|------------|---------|------------|--------|------------|--------|--------|-------";
  lines.push(header);
  lines.push(sep);

  for (const e of entries) {
    const row = [
      e.symbol.padEnd(10),
      `$${fmt(e.price)}`.padEnd(11),
      `${e.changePercent >= 0 ? "+" : ""}${fmt(e.changePercent)}%`.padEnd(7),
      fmtLarge(e.marketCap).padEnd(11),
      fmt(e.peRatio).padEnd(6),
      fmtLarge(e.revenue).padEnd(11),
      pct(e.profitMargin).padEnd(6),
      pct(e.revenueGrowth).padEnd(6),
      (e.signal || "—").padEnd(6),
    ].join(" | ");
    lines.push(row);
  }

  // Rankings
  lines.push("\n── RANKINGS ──");
  const byGrowth = [...entries].sort((a, b) => b.revenueGrowth - a.revenueGrowth);
  lines.push(`Fastest Growing: ${byGrowth[0]?.symbol} (${pct(byGrowth[0]?.revenueGrowth)})`);
  const byMargin = [...entries].sort((a, b) => b.profitMargin - a.profitMargin);
  lines.push(`Highest Margin: ${byMargin[0]?.symbol} (${pct(byMargin[0]?.profitMargin)})`);
  const byCap = [...entries].sort((a, b) => b.marketCap - a.marketCap);
  lines.push(`Largest: ${byCap[0]?.symbol} (${fmtLarge(byCap[0]?.marketCap)})`);

  return lines.join("\n");
}

// ─── Sector Format ──────────────────────────────────────────────

export function formatSectorPerformance(sectors: SectorEntry[], range: string): string {
  const sorted = [...sectors].sort((a, b) => b.returnPercent - a.returnPercent);

  const lines: string[] = [];
  lines.push(`═══ SECTOR PERFORMANCE (${range}) ═══\n`);
  lines.push("Rank | Sector               | ETF  | Return");
  lines.push("-----|----------------------|------|--------");

  sorted.forEach((s, i) => {
    const ret = `${s.returnPercent >= 0 ? "+" : ""}${fmt(s.returnPercent)}%`;
    lines.push(`${String(i + 1).padEnd(4)} | ${s.name.padEnd(20)} | ${s.etf.padEnd(4)} | ${ret}`);
  });

  lines.push(`\nStrongest: ${sorted[0]?.name} (${sorted[0]?.etf})`);
  lines.push(`Weakest: ${sorted[sorted.length - 1]?.name} (${sorted[sorted.length - 1]?.etf})`);

  return lines.join("\n");
}

// ─── Historical Data Format ─────────────────────────────────────

export function formatHistorical(symbol: string, bars: OHLCVBar[], range: string): string {
  if (bars.length === 0) return "No historical data.";

  const first = bars[0];
  const last = bars[bars.length - 1];
  const totalReturn = ((last.close - first.close) / first.close) * 100;
  const high = Math.max(...bars.map((b) => b.high));
  const low = Math.min(...bars.map((b) => b.low));
  const avgVol = bars.reduce((a, b) => a + b.volume, 0) / bars.length;

  const lines: string[] = [];
  lines.push(`═══ HISTORICAL: ${symbol} (${range}) ═══\n`);
  lines.push(`Period Return: ${totalReturn >= 0 ? "+" : ""}${fmt(totalReturn)}%`);
  lines.push(`Start: $${fmt(first.close)} → End: $${fmt(last.close)}`);
  lines.push(`Period High: $${fmt(high)} | Period Low: $${fmt(low)}`);
  lines.push(`Max Drawdown: ${fmt(((low - high) / high) * 100)}%`);
  lines.push(`Avg Daily Volume: ${Math.round(avgVol).toLocaleString()}`);
  lines.push("");

  // Monthly breakdown (if enough data)
  if (bars.length > 20) {
    lines.push("── MONTHLY BREAKDOWN ──");
    const months = new Map<string, { open: number; close: number; high: number; low: number }>();
    for (const bar of bars) {
      const d = new Date(bar.timestamp * 1000);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const existing = months.get(key);
      if (!existing) {
        months.set(key, { open: bar.open, close: bar.close, high: bar.high, low: bar.low });
      } else {
        existing.close = bar.close;
        existing.high = Math.max(existing.high, bar.high);
        existing.low = Math.min(existing.low, bar.low);
      }
    }

    for (const [month, data] of months) {
      const ret = ((data.close - data.open) / data.open) * 100;
      lines.push(`${month}: ${ret >= 0 ? "+" : ""}${fmt(ret)}% ($${fmt(data.open)} → $${fmt(data.close)})`);
    }
  }

  return lines.join("\n");
}

// ─── Volume Analysis Format ─────────────────────────────────────

export function formatVolumeAnalysis(symbol: string, bars: OHLCVBar[], volume: import("./types").VolumeAnalysis): string {
  const lines: string[] = [];
  const last = bars[bars.length - 1];

  lines.push(`═══ VOLUME ANALYSIS: ${symbol} ═══\n`);
  lines.push(`Current Volume: ${last.volume.toLocaleString()}`);
  lines.push(`Relative Volume: ${fmt(volume.relativeVolume, 1)}x vs 20-day average`);
  lines.push(`OBV Trend: ${volume.obvTrend} ${arrow(volume.obvTrend === "rising" ? 1 : volume.obvTrend === "falling" ? -1 : 0)}`);
  lines.push(`A/D Line: ${volume.adTrend}`);
  lines.push("");

  // Interpretation
  lines.push("── INTERPRETATION ──");
  if (volume.obvTrend === "rising" && last.close > bars[bars.length - 20]?.close) {
    lines.push("• OBV confirms uptrend — smart money accumulating");
  } else if (volume.obvTrend === "falling" && last.close < bars[bars.length - 20]?.close) {
    lines.push("• OBV confirms downtrend — institutional selling");
  } else if (volume.obvTrend === "falling" && last.close > bars[bars.length - 20]?.close) {
    lines.push("• WARNING: Price rising on declining OBV — potential distribution (bearish divergence)");
  } else if (volume.obvTrend === "rising" && last.close < bars[bars.length - 20]?.close) {
    lines.push("• Price falling but OBV rising — potential accumulation (bullish divergence)");
  }

  if (volume.relativeVolume > 2) lines.push("• Unusually high volume — significant institutional activity");
  else if (volume.relativeVolume > 1.3) lines.push("• Above-average volume — confirms current move");
  else if (volume.relativeVolume < 0.5) lines.push("• Very low volume — lack of conviction, move may not sustain");

  return lines.join("\n");
}
