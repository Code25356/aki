import { invoke } from "@tauri-apps/api/core";
import type { OHLCVBar, StockQuote, TimeRange, Interval, FundamentalsData } from "./types";

async function fetchJson(url: string): Promise<any> {
  const body = await invoke<string>("fetch_url", { url });
  return JSON.parse(body);
}

export async function fetchOHLCV(
  symbol: string,
  range: TimeRange | "1d" | "5d" = "6mo",
  interval: Interval = "1d",
): Promise<{ bars: OHLCVBar[]; meta: any }> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol.toUpperCase())}?interval=${interval}&range=${range}`;
  const data = await fetchJson(url);

  const result = data.chart?.result?.[0];
  if (!result) throw new Error(`No data found for "${symbol}"`);

  const timestamps = result.timestamp || [];
  const quote = result.indicators?.quote?.[0] || {};
  const bars: OHLCVBar[] = [];

  for (let i = 0; i < timestamps.length; i++) {
    const o = quote.open?.[i];
    const h = quote.high?.[i];
    const l = quote.low?.[i];
    const c = quote.close?.[i];
    const v = quote.volume?.[i];
    if (o != null && h != null && l != null && c != null) {
      bars.push({ timestamp: timestamps[i], open: o, high: h, low: l, close: c, volume: v || 0 });
    }
  }

  return { bars, meta: result.meta };
}

export async function fetchQuote(symbol: string): Promise<StockQuote> {
  const { meta } = await fetchOHLCV(symbol, "1d", "1d");

  const price = meta.regularMarketPrice;
  const previousClose = meta.chartPreviousClose || meta.previousClose || price;
  const change = price - previousClose;
  const changePercent = previousClose ? (change / previousClose) * 100 : 0;

  return {
    symbol: meta.symbol,
    name: meta.shortName || meta.longName || meta.symbol,
    price,
    change,
    changePercent,
    high: meta.regularMarketDayHigh || price,
    low: meta.regularMarketDayLow || price,
    open: meta.regularMarketOpen || price,
    previousClose,
    volume: meta.regularMarketVolume || 0,
  };
}

export async function fetchMultipleQuotes(symbols: string[]): Promise<StockQuote[]> {
  const results = await Promise.allSettled(symbols.map(fetchQuote));
  return results
    .filter((r): r is PromiseFulfilledResult<StockQuote> => r.status === "fulfilled")
    .map((r) => r.value);
}

export async function fetchFundamentals(symbol: string): Promise<FundamentalsData> {
  const modules = "financialData,defaultKeyStatistics,summaryProfile,earningsTrend,price";
  const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol.toUpperCase())}?modules=${modules}`;
  const data = await fetchJson(url);

  const result = data.quoteSummary?.result?.[0];
  if (!result) throw new Error(`No fundamentals found for "${symbol}"`);

  const fin = result.financialData || {};
  const stats = result.defaultKeyStatistics || {};
  const profile = result.summaryProfile || {};
  const price = result.price || {};

  const raw = (obj: any, key: string) => obj?.[key]?.raw ?? 0;
  const rawStr = (obj: any, key: string) => obj?.[key] ?? "";

  return {
    symbol: symbol.toUpperCase(),
    name: price.shortName || price.longName || symbol,
    sector: rawStr(profile, "sector"),
    industry: rawStr(profile, "industry"),
    marketCap: raw(price, "marketCap"),
    enterpriseValue: raw(stats, "enterpriseValue"),
    peRatio: raw(stats, "trailingPE") || raw(fin, "trailingPE"),
    forwardPE: raw(stats, "forwardPE"),
    pegRatio: raw(stats, "pegRatio"),
    priceToBook: raw(stats, "priceToBook"),
    priceToSales: raw(stats, "priceToSalesTrailing12Months") || raw(stats, "priceToSales"),
    eps: raw(stats, "trailingEps"),
    forwardEps: raw(stats, "forwardEps"),
    revenue: raw(fin, "totalRevenue"),
    revenueGrowth: raw(fin, "revenueGrowth"),
    grossMargin: raw(fin, "grossMargins"),
    operatingMargin: raw(fin, "operatingMargins"),
    profitMargin: raw(fin, "profitMargins"),
    roe: raw(fin, "returnOnEquity"),
    debtToEquity: raw(fin, "debtToEquity"),
    currentRatio: raw(fin, "currentRatio"),
    freeCashFlow: raw(fin, "freeCashflow"),
    dividendYield: raw(stats, "dividendYield") || raw(stats, "trailingAnnualDividendYield"),
    beta: raw(stats, "beta"),
    fiftyTwoWeekHigh: raw(stats, "fiftyTwoWeekHigh"),
    fiftyTwoWeekLow: raw(stats, "fiftyTwoWeekLow"),
    averageVolume: raw(price, "averageDailyVolume3Month"),
    targetPrice: raw(fin, "targetMeanPrice"),
    recommendationKey: rawStr(fin, "recommendationKey"),
  };
}
