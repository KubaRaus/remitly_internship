import type Redis from "ioredis";

export type OperationType = "buy" | "sell";

export interface StockQuantity {
  name: string;
  quantity: number;
}

export interface WalletState {
  id: string;
  stocks: StockQuantity[];
}

export interface MarketServiceContract {
  setBankState(stocks: StockQuantity[]): Promise<void>;
  getBankState(): Promise<StockQuantity[]>;
  getWallet(walletId: string): Promise<WalletState>;
  getWalletStockQuantity(walletId: string, stockName: string): Promise<number>;
  processWalletOperation(walletId: string, stockName: string, type: OperationType): Promise<void>;
}

export interface AuditEntry {
  type: OperationType;
  wallet_id: string;
  stock_name: string;
}

export class StockNotFoundError extends Error {}
export class BankOutOfStockError extends Error {}
export class WalletOutOfStockError extends Error {}

const OPERATION_SCRIPT = `
local bankKey = KEYS[1]
local walletKey = KEYS[2]
local logKey = KEYS[3]
local stock = ARGV[1]
local walletId = ARGV[2]
local op = ARGV[3]
local logPayload = ARGV[4]

if redis.call("HEXISTS", bankKey, stock) == 0 then
  return "STOCK_NOT_FOUND"
end

if op == "buy" then
  local bankQty = tonumber(redis.call("HGET", bankKey, stock))
  if bankQty <= 0 then
    return "BANK_EMPTY"
  end
  redis.call("HINCRBY", bankKey, stock, -1)
  redis.call("HINCRBY", walletKey, stock, 1)
elseif op == "sell" then
  local walletQtyRaw = redis.call("HGET", walletKey, stock)
  local walletQty = tonumber(walletQtyRaw or "0")
  if walletQty <= 0 then
    return "WALLET_EMPTY"
  end
  local newWalletQty = redis.call("HINCRBY", walletKey, stock, -1)
  if tonumber(newWalletQty) == 0 then
    redis.call("HDEL", walletKey, stock)
  end
  redis.call("HINCRBY", bankKey, stock, 1)
else
  return "UNKNOWN_OP"
end

redis.call("RPUSH", logKey, logPayload)
return "OK"
`;

export class MarketService implements MarketServiceContract {
  private readonly bankStocksKey = "bank:stocks";
  private readonly auditLogKey = "audit:log";

  constructor(private readonly redis: Redis) {}

  async setBankState(stocks: StockQuantity[]): Promise<void> {
    const pipeline = this.redis.pipeline();
    pipeline.del(this.bankStocksKey);

    if (stocks.length > 0) {
      const stockMap: Record<string, string> = {};
      for (const stock of stocks) {
        stockMap[stock.name] = String(stock.quantity);
      }
      pipeline.hset(this.bankStocksKey, stockMap);
    }

    await pipeline.exec();
  }

  async getBankState(): Promise<StockQuantity[]> {
    const raw = await this.redis.hgetall(this.bankStocksKey);
    return this.mapToStocks(raw);
  }

  async getWallet(walletId: string): Promise<WalletState> {
    const walletStocks = await this.redis.hgetall(this.walletKey(walletId));
    return {
      id: walletId,
      stocks: this.mapToStocks(walletStocks),
    };
  }

  async getWalletStockQuantity(walletId: string, stockName: string): Promise<number> {
    const quantityRaw = await this.redis.hget(this.walletKey(walletId), stockName);
    return Number(quantityRaw ?? "0");
  }

  async processWalletOperation(walletId: string, stockName: string, type: OperationType): Promise<void> {
    const logEntry: AuditEntry = {
      type,
      wallet_id: walletId,
      stock_name: stockName,
    };

    const result = await this.redis.eval(
      OPERATION_SCRIPT,
      3,
      this.bankStocksKey,
      this.walletKey(walletId),
      this.auditLogKey,
      stockName,
      walletId,
      type,
      JSON.stringify(logEntry),
    );

    switch (result) {
      case "OK":
        return;
      case "STOCK_NOT_FOUND":
        throw new StockNotFoundError("Stock does not exist.");
      case "BANK_EMPTY":
        throw new BankOutOfStockError("There is no stock in bank.");
      case "WALLET_EMPTY":
        throw new WalletOutOfStockError("There is no stock in wallet.");
      default:
        throw new Error(`Unhandled operation result: ${String(result)}`);
    }
  }

  private walletKey(walletId: string): string {
    return `wallet:${walletId}:stocks`;
  }

  private mapToStocks(rawMap: Record<string, string>): StockQuantity[] {
    return Object.entries(rawMap)
      .map(([name, quantity]) => ({
        name,
        quantity: Number(quantity),
      }))
      .filter((stock) => stock.quantity > 0)
      .sort((a, b) => a.name.localeCompare(b.name));
  }
}
