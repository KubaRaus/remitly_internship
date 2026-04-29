import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app";
import type { AuditServiceContract } from "../src/services/auditService";
import type {
  AuditEntry,
  MarketServiceContract,
  OperationType,
  StockQuantity,
  WalletState,
} from "../src/services/marketService";
import {
  BankOutOfStockError,
  StockNotFoundError,
  WalletOutOfStockError,
} from "../src/services/marketService";

class InMemoryMarketService implements MarketServiceContract {
  private bank = new Map<string, number>();
  private wallets = new Map<string, Map<string, number>>();
  private readonly audit: AuditEntry[] = [];
  private lock = Promise.resolve();

  async setBankState(stocks: StockQuantity[]): Promise<void> {
    this.bank.clear();
    for (const stock of stocks) {
      this.bank.set(stock.name, stock.quantity);
    }
  }

  async getBankState(): Promise<StockQuantity[]> {
    return [...this.bank.entries()]
      .map(([name, quantity]) => ({ name, quantity }))
      .filter((s) => s.quantity > 0)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async getWallet(walletId: string): Promise<WalletState> {
    const wallet = this.wallets.get(walletId) ?? new Map<string, number>();
    return {
      id: walletId,
      stocks: [...wallet.entries()]
        .map(([name, quantity]) => ({ name, quantity }))
        .filter((s) => s.quantity > 0)
        .sort((a, b) => a.name.localeCompare(b.name)),
    };
  }

  async getWalletStockQuantity(walletId: string, stockName: string): Promise<number> {
    return this.wallets.get(walletId)?.get(stockName) ?? 0;
  }

  async processWalletOperation(walletId: string, stockName: string, type: OperationType): Promise<void> {
    const run = this.lock.then(async () => {
      if (!this.bank.has(stockName)) {
        throw new StockNotFoundError("Stock does not exist.");
      }

      const wallet = this.wallets.get(walletId) ?? new Map<string, number>();
      this.wallets.set(walletId, wallet);

      if (type === "buy") {
        const bankQty = this.bank.get(stockName) ?? 0;
        if (bankQty <= 0) {
          throw new BankOutOfStockError("There is no stock in bank.");
        }
        this.bank.set(stockName, bankQty - 1);
        wallet.set(stockName, (wallet.get(stockName) ?? 0) + 1);
      } else {
        const walletQty = wallet.get(stockName) ?? 0;
        if (walletQty <= 0) {
          throw new WalletOutOfStockError("There is no stock in wallet.");
        }
        walletQty === 1 ? wallet.delete(stockName) : wallet.set(stockName, walletQty - 1);
        this.bank.set(stockName, (this.bank.get(stockName) ?? 0) + 1);
      }

      this.audit.push({ type, wallet_id: walletId, stock_name: stockName });
    });

    this.lock = run.catch(() => undefined);
    return run;
  }

  getAuditEntries(): AuditEntry[] {
    return [...this.audit];
  }
}

class InMemoryAuditService implements AuditServiceContract {
  constructor(private readonly marketService: InMemoryMarketService) {}

  async getLog(): Promise<AuditEntry[]> {
    return this.marketService.getAuditEntries();
  }
}

function createTestApp() {
  const market = new InMemoryMarketService();
  const audit = new InMemoryAuditService(market);
  return buildApp({ marketService: market, auditService: audit });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("stock market api", () => {
  it("handles bank setup and buy/sell flow", async () => {
    const app = createTestApp();

    await app.inject({
      method: "POST",
      url: "/stocks",
      payload: { stocks: [{ name: "stock1", quantity: 2 }] },
    });

    const buyResponse = await app.inject({
      method: "POST",
      url: "/wallets/w1/stocks/stock1",
      payload: { type: "buy" },
    });
    expect(buyResponse.statusCode).toBe(200);

    const walletResponse = await app.inject({
      method: "GET",
      url: "/wallets/w1",
    });
    expect(walletResponse.json()).toEqual({
      id: "w1",
      stocks: [{ name: "stock1", quantity: 1 }],
    });

    const quantityResponse = await app.inject({
      method: "GET",
      url: "/wallets/w1/stocks/stock1",
    });
    expect(quantityResponse.json()).toBe(1);

    const sellResponse = await app.inject({
      method: "POST",
      url: "/wallets/w1/stocks/stock1",
      payload: { type: "sell" },
    });
    expect(sellResponse.statusCode).toBe(200);

    const logResponse = await app.inject({ method: "GET", url: "/log" });
    expect(logResponse.json()).toEqual({
      log: [
        { type: "buy", wallet_id: "w1", stock_name: "stock1" },
        { type: "sell", wallet_id: "w1", stock_name: "stock1" },
      ],
    });

    await app.close();
  });

  it("returns expected errors and statuses", async () => {
    const app = createTestApp();

    await app.inject({
      method: "POST",
      url: "/stocks",
      payload: { stocks: [{ name: "stockX", quantity: 0 }] },
    });

    const stockNotFound = await app.inject({
      method: "POST",
      url: "/wallets/w2/stocks/does-not-exist",
      payload: { type: "buy" },
    });
    expect(stockNotFound.statusCode).toBe(404);

    const bankEmpty = await app.inject({
      method: "POST",
      url: "/wallets/w2/stocks/stockX",
      payload: { type: "buy" },
    });
    expect(bankEmpty.statusCode).toBe(400);

    const walletEmpty = await app.inject({
      method: "POST",
      url: "/wallets/w2/stocks/stockX",
      payload: { type: "sell" },
    });
    expect(walletEmpty.statusCode).toBe(400);

    const logResponse = await app.inject({ method: "GET", url: "/log" });
    expect(logResponse.json()).toEqual({ log: [] });

    await app.close();
  });

  it("supports concurrent buys without going below zero", async () => {
    const app = createTestApp();

    await app.inject({
      method: "POST",
      url: "/stocks",
      payload: { stocks: [{ name: "stock-concurrent", quantity: 10 }] },
    });

    const responses = await Promise.all(
      Array.from({ length: 20 }).map((_, i) =>
        app.inject({
          method: "POST",
          url: `/wallets/w${i}/stocks/stock-concurrent`,
          payload: { type: "buy" },
        }),
      ),
    );

    const successCount = responses.filter((response) => response.statusCode === 200).length;
    const failureCount = responses.filter((response) => response.statusCode === 400).length;
    expect(successCount).toBe(10);
    expect(failureCount).toBe(10);

    const bankState = await app.inject({ method: "GET", url: "/stocks" });
    expect(bankState.json()).toEqual({ stocks: [] });

    await app.close();
  });

  it("returns 200 on chaos and attempts process termination", async () => {
    const app = createTestApp();
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);

    const response = await app.inject({ method: "POST", url: "/chaos" });
    expect(response.statusCode).toBe(200);

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(exitSpy).toHaveBeenCalledWith(1);

    await app.close();
  });
});
