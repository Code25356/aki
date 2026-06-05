import { invoke } from "@tauri-apps/api/core";

export interface OptionContract {
  strike: number;
  expiration: string;
  type: "call" | "put";
  lastPrice: number;
  volume: number;
  openInterest: number;
  impliedVolatility: number;
  inTheMoney: boolean;
}

export interface OptionsAnalysis {
  symbol: string;
  currentPrice: number;
  putCallRatio: number;
  totalCallVolume: number;
  totalPutVolume: number;
  totalCallOI: number;
  totalPutOI: number;
  maxPain: number;
  avgIV: number;
  ivRank: string; // "high", "medium", "low" relative to historical
  unusualActivity: UnusualOption[];
  expirations: string[];
  nearestExpiry: string;
}

export interface UnusualOption {
  strike: number;
  type: "call" | "put";
  volume: number;
  openInterest: number;
  volumeOIRatio: number;
  impliedVolatility: number;
  description: string;
}

async function fetchJson(url: string): Promise<any> {
  const body = await invoke<string>("fetch_url", { url });
  return JSON.parse(body);
}

export async function fetchOptionsChain(symbol: string): Promise<OptionsAnalysis> {
  // Fetch options chain (nearest expiration by default)
  const url = `https://query1.finance.yahoo.com/v7/finance/options/${encodeURIComponent(symbol.toUpperCase())}`;
  const data = await fetchJson(url);

  const result = data.optionChain?.result?.[0];
  if (!result) throw new Error(`No options data for "${symbol}"`);

  const quote = result.quote || {};
  const currentPrice = quote.regularMarketPrice || 0;
  const expirations = (result.expirationDates || []).map((ts: number) =>
    new Date(ts * 1000).toISOString().split("T")[0]
  );

  const options = result.options?.[0];
  if (!options) throw new Error(`No options chain available for "${symbol}"`);

  const calls: OptionContract[] = (options.calls || []).map((c: any) => ({
    strike: c.strike,
    expiration: new Date((c.expiration || 0) * 1000).toISOString().split("T")[0],
    type: "call" as const,
    lastPrice: c.lastPrice || 0,
    volume: c.volume || 0,
    openInterest: c.openInterest || 0,
    impliedVolatility: c.impliedVolatility || 0,
    inTheMoney: c.inTheMoney || false,
  }));

  const puts: OptionContract[] = (options.puts || []).map((p: any) => ({
    strike: p.strike,
    expiration: new Date((p.expiration || 0) * 1000).toISOString().split("T")[0],
    type: "put" as const,
    lastPrice: p.lastPrice || 0,
    volume: p.volume || 0,
    openInterest: p.openInterest || 0,
    impliedVolatility: p.impliedVolatility || 0,
    inTheMoney: p.inTheMoney || false,
  }));

  // Aggregate metrics
  const totalCallVolume = calls.reduce((a, c) => a + c.volume, 0);
  const totalPutVolume = puts.reduce((a, p) => a + p.volume, 0);
  const totalCallOI = calls.reduce((a, c) => a + c.openInterest, 0);
  const totalPutOI = puts.reduce((a, p) => a + p.openInterest, 0);
  const putCallRatio = totalCallVolume > 0 ? totalPutVolume / totalCallVolume : 0;

  // Average IV (weighted by OI)
  const allContracts = [...calls, ...puts];
  const totalOI = allContracts.reduce((a, c) => a + c.openInterest, 0);
  const avgIV = totalOI > 0
    ? allContracts.reduce((a, c) => a + c.impliedVolatility * c.openInterest, 0) / totalOI
    : 0;

  // IV rank approximation (compare to typical ranges)
  const ivRank = avgIV > 0.6 ? "high" : avgIV > 0.3 ? "medium" : "low";

  // Max Pain: strike where most options expire worthless (max combined OI pain for buyers)
  const strikes = [...new Set([...calls.map((c) => c.strike), ...puts.map((p) => p.strike)])].sort((a, b) => a - b);
  let maxPain = currentPrice;
  let maxPainValue = Infinity;

  for (const strike of strikes) {
    let pain = 0;
    // Call buyers lose when price below strike
    for (const c of calls) {
      if (strike < c.strike) pain += c.openInterest * (c.strike - strike);
    }
    // Put buyers lose when price above strike
    for (const p of puts) {
      if (strike > p.strike) pain += p.openInterest * (strike - p.strike);
    }
    // Actually max pain is where TOTAL pain for option BUYERS is maximized
    // That means where sellers profit most = where total option value is minimized
    let totalValue = 0;
    for (const c of calls) {
      if (strike > c.strike) totalValue += c.openInterest * (strike - c.strike);
    }
    for (const p of puts) {
      if (strike < p.strike) totalValue += p.openInterest * (p.strike - strike);
    }
    if (totalValue < maxPainValue) {
      maxPainValue = totalValue;
      maxPain = strike;
    }
  }

  // Unusual activity: high volume/OI ratio
  const unusualActivity: UnusualOption[] = [];
  for (const contract of allContracts) {
    if (contract.volume > 100 && contract.openInterest > 0) {
      const ratio = contract.volume / contract.openInterest;
      if (ratio > 3) {
        unusualActivity.push({
          strike: contract.strike,
          type: contract.type,
          volume: contract.volume,
          openInterest: contract.openInterest,
          volumeOIRatio: ratio,
          impliedVolatility: contract.impliedVolatility,
          description: `${contract.type.toUpperCase()} $${contract.strike} — ${contract.volume} vol vs ${contract.openInterest} OI (${ratio.toFixed(1)}x)`,
        });
      }
    }
  }
  unusualActivity.sort((a, b) => b.volumeOIRatio - a.volumeOIRatio);

  return {
    symbol: symbol.toUpperCase(),
    currentPrice,
    putCallRatio,
    totalCallVolume,
    totalPutVolume,
    totalCallOI,
    totalPutOI,
    maxPain,
    avgIV,
    ivRank,
    unusualActivity: unusualActivity.slice(0, 10),
    expirations,
    nearestExpiry: expirations[0] || "N/A",
  };
}

export function formatOptionsAnalysis(data: OptionsAnalysis): string {
  const lines: string[] = [];

  lines.push(`═══ OPTIONS FLOW: ${data.symbol} @ $${data.currentPrice.toFixed(2)} ═══\n`);

  // Key metrics
  lines.push("── KEY METRICS ──");
  lines.push(`Put/Call Ratio: ${data.putCallRatio.toFixed(2)} (${data.putCallRatio > 1 ? "bearish skew" : data.putCallRatio < 0.7 ? "bullish skew" : "neutral"})`);
  lines.push(`Max Pain: $${data.maxPain.toFixed(2)} (${data.maxPain > data.currentPrice ? "above" : "below"} current price by ${Math.abs(((data.maxPain - data.currentPrice) / data.currentPrice) * 100).toFixed(1)}%)`);
  lines.push(`Avg Implied Volatility: ${(data.avgIV * 100).toFixed(1)}% (${data.ivRank})`);
  lines.push(`Nearest Expiry: ${data.nearestExpiry}`);
  lines.push("");

  // Volume breakdown
  lines.push("── VOLUME & OPEN INTEREST ──");
  lines.push(`Call Volume: ${data.totalCallVolume.toLocaleString()} | Call OI: ${data.totalCallOI.toLocaleString()}`);
  lines.push(`Put Volume: ${data.totalPutVolume.toLocaleString()} | Put OI: ${data.totalPutOI.toLocaleString()}`);
  lines.push(`Total Volume: ${(data.totalCallVolume + data.totalPutVolume).toLocaleString()}`);
  lines.push("");

  // Unusual activity
  if (data.unusualActivity.length > 0) {
    lines.push("── UNUSUAL ACTIVITY (Vol/OI > 3x) ──");
    for (const ua of data.unusualActivity.slice(0, 7)) {
      lines.push(`• ${ua.description} | IV: ${(ua.impliedVolatility * 100).toFixed(0)}%`);
    }
    lines.push("");
  }

  // Interpretation
  lines.push("── INTERPRETATION ──");

  if (data.putCallRatio > 1.2) {
    lines.push("• High put/call ratio — hedging or bearish bets. Could be contrarian bullish signal if extreme.");
  } else if (data.putCallRatio < 0.6) {
    lines.push("• Low put/call ratio — heavy call buying. Bullish sentiment, but could signal excessive optimism.");
  } else {
    lines.push("• Put/call ratio neutral — no extreme positioning.");
  }

  const maxPainDist = ((data.maxPain - data.currentPrice) / data.currentPrice) * 100;
  if (Math.abs(maxPainDist) > 3) {
    lines.push(`• Max pain ${maxPainDist > 0 ? "above" : "below"} price by ${Math.abs(maxPainDist).toFixed(1)}% — price may gravitate toward $${data.maxPain.toFixed(2)} by expiry (market maker pinning).`);
  }

  if (data.ivRank === "high") {
    lines.push("• IV is elevated — options are expensive. Selling strategies (covered calls, iron condors) may be attractive. Earnings or catalyst likely priced in.");
  } else if (data.ivRank === "low") {
    lines.push("• IV is low — options are cheap. Good time to buy protection or make directional bets.");
  }

  if (data.unusualActivity.length > 3) {
    const callActivity = data.unusualActivity.filter((u) => u.type === "call");
    const putActivity = data.unusualActivity.filter((u) => u.type === "put");
    if (callActivity.length > putActivity.length * 2) {
      lines.push("• Unusual call activity dominates — institutional money betting on upside.");
    } else if (putActivity.length > callActivity.length * 2) {
      lines.push("• Unusual put activity dominates — institutional hedging or bearish bets.");
    }
  }

  return lines.join("\n");
}
