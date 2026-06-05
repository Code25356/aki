import type {
  OHLCVBar,
  TechnicalIndicators,
  MACDResult,
  BollingerResult,
  StochasticResult,
  VolumeAnalysis,
  SupportResistance,
  FibonacciLevels,
} from "./types";

// ─── Moving Averages ────────────────────────────────────────────

export function sma(data: number[], period: number): number {
  if (data.length < period) return data[data.length - 1] || 0;
  const slice = data.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

export function smaArray(data: number[], period: number): number[] {
  const result: number[] = [];
  for (let i = period - 1; i < data.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += data[j];
    result.push(sum / period);
  }
  return result;
}

export function emaArray(data: number[], period: number): number[] {
  if (data.length === 0) return [];
  const k = 2 / (period + 1);
  const result: number[] = [data[0]];
  for (let i = 1; i < data.length; i++) {
    result.push(data[i] * k + result[i - 1] * (1 - k));
  }
  return result;
}

export function ema(data: number[], period: number): number {
  const arr = emaArray(data, period);
  return arr[arr.length - 1] || 0;
}

// ─── RSI ────────────────────────────────────────────────────────

export function rsiArray(closes: number[], period: number = 14): number[] {
  const result: number[] = [];
  if (closes.length < period + 1) return [50]; // neutral fallback

  let avgGain = 0;
  let avgLoss = 0;

  // Initial average
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) avgGain += diff;
    else avgLoss += Math.abs(diff);
  }
  avgGain /= period;
  avgLoss /= period;

  result.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss));

  // Smoothed
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? Math.abs(diff) : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    result.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss));
  }

  return result;
}

export function rsi(closes: number[], period: number = 14): number {
  const arr = rsiArray(closes, period);
  return arr[arr.length - 1] || 50;
}

// ─── MACD ───────────────────────────────────────────────────────

export function computeMACD(closes: number[]): MACDResult {
  const ema12 = emaArray(closes, 12);
  const ema26 = emaArray(closes, 26);

  if (ema12.length === 0 || ema26.length === 0) {
    return { macd: 0, signal: 0, histogram: 0, crossover: "none", crossoverBarsAgo: 0 };
  }

  // MACD line = EMA12 - EMA26
  const macdLine: number[] = [];
  for (let i = 0; i < ema12.length; i++) {
    macdLine.push(ema12[i] - ema26[i]);
  }

  // Signal line = 9-period EMA of MACD
  const signalLine = emaArray(macdLine, 9);

  const macdVal = macdLine[macdLine.length - 1] || 0;
  const signalVal = signalLine[signalLine.length - 1] || 0;
  const histogram = macdVal - signalVal;

  // Detect crossover
  let crossover: "bullish" | "bearish" | "none" = "none";
  let crossoverBarsAgo = 0;

  const minLen = Math.min(macdLine.length, signalLine.length);
  for (let i = minLen - 1; i > Math.max(0, minLen - 20); i--) {
    const curr = macdLine[i] - signalLine[i];
    const prev = macdLine[i - 1] - signalLine[i - 1];
    if (curr > 0 && prev <= 0) {
      crossover = "bullish";
      crossoverBarsAgo = minLen - 1 - i;
      break;
    }
    if (curr < 0 && prev >= 0) {
      crossover = "bearish";
      crossoverBarsAgo = minLen - 1 - i;
      break;
    }
  }

  return { macd: macdVal, signal: signalVal, histogram, crossover, crossoverBarsAgo };
}

// ─── Bollinger Bands ────────────────────────────────────────────

export function computeBollinger(closes: number[], period: number = 20, mult: number = 2): BollingerResult {
  const middle = sma(closes, period);
  const slice = closes.slice(-period);
  const variance = slice.reduce((sum, val) => sum + Math.pow(val - middle, 2), 0) / period;
  const stdDev = Math.sqrt(variance);
  const upper = middle + mult * stdDev;
  const lower = middle - mult * stdDev;
  const price = closes[closes.length - 1];
  const percentB = upper !== lower ? ((price - lower) / (upper - lower)) * 100 : 50;
  const bandwidth = middle > 0 ? ((upper - lower) / middle) * 100 : 0;

  // Squeeze: bandwidth below 20-bar average bandwidth
  const squeeze = bandwidth < 4; // tight bands threshold

  return { upper, middle, lower, percentB, bandwidth, squeeze };
}

// ─── ATR (Average True Range) ───────────────────────────────────

export function computeATR(bars: OHLCVBar[], period: number = 14): number {
  if (bars.length < 2) return 0;

  const trueRanges: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    const tr = Math.max(
      bars[i].high - bars[i].low,
      Math.abs(bars[i].high - bars[i - 1].close),
      Math.abs(bars[i].low - bars[i - 1].close),
    );
    trueRanges.push(tr);
  }

  if (trueRanges.length < period) {
    return trueRanges.reduce((a, b) => a + b, 0) / trueRanges.length;
  }

  // Wilder's smoothing
  let atr = trueRanges.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < trueRanges.length; i++) {
    atr = (atr * (period - 1) + trueRanges[i]) / period;
  }
  return atr;
}

// ─── Stochastic Oscillator ──────────────────────────────────────

export function computeStochastic(bars: OHLCVBar[], kPeriod: number = 14, dPeriod: number = 3): StochasticResult {
  if (bars.length < kPeriod) return { k: 50, d: 50, crossover: "none" };

  const kValues: number[] = [];
  for (let i = kPeriod - 1; i < bars.length; i++) {
    const slice = bars.slice(i - kPeriod + 1, i + 1);
    const high = Math.max(...slice.map((b) => b.high));
    const low = Math.min(...slice.map((b) => b.low));
    const k = high !== low ? ((bars[i].close - low) / (high - low)) * 100 : 50;
    kValues.push(k);
  }

  const dValues = smaArray(kValues, dPeriod);
  const k = kValues[kValues.length - 1] || 50;
  const d = dValues[dValues.length - 1] || 50;

  // Crossover detection
  let crossover: "bullish" | "bearish" | "none" = "none";
  if (kValues.length >= 2 && dValues.length >= 2) {
    const prevK = kValues[kValues.length - 2];
    const prevD = dValues[dValues.length - 2];
    if (k > d && prevK <= prevD) crossover = "bullish";
    else if (k < d && prevK >= prevD) crossover = "bearish";
  }

  return { k, d, crossover };
}

// ─── Rate of Change ─────────────────────────────────────────────

export function roc(closes: number[], period: number = 14): number {
  if (closes.length <= period) return 0;
  const current = closes[closes.length - 1];
  const past = closes[closes.length - 1 - period];
  return past !== 0 ? ((current - past) / past) * 100 : 0;
}

// ─── Volume Analysis ────────────────────────────────────────────

export function computeVolumeAnalysis(bars: OHLCVBar[]): VolumeAnalysis {
  if (bars.length < 20) {
    return { obv: 0, obvTrend: "flat", relativeVolume: 1, accumulationDistribution: 0, adTrend: "neutral" };
  }

  // OBV
  let obv = 0;
  const obvValues: number[] = [0];
  for (let i = 1; i < bars.length; i++) {
    if (bars[i].close > bars[i - 1].close) obv += bars[i].volume;
    else if (bars[i].close < bars[i - 1].close) obv -= bars[i].volume;
    obvValues.push(obv);
  }

  // OBV trend (compare current OBV to 20-bar ago)
  const obvRecent = obvValues.slice(-5);
  const obvOlder = obvValues.slice(-25, -20);
  const obvAvgRecent = obvRecent.reduce((a, b) => a + b, 0) / obvRecent.length;
  const obvAvgOlder = obvOlder.length > 0 ? obvOlder.reduce((a, b) => a + b, 0) / obvOlder.length : obvAvgRecent;
  const obvTrend: "rising" | "falling" | "flat" =
    obvAvgRecent > obvAvgOlder * 1.02 ? "rising" :
    obvAvgRecent < obvAvgOlder * 0.98 ? "falling" : "flat";

  // Relative volume
  const recentVol = bars[bars.length - 1].volume;
  const avgVol = bars.slice(-20).reduce((a, b) => a + b.volume, 0) / 20;
  const relativeVolume = avgVol > 0 ? recentVol / avgVol : 1;

  // Accumulation/Distribution
  let ad = 0;
  const adValues: number[] = [];
  for (const bar of bars) {
    const clv = bar.high !== bar.low
      ? ((bar.close - bar.low) - (bar.high - bar.close)) / (bar.high - bar.low)
      : 0;
    ad += clv * bar.volume;
    adValues.push(ad);
  }

  const adRecent = adValues.slice(-5);
  const adOlder = adValues.slice(-25, -20);
  const adAvgRecent = adRecent.reduce((a, b) => a + b, 0) / adRecent.length;
  const adAvgOlder = adOlder.length > 0 ? adOlder.reduce((a, b) => a + b, 0) / adOlder.length : adAvgRecent;
  const adTrend: "accumulation" | "distribution" | "neutral" =
    adAvgRecent > adAvgOlder * 1.02 ? "accumulation" :
    adAvgRecent < adAvgOlder * 0.98 ? "distribution" : "neutral";

  return { obv, obvTrend, relativeVolume, accumulationDistribution: ad, adTrend };
}

// ─── Support & Resistance ───────────────────────────────────────

export function computeSupportResistance(bars: OHLCVBar[], numLevels: number = 3): SupportResistance {
  const price = bars[bars.length - 1].close;

  // Find local pivots
  const pivotHighs: number[] = [];
  const pivotLows: number[] = [];

  for (let i = 2; i < bars.length - 2; i++) {
    if (bars[i].high > bars[i - 1].high && bars[i].high > bars[i - 2].high &&
        bars[i].high > bars[i + 1].high && bars[i].high > bars[i + 2].high) {
      pivotHighs.push(bars[i].high);
    }
    if (bars[i].low < bars[i - 1].low && bars[i].low < bars[i - 2].low &&
        bars[i].low < bars[i + 1].low && bars[i].low < bars[i + 2].low) {
      pivotLows.push(bars[i].low);
    }
  }

  // Cluster nearby levels
  const clusterLevels = (levels: number[], threshold: number): number[] => {
    if (levels.length === 0) return [];
    const sorted = [...levels].sort((a, b) => a - b);
    const clusters: number[][] = [[sorted[0]]];
    for (let i = 1; i < sorted.length; i++) {
      const last = clusters[clusters.length - 1];
      if (Math.abs(sorted[i] - last[last.length - 1]) / last[last.length - 1] < threshold) {
        last.push(sorted[i]);
      } else {
        clusters.push([sorted[i]]);
      }
    }
    return clusters
      .map((c) => c.reduce((a, b) => a + b, 0) / c.length)
      .sort((a, b) => b - a);
  };

  const allResistances = clusterLevels(pivotHighs.filter((h) => h > price), 0.015);
  const allSupports = clusterLevels(pivotLows.filter((l) => l < price), 0.015);

  return {
    resistances: allResistances.slice(0, numLevels),
    supports: allSupports.slice(-numLevels).reverse(),
  };
}

// ─── Fibonacci Retracements ─────────────────────────────────────

export function computeFibonacci(bars: OHLCVBar[]): FibonacciLevels {
  const high = Math.max(...bars.map((b) => b.high));
  const low = Math.min(...bars.map((b) => b.low));
  const diff = high - low;

  const ratios = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
  const levels = ratios.map((ratio) => ({
    ratio,
    price: high - diff * ratio,
  }));

  return { high, low, levels };
}

// ─── Cross Detection ────────────────────────────────────────────

function detectCross(closes: number[]): { golden: boolean; death: boolean; daysAgo: number | null } {
  const sma50Arr = smaArray(closes, 50);
  const sma200Arr = smaArray(closes, 200);

  if (sma50Arr.length < 2 || sma200Arr.length < 2) {
    return { golden: false, death: false, daysAgo: null };
  }

  // Align arrays (sma200 starts later)
  const len = Math.min(sma50Arr.length, sma200Arr.length);
  const s50 = sma50Arr.slice(-len);
  const s200 = sma200Arr.slice(-len);

  let golden = false;
  let death = false;
  let daysAgo: number | null = null;

  for (let i = len - 1; i > Math.max(0, len - 60); i--) {
    const curr = s50[i] - s200[i];
    const prev = s50[i - 1] - s200[i - 1];
    if (curr > 0 && prev <= 0) {
      golden = true;
      daysAgo = len - 1 - i;
      break;
    }
    if (curr < 0 && prev >= 0) {
      death = true;
      daysAgo = len - 1 - i;
      break;
    }
  }

  return { golden, death, daysAgo };
}

// ─── Master Compute Function ────────────────────────────────────

export function computeAllIndicators(bars: OHLCVBar[]): TechnicalIndicators {
  const closes = bars.map((b) => b.close);
  const price = closes[closes.length - 1];

  const sma20Val = sma(closes, 20);
  const sma50Val = sma(closes, 50);
  const sma200Val = closes.length >= 200 ? sma(closes, 200) : sma50Val;
  const ema12Val = ema(closes, 12);
  const ema26Val = ema(closes, 26);

  // Trend alignment
  const bullishStack = price > sma20Val && sma20Val > sma50Val && sma50Val > sma200Val;
  const bearishStack = price < sma20Val && sma20Val < sma50Val && sma50Val < sma200Val;
  const trendAlignment = bullishStack ? "bullish" : bearishStack ? "bearish" : "mixed";

  const cross = detectCross(closes);

  return {
    sma20: sma20Val,
    sma50: sma50Val,
    sma200: sma200Val,
    ema12: ema12Val,
    ema26: ema26Val,
    rsi: rsi(closes),
    macd: computeMACD(closes),
    bollinger: computeBollinger(closes),
    atr: computeATR(bars),
    stochastic: computeStochastic(bars),
    roc: roc(closes),
    volume: computeVolumeAnalysis(bars),
    supportResistance: computeSupportResistance(bars),
    fibonacci: computeFibonacci(bars),
    trendAlignment,
    goldenCross: cross.golden,
    deathCross: cross.death,
    crossDaysAgo: cross.daysAgo,
  };
}
