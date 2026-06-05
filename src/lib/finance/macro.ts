import { invoke } from "@tauri-apps/api/core";
import { fetchOHLCV } from "./api";

export interface MacroData {
  vix: { price: number; change: number; level: string };
  yieldCurve: {
    twoYear: number;
    tenYear: number;
    spread: number;
    inverted: boolean;
  };
  sp500: { price: number; changePercent: number; aboveSma200: boolean };
  marketBreadth: {
    rspVsSpy: number; // equal-weight vs cap-weight divergence
    interpretation: string;
  };
  dollarIndex: { price: number; changePercent: number };
  fearGreed: {
    score: number; // 0-100
    label: string;
  };
}

async function fetchJson(url: string): Promise<any> {
  const body = await invoke<string>("fetch_url", { url });
  return JSON.parse(body);
}

async function getQuotePrice(symbol: string): Promise<{ price: number; change: number; changePercent: number; prevClose: number }> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
  const data = await fetchJson(url);
  const meta = data.chart?.result?.[0]?.meta;
  if (!meta) return { price: 0, change: 0, changePercent: 0, prevClose: 0 };
  const price = meta.regularMarketPrice || 0;
  const prevClose = meta.chartPreviousClose || meta.previousClose || price;
  const change = price - prevClose;
  const changePercent = prevClose ? (change / prevClose) * 100 : 0;
  return { price, change, changePercent, prevClose };
}

export async function fetchMacroContext(): Promise<MacroData> {
  // Fetch all macro indicators in parallel
  const [vixData, tnxData, twoYrData, spyData, rspData, dxyData] = await Promise.allSettled([
    getQuotePrice("^VIX"),
    getQuotePrice("^TNX"),      // 10-year yield
    getQuotePrice("^IRX"),      // 13-week T-bill (proxy for short end; 2yr via TWO isn't on Yahoo as ^)
    getQuotePrice("SPY"),
    getQuotePrice("RSP"),       // Equal-weight S&P 500
    getQuotePrice("DX-Y.NYB"), // US Dollar Index
  ]);

  const vix = vixData.status === "fulfilled" ? vixData.value : { price: 0, change: 0, changePercent: 0, prevClose: 0 };
  const tnx = tnxData.status === "fulfilled" ? tnxData.value : { price: 0, change: 0, changePercent: 0, prevClose: 0 };
  const twoYr = twoYrData.status === "fulfilled" ? twoYrData.value : { price: 0, change: 0, changePercent: 0, prevClose: 0 };
  const spy = spyData.status === "fulfilled" ? spyData.value : { price: 0, change: 0, changePercent: 0, prevClose: 0 };
  const rsp = rspData.status === "fulfilled" ? rspData.value : { price: 0, change: 0, changePercent: 0, prevClose: 0 };
  const dxy = dxyData.status === "fulfilled" ? dxyData.value : { price: 0, change: 0, changePercent: 0, prevClose: 0 };

  // VIX level interpretation
  const vixLevel = vix.price > 30 ? "extreme fear" :
                   vix.price > 20 ? "elevated" :
                   vix.price > 15 ? "normal" : "complacent";

  // Yield curve (10yr - 13wk as proxy for 2yr)
  // ^TNX is in % points (e.g. 4.5 = 4.5%), ^IRX is in % too
  const tenYear = tnx.price;
  const shortRate = twoYr.price;
  const spread = tenYear - shortRate;
  const inverted = spread < 0;

  // SPY vs SMA200
  let aboveSma200 = true;
  try {
    const { bars } = await fetchOHLCV("SPY", "1y", "1d");
    if (bars.length >= 200) {
      const sma200 = bars.slice(-200).reduce((a, b) => a + b.close, 0) / 200;
      aboveSma200 = spy.price > sma200;
    }
  } catch { /* fallback */ }

  // Market breadth: RSP vs SPY performance divergence
  const rspVsSpy = rsp.changePercent - spy.changePercent;
  const breadthInterpretation = rspVsSpy > 0.3
    ? "broad-based rally (healthy)"
    : rspVsSpy < -0.3
    ? "narrow leadership (fragile, mega-caps only)"
    : "balanced participation";

  // Fear & Greed composite score (simplified)
  let fearGreedScore = 50;
  // VIX component (lower VIX = more greed)
  if (vix.price < 12) fearGreedScore += 20;
  else if (vix.price < 15) fearGreedScore += 10;
  else if (vix.price > 25) fearGreedScore -= 20;
  else if (vix.price > 20) fearGreedScore -= 10;
  // Trend component
  if (aboveSma200) fearGreedScore += 10;
  else fearGreedScore -= 10;
  // Breadth component
  if (rspVsSpy > 0) fearGreedScore += 5;
  else fearGreedScore -= 5;
  // Yield curve
  if (inverted) fearGreedScore -= 10;
  else fearGreedScore += 5;

  fearGreedScore = Math.max(0, Math.min(100, fearGreedScore));
  const fearGreedLabel = fearGreedScore >= 75 ? "Extreme Greed" :
                         fearGreedScore >= 55 ? "Greed" :
                         fearGreedScore >= 45 ? "Neutral" :
                         fearGreedScore >= 25 ? "Fear" : "Extreme Fear";

  return {
    vix: { price: vix.price, change: vix.change, level: vixLevel },
    yieldCurve: { twoYear: shortRate, tenYear, spread, inverted },
    sp500: { price: spy.price, changePercent: spy.changePercent, aboveSma200 },
    marketBreadth: { rspVsSpy, interpretation: breadthInterpretation },
    dollarIndex: { price: dxy.price, changePercent: dxy.changePercent },
    fearGreed: { score: fearGreedScore, label: fearGreedLabel },
  };
}

export function formatMacroContext(data: MacroData): string {
  const lines: string[] = [];

  lines.push("═══ MACRO CONTEXT ═══\n");

  // Fear & Greed
  const fgBar = "█".repeat(Math.round(data.fearGreed.score / 5)) + "░".repeat(20 - Math.round(data.fearGreed.score / 5));
  lines.push(`Fear & Greed: [${fgBar}] ${data.fearGreed.score}/100 — ${data.fearGreed.label}`);
  lines.push("");

  // VIX
  lines.push("── VOLATILITY (VIX) ──");
  lines.push(`VIX: ${data.vix.price.toFixed(2)} (${data.vix.change >= 0 ? "+" : ""}${data.vix.change.toFixed(2)}) — ${data.vix.level}`);
  if (data.vix.price > 25) {
    lines.push("⚠ Elevated fear — larger daily swings expected, consider smaller position sizes");
  } else if (data.vix.price < 13) {
    lines.push("⚠ Complacency — historically low vol often precedes sharp moves, consider hedges");
  }
  lines.push("");

  // Yield Curve
  lines.push("── YIELD CURVE ──");
  lines.push(`10-Year: ${data.yieldCurve.tenYear.toFixed(2)}% | Short-Term: ${data.yieldCurve.twoYear.toFixed(2)}%`);
  lines.push(`Spread: ${data.yieldCurve.spread >= 0 ? "+" : ""}${data.yieldCurve.spread.toFixed(2)}% ${data.yieldCurve.inverted ? "(INVERTED ⚠)" : "(normal)"}`);
  if (data.yieldCurve.inverted) {
    lines.push("⚠ Inverted yield curve — historically precedes recession within 12-18 months");
  } else if (data.yieldCurve.spread < 0.5) {
    lines.push("Curve is flat — late-cycle indicator, growth may be slowing");
  } else {
    lines.push("Normal curve — economic expansion conditions");
  }
  lines.push("");

  // S&P 500 / Market
  lines.push("── MARKET TREND ──");
  lines.push(`S&P 500 (SPY): $${data.sp500.price.toFixed(2)} (${data.sp500.changePercent >= 0 ? "+" : ""}${data.sp500.changePercent.toFixed(2)}% today)`);
  lines.push(`Above 200-day SMA: ${data.sp500.aboveSma200 ? "YES ✓ (bullish regime)" : "NO ✗ (bearish regime)"}`);
  lines.push("");

  // Breadth
  lines.push("── MARKET BREADTH ──");
  lines.push(`Equal-Weight vs Cap-Weight: ${data.marketBreadth.rspVsSpy >= 0 ? "+" : ""}${data.marketBreadth.rspVsSpy.toFixed(2)}%`);
  lines.push(`Interpretation: ${data.marketBreadth.interpretation}`);
  lines.push("");

  // Dollar
  lines.push("── US DOLLAR ──");
  lines.push(`Dollar Index: ${data.dollarIndex.price.toFixed(2)} (${data.dollarIndex.changePercent >= 0 ? "+" : ""}${data.dollarIndex.changePercent.toFixed(2)}%)`);
  if (data.dollarIndex.changePercent > 0.5) {
    lines.push("Strong dollar — headwind for multinationals and emerging markets");
  } else if (data.dollarIndex.changePercent < -0.5) {
    lines.push("Weak dollar — tailwind for exporters and commodities");
  }
  lines.push("");

  // Summary
  lines.push("── REGIME SUMMARY ──");
  const regime: string[] = [];
  if (data.sp500.aboveSma200) regime.push("uptrend");
  else regime.push("downtrend");
  if (data.vix.level === "complacent" || data.vix.level === "normal") regime.push("low vol");
  else regime.push("high vol");
  if (data.yieldCurve.inverted) regime.push("inverted curve");
  else regime.push("normal curve");
  regime.push(data.marketBreadth.interpretation);
  lines.push(`Current regime: ${regime.join(" | ")}`);

  // Actionable takeaway
  if (data.sp500.aboveSma200 && data.vix.price < 20 && !data.yieldCurve.inverted) {
    lines.push("\n→ RISK-ON environment. Favor equities, growth over value.");
  } else if (!data.sp500.aboveSma200 || data.vix.price > 25) {
    lines.push("\n→ RISK-OFF environment. Favor cash, bonds, defensive sectors. Reduce position sizes.");
  } else {
    lines.push("\n→ MIXED environment. Be selective, favor quality names with strong fundamentals.");
  }

  return lines.join("\n");
}
