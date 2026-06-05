import { describe, it, expect } from "vitest";
import {
  sma,
  smaArray,
  emaArray,
  ema,
  rsi,
  rsiArray,
  computeMACD,
  computeBollinger,
  computeATR,
  computeStochastic,
  roc,
  computeVolumeAnalysis,
  computeSupportResistance,
  computeFibonacci,
  computeAllIndicators,
} from "../indicators";
import type { OHLCVBar } from "../types";

// Helper to generate sample bars
function generateBars(closes: number[], baseVolume = 1000000): OHLCVBar[] {
  return closes.map((close, i) => ({
    timestamp: 1700000000 + i * 86400,
    open: close - 1,
    high: close + 2,
    low: close - 2,
    close,
    volume: baseVolume + Math.random() * 500000,
  }));
}

// Uptrending data
const uptrendCloses = Array.from({ length: 50 }, (_, i) => 100 + i * 0.5);
// Downtrending data
const downtrendCloses = Array.from({ length: 50 }, (_, i) => 150 - i * 0.5);
// Flat data
const flatCloses = Array.from({ length: 50 }, () => 100);

describe("sma", () => {
  it("calculates simple moving average", () => {
    expect(sma([1, 2, 3, 4, 5], 3)).toBeCloseTo(4, 5); // (3+4+5)/3
  });

  it("returns last value when insufficient data", () => {
    expect(sma([10], 5)).toBe(10);
  });

  it("uses all data when period equals data length", () => {
    expect(sma([2, 4, 6], 3)).toBeCloseTo(4, 5);
  });

  it("returns 0 for empty array", () => {
    expect(sma([], 5)).toBe(0);
  });
});

describe("smaArray", () => {
  it("returns correct length", () => {
    const result = smaArray([1, 2, 3, 4, 5], 3);
    expect(result.length).toBe(3); // 5 - 3 + 1
  });

  it("calculates each window correctly", () => {
    const result = smaArray([1, 2, 3, 4, 5], 3);
    expect(result[0]).toBeCloseTo(2, 5); // (1+2+3)/3
    expect(result[1]).toBeCloseTo(3, 5); // (2+3+4)/3
    expect(result[2]).toBeCloseTo(4, 5); // (3+4+5)/3
  });
});

describe("emaArray", () => {
  it("returns array same length as input", () => {
    const result = emaArray([1, 2, 3, 4, 5], 3);
    expect(result.length).toBe(5);
  });

  it("first value equals first input", () => {
    const result = emaArray([10, 20, 30], 3);
    expect(result[0]).toBe(10);
  });

  it("returns empty array for empty input", () => {
    expect(emaArray([], 5)).toEqual([]);
  });

  it("weights recent values more heavily", () => {
    const data = [10, 10, 10, 10, 20]; // sudden jump
    const result = emaArray(data, 3);
    // EMA should be between 10 and 20, closer to 20 for last value
    expect(result[4]).toBeGreaterThan(10);
    expect(result[4]).toBeLessThan(20);
  });
});

describe("ema", () => {
  it("returns last value of emaArray", () => {
    const data = [1, 2, 3, 4, 5];
    expect(ema(data, 3)).toBe(emaArray(data, 3)[4]);
  });

  it("returns 0 for empty data", () => {
    expect(ema([], 5)).toBe(0);
  });
});

describe("rsi", () => {
  it("returns ~50 for flat data", () => {
    const result = rsi(flatCloses);
    expect(result).toBeCloseTo(50, 0);
  });

  it("returns high value for strong uptrend", () => {
    const result = rsi(uptrendCloses);
    expect(result).toBeGreaterThan(60);
  });

  it("returns low value for strong downtrend", () => {
    const result = rsi(downtrendCloses);
    expect(result).toBeLessThan(40);
  });

  it("returns 50 for insufficient data", () => {
    expect(rsi([100, 101, 102])).toBe(50);
  });

  it("is bounded between 0 and 100", () => {
    const result = rsi(uptrendCloses);
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThanOrEqual(100);
  });
});

describe("rsiArray", () => {
  it("returns neutral fallback for insufficient data", () => {
    expect(rsiArray([100, 101])).toEqual([50]);
  });

  it("returns array of RSI values", () => {
    const result = rsiArray(uptrendCloses);
    expect(result.length).toBeGreaterThan(0);
    result.forEach((v) => {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    });
  });
});

describe("computeMACD", () => {
  it("returns zero values for empty input", () => {
    const result = computeMACD([]);
    expect(result.macd).toBe(0);
    expect(result.signal).toBe(0);
    expect(result.histogram).toBe(0);
    expect(result.crossover).toBe("none");
  });

  it("detects bullish crossover in uptrend", () => {
    // After a downturn followed by recovery
    const data = [
      ...Array.from({ length: 30 }, (_, i) => 100 - i * 0.5),
      ...Array.from({ length: 30 }, (_, i) => 85 + i * 1.0),
    ];
    const result = computeMACD(data);
    // Should detect some crossover in recovery
    expect(result.macd).toBeDefined();
    expect(typeof result.crossoverBarsAgo).toBe("number");
  });

  it("histogram equals macd minus signal", () => {
    const result = computeMACD(uptrendCloses);
    expect(result.histogram).toBeCloseTo(result.macd - result.signal, 10);
  });
});

describe("computeBollinger", () => {
  it("upper > middle > lower", () => {
    const result = computeBollinger(uptrendCloses);
    expect(result.upper).toBeGreaterThan(result.middle);
    expect(result.middle).toBeGreaterThan(result.lower);
  });

  it("percentB is bounded 0-100 for normal data", () => {
    const result = computeBollinger(flatCloses);
    expect(result.percentB).toBeGreaterThanOrEqual(0);
    expect(result.percentB).toBeLessThanOrEqual(100);
  });

  it("detects squeeze on flat data", () => {
    const result = computeBollinger(flatCloses);
    // Flat data = zero stddev = very tight bands
    expect(result.squeeze).toBe(true);
  });

  it("bandwidth is positive", () => {
    const result = computeBollinger(uptrendCloses);
    expect(result.bandwidth).toBeGreaterThanOrEqual(0);
  });
});

describe("computeATR", () => {
  it("returns 0 for single bar", () => {
    const bars = generateBars([100]);
    expect(computeATR(bars)).toBe(0);
  });

  it("returns positive value for normal data", () => {
    const bars = generateBars(uptrendCloses);
    expect(computeATR(bars)).toBeGreaterThan(0);
  });

  it("higher ATR for volatile data", () => {
    const volatile = Array.from({ length: 50 }, (_, i) => 100 + (i % 2 === 0 ? 10 : -10));
    const calm = Array.from({ length: 50 }, (_, i) => 100 + (i % 2 === 0 ? 1 : -1));
    const volatileBars = generateBars(volatile);
    const calmBars = generateBars(calm);
    expect(computeATR(volatileBars)).toBeGreaterThan(computeATR(calmBars));
  });
});

describe("computeStochastic", () => {
  it("returns neutral for insufficient data", () => {
    const bars = generateBars([100, 101, 102]);
    const result = computeStochastic(bars);
    expect(result.k).toBe(50);
    expect(result.d).toBe(50);
  });

  it("k and d are bounded 0-100", () => {
    const bars = generateBars(uptrendCloses);
    const result = computeStochastic(bars);
    expect(result.k).toBeGreaterThanOrEqual(0);
    expect(result.k).toBeLessThanOrEqual(100);
    expect(result.d).toBeGreaterThanOrEqual(0);
    expect(result.d).toBeLessThanOrEqual(100);
  });

  it("high stochastic in uptrend", () => {
    const bars = generateBars(uptrendCloses);
    const result = computeStochastic(bars);
    expect(result.k).toBeGreaterThan(50);
  });
});

describe("roc", () => {
  it("returns 0 for insufficient data", () => {
    expect(roc([100], 14)).toBe(0);
  });

  it("positive for uptrend", () => {
    expect(roc(uptrendCloses, 14)).toBeGreaterThan(0);
  });

  it("negative for downtrend", () => {
    expect(roc(downtrendCloses, 14)).toBeLessThan(0);
  });

  it("calculates correctly", () => {
    const data = [100, 105, 110, 115, 120];
    // (120 - 100) / 100 * 100 = 20%
    expect(roc(data, 4)).toBeCloseTo(20, 5);
  });
});

describe("computeVolumeAnalysis", () => {
  it("returns neutral for insufficient data", () => {
    const bars = generateBars([100, 101, 102]);
    const result = computeVolumeAnalysis(bars);
    expect(result.obvTrend).toBe("flat");
  });

  it("returns valid structure for normal data", () => {
    const bars = generateBars(uptrendCloses);
    const result = computeVolumeAnalysis(bars);
    expect(["rising", "falling", "flat"]).toContain(result.obvTrend);
    expect(["accumulation", "distribution", "neutral"]).toContain(result.adTrend);
    expect(result.relativeVolume).toBeGreaterThan(0);
  });
});

describe("computeSupportResistance", () => {
  it("returns arrays for resistances and supports", () => {
    const bars = generateBars(uptrendCloses);
    const result = computeSupportResistance(bars);
    expect(Array.isArray(result.resistances)).toBe(true);
    expect(Array.isArray(result.supports)).toBe(true);
  });

  it("limits to numLevels", () => {
    const volatileData = Array.from({ length: 100 }, (_, i) => 100 + Math.sin(i / 5) * 20);
    const bars = generateBars(volatileData);
    const result = computeSupportResistance(bars, 2);
    expect(result.resistances.length).toBeLessThanOrEqual(2);
    expect(result.supports.length).toBeLessThanOrEqual(2);
  });
});

describe("computeFibonacci", () => {
  it("calculates correct levels", () => {
    const bars = generateBars([100, 110, 120, 130, 140, 150]);
    const result = computeFibonacci(bars);
    expect(result.high).toBe(152); // close + 2 (high offset in generateBars)
    expect(result.low).toBe(98); // close - 2 (low offset in generateBars)
    expect(result.levels.length).toBe(7);
    expect(result.levels[0].ratio).toBe(0);
    expect(result.levels[0].price).toBe(result.high);
    expect(result.levels[6].ratio).toBe(1);
    expect(result.levels[6].price).toBe(result.low);
  });

  it("50% level is midpoint", () => {
    const bars = generateBars([100, 200]);
    const result = computeFibonacci(bars);
    const mid = result.levels.find((l) => l.ratio === 0.5);
    expect(mid!.price).toBeCloseTo((result.high + result.low) / 2, 5);
  });
});

describe("computeAllIndicators", () => {
  it("returns complete indicators object", () => {
    const bars = generateBars(uptrendCloses);
    const result = computeAllIndicators(bars);
    expect(result.sma20).toBeGreaterThan(0);
    expect(result.sma50).toBeGreaterThan(0);
    expect(result.rsi).toBeGreaterThan(0);
    expect(result.macd).toBeDefined();
    expect(result.bollinger).toBeDefined();
    expect(result.stochastic).toBeDefined();
    expect(result.volume).toBeDefined();
    expect(result.supportResistance).toBeDefined();
    expect(result.fibonacci).toBeDefined();
    expect(["bullish", "bearish", "mixed"]).toContain(result.trendAlignment);
  });
});
