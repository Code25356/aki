import type { TechnicalIndicators, Signal, SignalRating, OHLCVBar } from "./types";
import { rsiArray } from "./indicators";

interface IndicatorScore {
  name: string;
  score: number; // -1.0 to +1.0
  weight: number;
  reason: string;
}

function scoreTrend(ind: TechnicalIndicators, price: number): IndicatorScore {
  let score = 0;
  const reasons: string[] = [];

  // SMA stack
  if (ind.trendAlignment === "bullish") { score += 0.6; reasons.push("all SMAs bullish-stacked"); }
  else if (ind.trendAlignment === "bearish") { score -= 0.6; reasons.push("all SMAs bearish-stacked"); }

  // Price vs SMA20
  const pctAboveSma20 = (price - ind.sma20) / ind.sma20;
  score += Math.max(-0.4, Math.min(0.4, pctAboveSma20 * 5));

  // Golden/death cross
  if (ind.goldenCross && ind.crossDaysAgo !== null && ind.crossDaysAgo < 30) {
    score += 0.3;
    reasons.push(`golden cross ${ind.crossDaysAgo} days ago`);
  }
  if (ind.deathCross && ind.crossDaysAgo !== null && ind.crossDaysAgo < 30) {
    score -= 0.3;
    reasons.push(`death cross ${ind.crossDaysAgo} days ago`);
  }

  return { name: "Trend", score: Math.max(-1, Math.min(1, score)), weight: 0.20, reason: reasons.join(", ") || (score > 0 ? "price above moving averages" : "price below moving averages") };
}

function scoreMACD(ind: TechnicalIndicators): IndicatorScore {
  let score = 0;
  const reasons: string[] = [];

  // Histogram direction
  if (ind.macd.histogram > 0) score += 0.3;
  else score -= 0.3;

  // Crossover
  if (ind.macd.crossover === "bullish" && ind.macd.crossoverBarsAgo < 10) {
    score += 0.5;
    reasons.push(`bullish crossover ${ind.macd.crossoverBarsAgo} bars ago`);
  } else if (ind.macd.crossover === "bearish" && ind.macd.crossoverBarsAgo < 10) {
    score -= 0.5;
    reasons.push(`bearish crossover ${ind.macd.crossoverBarsAgo} bars ago`);
  }

  // MACD above/below zero
  if (ind.macd.macd > 0) score += 0.2;
  else score -= 0.2;

  return { name: "MACD", score: Math.max(-1, Math.min(1, score)), weight: 0.15, reason: reasons.join(", ") || (score > 0 ? "MACD bullish" : "MACD bearish") };
}

function scoreSupportResistance(ind: TechnicalIndicators, price: number): IndicatorScore {
  let score = 0;
  let reason = "";

  const nearestSupport = ind.supportResistance.supports[0];
  const nearestResistance = ind.supportResistance.resistances[ind.supportResistance.resistances.length - 1];

  if (nearestSupport && nearestResistance) {
    const range = nearestResistance - nearestSupport;
    const position = range > 0 ? (price - nearestSupport) / range : 0.5;

    // Near support = bullish (likely to bounce), near resistance = bearish (likely to reject)
    // But also: breaking above resistance = very bullish
    if (position < 0.2) { score = 0.4; reason = "near support level"; }
    else if (position > 0.8) { score = -0.3; reason = "near resistance level"; }
    else { score = 0; reason = "mid-range between S/R"; }
  }

  return { name: "S/R Levels", score, weight: 0.15, reason };
}

function scoreVolume(ind: TechnicalIndicators): IndicatorScore {
  let score = 0;
  const reasons: string[] = [];

  // OBV trend
  if (ind.volume.obvTrend === "rising") { score += 0.4; reasons.push("OBV rising"); }
  else if (ind.volume.obvTrend === "falling") { score -= 0.4; reasons.push("OBV falling"); }

  // A/D trend
  if (ind.volume.adTrend === "accumulation") { score += 0.3; reasons.push("accumulation detected"); }
  else if (ind.volume.adTrend === "distribution") { score -= 0.3; reasons.push("distribution detected"); }

  // Relative volume (high volume confirms moves)
  if (ind.volume.relativeVolume > 1.5) reasons.push(`volume ${ind.volume.relativeVolume.toFixed(1)}x above average`);

  return { name: "Volume", score: Math.max(-1, Math.min(1, score)), weight: 0.15, reason: reasons.join(", ") || "volume neutral" };
}

function scoreRSI(ind: TechnicalIndicators): IndicatorScore {
  const val = ind.rsi;
  let score = 0;
  let reason = "";

  if (val > 80) { score = -0.8; reason = "extremely overbought"; }
  else if (val > 70) { score = -0.5; reason = "overbought"; }
  else if (val > 60) { score = 0.2; reason = "bullish momentum"; }
  else if (val > 40) { score = 0; reason = "neutral"; }
  else if (val > 30) { score = 0.5; reason = "oversold (potential bounce)"; }
  else { score = 0.8; reason = "extremely oversold"; }

  return { name: "RSI", score, weight: 0.10, reason: `RSI ${val.toFixed(1)} — ${reason}` };
}

function scoreBollinger(ind: TechnicalIndicators): IndicatorScore {
  let score = 0;
  const reasons: string[] = [];

  // Position within bands
  if (ind.bollinger.percentB > 90) { score -= 0.4; reasons.push("touching upper band"); }
  else if (ind.bollinger.percentB < 10) { score += 0.4; reasons.push("touching lower band"); }
  else if (ind.bollinger.percentB > 50) { score += 0.1; }
  else { score -= 0.1; }

  // Squeeze
  if (ind.bollinger.squeeze) {
    reasons.push("Bollinger squeeze (big move imminent)");
    // Squeeze is direction-neutral, amplifies existing trend
  }

  return { name: "Bollinger", score, weight: 0.10, reason: reasons.join(", ") || `${ind.bollinger.percentB.toFixed(0)}% within bands` };
}

function scoreStochastic(ind: TechnicalIndicators): IndicatorScore {
  let score = 0;
  let reason = "";

  if (ind.stochastic.crossover === "bullish" && ind.stochastic.k < 30) {
    score = 0.8; reason = "bullish crossover in oversold zone";
  } else if (ind.stochastic.crossover === "bearish" && ind.stochastic.k > 70) {
    score = -0.8; reason = "bearish crossover in overbought zone";
  } else if (ind.stochastic.crossover === "bullish") {
    score = 0.4; reason = "bullish crossover";
  } else if (ind.stochastic.crossover === "bearish") {
    score = -0.4; reason = "bearish crossover";
  } else if (ind.stochastic.k > 80) {
    score = -0.3; reason = "overbought zone";
  } else if (ind.stochastic.k < 20) {
    score = 0.3; reason = "oversold zone";
  } else {
    reason = "neutral";
  }

  return { name: "Stochastic", score, weight: 0.08, reason };
}

function scoreMomentum(ind: TechnicalIndicators): IndicatorScore {
  const val = ind.roc;
  let score = 0;

  if (val > 10) score = 0.8;
  else if (val > 5) score = 0.5;
  else if (val > 0) score = 0.2;
  else if (val > -5) score = -0.2;
  else if (val > -10) score = -0.5;
  else score = -0.8;

  return { name: "Momentum", score, weight: 0.07, reason: `ROC ${val.toFixed(1)}%` };
}

// ─── Divergence Detection ───────────────────────────────────────

function detectDivergences(bars: OHLCVBar[], ind: TechnicalIndicators): string[] {
  const divergences: string[] = [];
  const closes = bars.map((b) => b.close);

  if (bars.length < 30) return divergences;

  // RSI divergence: price making new high but RSI making lower high (bearish)
  // or price making new low but RSI making higher low (bullish)
  const rsiVals = rsiArray(closes);
  if (rsiVals.length >= 20) {
    const recentCloses = closes.slice(-20);
    const recentRSI = rsiVals.slice(-20);

    const priceHigh = Math.max(...recentCloses.slice(-10));
    const pricePrevHigh = Math.max(...recentCloses.slice(0, 10));
    const rsiAtHigh = recentRSI[recentCloses.slice(-10).indexOf(priceHigh) + 10];
    const rsiAtPrevHigh = recentRSI[recentCloses.slice(0, 10).indexOf(pricePrevHigh)];

    if (priceHigh > pricePrevHigh && rsiAtHigh < rsiAtPrevHigh - 3) {
      divergences.push("Bearish RSI divergence (price higher high, RSI lower high)");
    }

    const priceLow = Math.min(...recentCloses.slice(-10));
    const pricePrevLow = Math.min(...recentCloses.slice(0, 10));
    const rsiAtLow = recentRSI[recentCloses.slice(-10).indexOf(priceLow) + 10];
    const rsiAtPrevLow = recentRSI[recentCloses.slice(0, 10).indexOf(pricePrevLow)];

    if (priceLow < pricePrevLow && rsiAtLow > rsiAtPrevLow + 3) {
      divergences.push("Bullish RSI divergence (price lower low, RSI higher low)");
    }
  }

  // OBV divergence
  if (ind.volume.obvTrend === "falling" && ind.trendAlignment === "bullish") {
    divergences.push("Bearish OBV divergence (price rising, volume declining)");
  }
  if (ind.volume.obvTrend === "rising" && ind.trendAlignment === "bearish") {
    divergences.push("Bullish OBV divergence (price falling, volume accumulating)");
  }

  return divergences;
}

// ─── Signal Generator ───────────────────────────────────────────

export function generateSignal(bars: OHLCVBar[], indicators: TechnicalIndicators): Signal {
  const price = bars[bars.length - 1].close;

  const scores: IndicatorScore[] = [
    scoreTrend(indicators, price),
    scoreMACD(indicators),
    scoreSupportResistance(indicators, price),
    scoreVolume(indicators),
    scoreRSI(indicators),
    scoreBollinger(indicators),
    scoreStochastic(indicators),
    scoreMomentum(indicators),
  ];

  // Weighted composite score
  let compositeScore = 0;
  for (const s of scores) {
    compositeScore += s.score * s.weight;
  }

  // Convergence multiplier: if 6+ indicators agree on direction
  const agreeing = scores.filter((s) => Math.sign(s.score) === Math.sign(compositeScore) && Math.abs(s.score) > 0.2);
  if (agreeing.length >= 6) {
    compositeScore *= 1.25;
  }

  // Divergence detection
  const divergences = detectDivergences(bars, indicators);
  for (const div of divergences) {
    if (div.includes("Bearish") && compositeScore > 0) compositeScore *= 0.7;
    if (div.includes("Bullish") && compositeScore < 0) compositeScore *= 0.7;
  }

  // Clamp
  compositeScore = Math.max(-1, Math.min(1, compositeScore));

  // Map to rating
  let rating: SignalRating;
  if (compositeScore > 0.5) rating = "STRONG_BUY";
  else if (compositeScore > 0.2) rating = "BUY";
  else if (compositeScore < -0.5) rating = "STRONG_SELL";
  else if (compositeScore < -0.2) rating = "SELL";
  else rating = "HOLD";

  // Confidence
  const confidence = Math.min(95, Math.round(Math.abs(compositeScore) * 120 + 20));

  // Reasons (top scoring indicators)
  const sortedScores = [...scores].sort((a, b) => Math.abs(b.score * b.weight) - Math.abs(a.score * a.weight));
  const reasons = sortedScores
    .filter((s) => Math.abs(s.score) > 0.1)
    .slice(0, 5)
    .map((s) => s.reason);
  if (divergences.length > 0) reasons.push(...divergences);

  // Watch levels
  const watchLevels: { label: string; price: number }[] = [];
  if (indicators.supportResistance.resistances.length > 0) {
    watchLevels.push({ label: "Resistance", price: indicators.supportResistance.resistances[indicators.supportResistance.resistances.length - 1] });
  }
  if (indicators.supportResistance.supports.length > 0) {
    watchLevels.push({ label: "Support", price: indicators.supportResistance.supports[0] });
  }
  watchLevels.push({ label: "Bollinger Upper", price: indicators.bollinger.upper });
  watchLevels.push({ label: "Bollinger Lower", price: indicators.bollinger.lower });

  // Risks
  const risks: string[] = [];
  if (indicators.rsi > 70) risks.push("RSI overbought — vulnerable to pullback");
  if (indicators.rsi < 30) risks.push("RSI oversold — could drop further before recovery");
  if (indicators.bollinger.squeeze) risks.push("Bollinger squeeze — direction of breakout uncertain");
  if (indicators.volume.relativeVolume < 0.5) risks.push("Low volume — weak conviction in current move");
  if (divergences.length > 0) risks.push("Divergence detected — trend may be weakening");
  if (indicators.atr / price > 0.04) risks.push("High volatility (ATR) — larger than usual swings likely");

  return { rating, score: compositeScore, confidence, reasons, watchLevels, risks };
}
