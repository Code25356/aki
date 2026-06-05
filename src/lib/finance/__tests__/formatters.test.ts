import { describe, it, expect } from "vitest";
import {
  formatQuote,
  formatMultipleQuotes,
  formatComparison,
  formatSectorPerformance,
  formatHistorical,
} from "../formatters";
import type { StockQuote, ComparisonEntry, SectorEntry, OHLCVBar } from "../types";

const sampleQuote: StockQuote = {
  symbol: "AAPL",
  name: "Apple Inc.",
  price: 175.5,
  change: 2.5,
  changePercent: 1.44,
  high: 177.0,
  low: 173.0,
  open: 174.0,
  previousClose: 173.0,
  volume: 50000000,
};

describe("formatQuote", () => {
  it("includes symbol and name", () => {
    const result = formatQuote(sampleQuote);
    expect(result).toContain("**AAPL**");
    expect(result).toContain("Apple Inc.");
  });

  it("includes price with positive change indicator", () => {
    const result = formatQuote(sampleQuote);
    expect(result).toContain("$175.50");
    expect(result).toContain("+2.50");
    expect(result).toContain("+1.44%");
  });

  it("shows negative change without plus sign", () => {
    const negQuote = { ...sampleQuote, change: -3.0, changePercent: -1.71 };
    const result = formatQuote(negQuote);
    expect(result).toContain("-3.00");
    expect(result).not.toContain("+-");
  });

  it("includes OHLC data", () => {
    const result = formatQuote(sampleQuote);
    expect(result).toContain("Open: $174.00");
    expect(result).toContain("High: $177.00");
    expect(result).toContain("Low: $173.00");
  });
});

describe("formatMultipleQuotes", () => {
  it("returns no-quotes message for empty array", () => {
    expect(formatMultipleQuotes([])).toBe("No quotes found.");
  });

  it("formats multiple quotes separated by newlines", () => {
    const result = formatMultipleQuotes([sampleQuote, { ...sampleQuote, symbol: "MSFT" }]);
    expect(result).toContain("AAPL");
    expect(result).toContain("MSFT");
  });
});

describe("formatComparison", () => {
  it("returns no-data message for empty array", () => {
    expect(formatComparison([])).toBe("No comparison data.");
  });

  it("includes table header and entries", () => {
    const entries: ComparisonEntry[] = [
      {
        symbol: "AAPL", name: "Apple", price: 175, changePercent: 1.5,
        marketCap: 2.8e12, peRatio: 28, revenue: 380e9, profitMargin: 0.25,
        revenueGrowth: 0.08, beta: 1.2,
      },
      {
        symbol: "MSFT", name: "Microsoft", price: 380, changePercent: -0.5,
        marketCap: 2.9e12, peRatio: 35, revenue: 210e9, profitMargin: 0.35,
        revenueGrowth: 0.12, beta: 0.9,
      },
    ];
    const result = formatComparison(entries);
    expect(result).toContain("STOCK COMPARISON");
    expect(result).toContain("AAPL");
    expect(result).toContain("MSFT");
    expect(result).toContain("RANKINGS");
    expect(result).toContain("Fastest Growing");
  });
});

describe("formatSectorPerformance", () => {
  it("formats sectors sorted by return", () => {
    const sectors: SectorEntry[] = [
      { name: "Technology", etf: "XLK", returnPercent: 8.5, price: 200 },
      { name: "Healthcare", etf: "XLV", returnPercent: -2.1, price: 140 },
      { name: "Energy", etf: "XLE", returnPercent: 12.3, price: 90 },
    ];
    const result = formatSectorPerformance(sectors, "3mo");
    expect(result).toContain("SECTOR PERFORMANCE (3mo)");
    // Energy should be first (highest return)
    const energyIdx = result.indexOf("Energy");
    const techIdx = result.indexOf("Technology");
    const healthIdx = result.indexOf("Healthcare");
    expect(energyIdx).toBeLessThan(techIdx);
    expect(techIdx).toBeLessThan(healthIdx);
    expect(result).toContain("Strongest: Energy");
    expect(result).toContain("Weakest: Healthcare");
  });
});

describe("formatHistorical", () => {
  it("returns no-data message for empty bars", () => {
    expect(formatHistorical("AAPL", [], "6mo")).toBe("No historical data.");
  });

  it("calculates period return correctly", () => {
    const bars: OHLCVBar[] = [
      { timestamp: 1700000000, open: 100, high: 105, low: 95, close: 100, volume: 1e6 },
      { timestamp: 1700086400, open: 101, high: 106, low: 96, close: 110, volume: 1e6 },
    ];
    const result = formatHistorical("AAPL", bars, "1mo");
    expect(result).toContain("+10.00%");
    expect(result).toContain("$100.00");
    expect(result).toContain("$110.00");
  });

  it("includes monthly breakdown for large datasets", () => {
    const bars: OHLCVBar[] = Array.from({ length: 30 }, (_, i) => ({
      timestamp: 1700000000 + i * 86400,
      open: 100 + i,
      high: 105 + i,
      low: 95 + i,
      close: 100 + i,
      volume: 1e6,
    }));
    const result = formatHistorical("AAPL", bars, "6mo");
    expect(result).toContain("MONTHLY BREAKDOWN");
  });
});
