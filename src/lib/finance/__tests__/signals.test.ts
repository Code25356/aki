import { describe, it, expect } from "vitest";
import { generateSignal } from "../signals";
import { computeAllIndicators } from "../indicators";
import type { OHLCVBar } from "../types";

function generateBars(closes: number[], baseVolume = 1000000): OHLCVBar[] {
  return closes.map((close, i) => ({
    timestamp: 1700000000 + i * 86400,
    open: close - 1,
    high: close + 2,
    low: close - 2,
    close,
    volume: baseVolume + Math.floor(Math.random() * 500000),
  }));
}

describe("generateSignal", () => {
  it("returns positive score for strong uptrend", () => {
    const closes = Array.from({ length: 60 }, (_, i) => 100 + i * 1.5);
    const bars = generateBars(closes);
    const indicators = computeAllIndicators(bars);
    const signal = generateSignal(bars, indicators);
    // Uptrend should produce non-negative score
    expect(signal.score).toBeGreaterThanOrEqual(0);
    expect(["BUY", "STRONG_BUY", "HOLD"]).toContain(signal.rating);
  });

  it("returns negative or neutral score for downtrend", () => {
    const closes = Array.from({ length: 60 }, (_, i) => 200 - i * 1.5);
    const bars = generateBars(closes);
    const indicators = computeAllIndicators(bars);
    const signal = generateSignal(bars, indicators);
    // Downtrend should not produce BUY signals
    expect(["SELL", "STRONG_SELL", "HOLD"]).toContain(signal.rating);
    expect(signal.score).toBeLessThanOrEqual(0.2);
  });

  it("returns HOLD for flat data", () => {
    const closes = Array.from({ length: 60 }, () => 100);
    const bars = generateBars(closes);
    const indicators = computeAllIndicators(bars);
    const signal = generateSignal(bars, indicators);
    expect(signal.rating).toBe("HOLD");
    expect(Math.abs(signal.score)).toBeLessThan(0.3);
  });

  it("score is bounded between -1 and 1", () => {
    const closes = Array.from({ length: 60 }, (_, i) => 100 + i * 3);
    const bars = generateBars(closes);
    const indicators = computeAllIndicators(bars);
    const signal = generateSignal(bars, indicators);
    expect(signal.score).toBeGreaterThanOrEqual(-1);
    expect(signal.score).toBeLessThanOrEqual(1);
  });

  it("confidence is bounded between 0 and 100", () => {
    const closes = Array.from({ length: 60 }, (_, i) => 100 + i);
    const bars = generateBars(closes);
    const indicators = computeAllIndicators(bars);
    const signal = generateSignal(bars, indicators);
    expect(signal.confidence).toBeGreaterThanOrEqual(0);
    expect(signal.confidence).toBeLessThanOrEqual(100);
  });

  it("provides reasons array", () => {
    const closes = Array.from({ length: 60 }, (_, i) => 100 + i);
    const bars = generateBars(closes);
    const indicators = computeAllIndicators(bars);
    const signal = generateSignal(bars, indicators);
    expect(Array.isArray(signal.reasons)).toBe(true);
    expect(signal.reasons.length).toBeGreaterThan(0);
  });

  it("provides watch levels including Bollinger bands", () => {
    const closes = Array.from({ length: 60 }, (_, i) => 100 + i);
    const bars = generateBars(closes);
    const indicators = computeAllIndicators(bars);
    const signal = generateSignal(bars, indicators);
    const labels = signal.watchLevels.map((w) => w.label);
    expect(labels).toContain("Bollinger Upper");
    expect(labels).toContain("Bollinger Lower");
  });

  it("identifies RSI risk in overbought condition", () => {
    // Create data that pushes RSI very high
    const closes = Array.from({ length: 60 }, (_, i) => 100 + i * 2);
    const bars = generateBars(closes);
    const indicators = computeAllIndicators(bars);
    if (indicators.rsi > 70) {
      const signal = generateSignal(bars, indicators);
      expect(signal.risks.some((r) => r.includes("RSI overbought"))).toBe(true);
    }
  });

  it("maps score to correct rating thresholds", () => {
    // We test the rating logic indirectly through different trends
    const strongUp = Array.from({ length: 60 }, (_, i) => 50 + i * 2);
    const barsUp = generateBars(strongUp);
    const indUp = computeAllIndicators(barsUp);
    const sigUp = generateSignal(barsUp, indUp);

    if (sigUp.score > 0.5) expect(sigUp.rating).toBe("STRONG_BUY");
    else if (sigUp.score > 0.2) expect(sigUp.rating).toBe("BUY");
  });
});
