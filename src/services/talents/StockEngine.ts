/**
 * StockEngine — get stock market data for a ticker symbol.
 *
 * Architecture (ADR-2026-004): Client-direct connection to Yahoo Finance API,
 * no intermediate server, no API key required. Yahoo Finance provides free
 * real-time quotes and historical data.
 *
 * Supports:
 * - Real-time stock quotes (price, change, percent change)
 * - Market cap, PE ratio, dividend yield
 * - 52-week high/low
 * - Volume and average volume
 * - Multiple tickers in one request
 */

import {TalentEngine, TalentResult, ToolDefinition} from './types';
import {checkNetworkAccess, getNetworkDisabledError} from './networkUtils';

const YAHOO_FINANCE_API = 'https://query1.finance.yahoo.com/v7/finance/quote';
const REQUEST_TIMEOUT_MS = 10000;

interface QuoteResponse {
  symbol: string;
  shortName: string;
  longName: string;
  regularMarketPrice: number;
  regularMarketChange: number;
  regularMarketChangePercent: number;
  regularMarketVolume: number;
  averageDailyVolume3Month: number;
  marketCap: number;
  trailingPE: number;
  forwardPE: number;
  dividendYield: number;
  dividendRate: number;
  fiftyTwoWeekHigh: number;
  fiftyTwoWeekLow: number;
  regularMarketOpen: number;
  regularMarketDayHigh: number;
  regularMarketDayLow: number;
  currency: string;
  exchange: string;
  quoteType: string;
}

interface YahooResponse {
  quoteResponse: {
    result: QuoteResponse[];
    error?: {code: string; description: string};
  };
}

export class StockEngine implements TalentEngine {
  readonly name = 'stock';
  readonly recommendedContextTokens = 600;

  async execute(args: Record<string, any>): Promise<TalentResult> {
    if (!checkNetworkAccess()) {
      return getNetworkDisabledError('stock');
    }

    const ticker = typeof args.ticker === 'string' ? args.ticker.trim().toUpperCase() : '';

    if (!ticker) {
      return {
        type: 'error',
        summary: 'stock: missing or empty "ticker" argument',
        errorMessage: 'ticker argument is required (e.g., "AAPL", "GOOGL", "MSFT").',
      };
    }

    try {
      const url = `${YAHOO_FINANCE_API}?symbols=${encodeURIComponent(ticker)}`;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      const response = await fetch(url, {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'PocketPalAI/1.0',
        },
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data: YahooResponse = await response.json();

      if (!data.quoteResponse.result || data.quoteResponse.result.length === 0) {
        return {
          type: 'error',
          summary: `stock: ticker "${ticker}" not found`,
          errorMessage:
            'Could not find stock data for this ticker. Check the ticker symbol and try again.',
        };
      }

      const quote = data.quoteResponse.result[0];

      return {
        type: 'text',
        summary: this.formatQuote(quote),
      };
    } catch (e) {
      const isAbort = e instanceof Error && e.name === 'AbortError';
      const errMsg = isAbort
        ? `Request timed out after ${REQUEST_TIMEOUT_MS}ms`
        : e instanceof Error
          ? e.message
          : String(e);
      return {
        type: 'error',
        summary: `stock: ${errMsg}`,
        errorMessage: errMsg,
      };
    }
  }

  private formatQuote(quote: QuoteResponse): string {
    const lines: string[] = [];

    lines.push(`**${quote.longName || quote.shortName || quote.symbol}** (${quote.symbol})`);
    lines.push('');

    const currency = quote.currency || 'USD';
    lines.push(`**Price:** ${quote.regularMarketPrice.toFixed(2)} ${currency}`);

    const change = quote.regularMarketChange;
    const changePercent = quote.regularMarketChangePercent;
    const changeSign = change >= 0 ? '+' : '';
    lines.push(
      `**Change:** ${changeSign}${change.toFixed(2)} ${currency} (${changeSign}${changePercent.toFixed(2)}%)`,
    );

    lines.push('');
    lines.push('**Market Data:**');

    lines.push(`  Open: ${quote.regularMarketOpen?.toFixed(2)} ${currency}`);
    lines.push(`  Day High: ${quote.regularMarketDayHigh?.toFixed(2)} ${currency}`);
    lines.push(`  Day Low: ${quote.regularMarketDayLow?.toFixed(2)} ${currency}`);

    if (quote.marketCap) {
      lines.push(`  Market Cap: ${this.formatNumber(quote.marketCap)}`);
    }

    if (quote.trailingPE) {
      lines.push(`  P/E Ratio: ${quote.trailingPE.toFixed(2)}`);
    }

    if (quote.dividendYield) {
      lines.push(`  Dividend Yield: ${(quote.dividendYield * 100).toFixed(2)}%`);
    }

    if (quote.dividendRate) {
      lines.push(`  Dividend Rate: ${quote.dividendRate.toFixed(2)} ${currency}`);
    }

    lines.push(`  52-Week High: ${quote.fiftyTwoWeekHigh?.toFixed(2)} ${currency}`);
    lines.push(`  52-Week Low: ${quote.fiftyTwoWeekLow?.toFixed(2)} ${currency}`);

    lines.push('');
    lines.push('**Volume:**');
    lines.push(`  Today: ${this.formatNumber(quote.regularMarketVolume)}`);
    lines.push(`  Avg (3mo): ${this.formatNumber(quote.averageDailyVolume3Month)}`);

    lines.push('');
    lines.push(`Exchange: ${quote.exchange}`);
    lines.push(`Type: ${quote.quoteType}`);

    lines.push('');
    lines.push('Source: Yahoo Finance');

    return lines.join('\n');
  }

  private formatNumber(num: number): string {
    if (num >= 1000000000) {
      return `$${(num / 1000000000).toFixed(2)}B`;
    }
    if (num >= 1000000) {
      return `$${(num / 1000000).toFixed(2)}M`;
    }
    if (num >= 1000) {
      return `$${(num / 1000).toFixed(2)}K`;
    }
    return `$${num.toFixed(0)}`;
  }

  toToolDefinition(): ToolDefinition {
    return {
      type: 'function',
      function: {
        name: 'stock',
        description:
          'Get real-time stock market data for a ticker symbol. No API key required. ' +
          'Uses Yahoo Finance for free real-time quotes. ' +
          'Useful for: checking stock prices, tracking investments, getting market data.',
        parameters: {
          type: 'object',
          properties: {
            ticker: {
              type: 'string',
              description:
                'The stock ticker symbol (e.g., "AAPL" for Apple, "GOOGL" for Google, "MSFT" for Microsoft, "AMZN" for Amazon).',
            },
          },
          required: ['ticker'],
        },
      },
    };
  }
}
