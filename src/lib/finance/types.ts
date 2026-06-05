export interface OHLCVBar {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface StockQuote {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  high: number;
  low: number;
  open: number;
  previousClose: number;
  volume: number;
}

export interface MACDResult {
  macd: number;
  signal: number;
  histogram: number;
  crossover: "bullish" | "bearish" | "none";
  crossoverBarsAgo: number;
}

export interface BollingerResult {
  upper: number;
  middle: number;
  lower: number;
  percentB: number; // 0-100 position within bands
  bandwidth: number; // % width of bands
  squeeze: boolean; // bandwidth below threshold
}

export interface StochasticResult {
  k: number;
  d: number;
  crossover: "bullish" | "bearish" | "none";
}

export interface SupportResistance {
  supports: number[];
  resistances: number[];
}

export interface FibonacciLevels {
  high: number;
  low: number;
  levels: { ratio: number; price: number }[];
}

export interface VolumeAnalysis {
  obv: number;
  obvTrend: "rising" | "falling" | "flat";
  relativeVolume: number; // vs 20-day avg
  accumulationDistribution: number;
  adTrend: "accumulation" | "distribution" | "neutral";
}

export interface TechnicalIndicators {
  sma20: number;
  sma50: number;
  sma200: number;
  ema12: number;
  ema26: number;
  rsi: number;
  macd: MACDResult;
  bollinger: BollingerResult;
  atr: number;
  stochastic: StochasticResult;
  roc: number; // Rate of Change %
  volume: VolumeAnalysis;
  supportResistance: SupportResistance;
  fibonacci: FibonacciLevels;
  trendAlignment: "bullish" | "bearish" | "mixed";
  goldenCross: boolean;
  deathCross: boolean;
  crossDaysAgo: number | null;
}

export type SignalRating = "STRONG_BUY" | "BUY" | "HOLD" | "SELL" | "STRONG_SELL";

export interface Signal {
  rating: SignalRating;
  score: number; // -1.0 to +1.0
  confidence: number; // 0-100%
  reasons: string[];
  watchLevels: { label: string; price: number }[];
  risks: string[];
}

export interface TechnicalReport {
  symbol: string;
  name: string;
  price: number;
  timeframe: string;
  indicators: TechnicalIndicators;
  signal: Signal;
}

export interface FundamentalsData {
  symbol: string;
  name: string;
  sector: string;
  industry: string;
  marketCap: number;
  enterpriseValue: number;
  peRatio: number;
  forwardPE: number;
  pegRatio: number;
  priceToBook: number;
  priceToSales: number;
  eps: number;
  forwardEps: number;
  revenue: number;
  revenueGrowth: number;
  grossMargin: number;
  operatingMargin: number;
  profitMargin: number;
  roe: number;
  debtToEquity: number;
  currentRatio: number;
  freeCashFlow: number;
  dividendYield: number;
  beta: number;
  fiftyTwoWeekHigh: number;
  fiftyTwoWeekLow: number;
  averageVolume: number;
  targetPrice: number;
  recommendationKey: string;
}

export interface ComparisonEntry {
  symbol: string;
  name: string;
  price: number;
  changePercent: number;
  marketCap: number;
  peRatio: number;
  revenue: number;
  profitMargin: number;
  revenueGrowth: number;
  beta: number;
  // TA summary
  rsi?: number;
  signal?: SignalRating;
}

export interface SectorEntry {
  name: string;
  etf: string;
  returnPercent: number;
  price: number;
}

export type TimeRange = "1mo" | "3mo" | "6mo" | "1y" | "2y" | "5y" | "ytd";
export type Interval = "1d" | "1wk" | "1mo";
export type AnalysisTimeframe = "short" | "medium" | "long";
