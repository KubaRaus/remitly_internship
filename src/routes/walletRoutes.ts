import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  BankOutOfStockError,
  StockNotFoundError,
  WalletOutOfStockError,
} from "../services/marketService";

const operationBodySchema = z.object({
  type: z.union([z.literal("buy"), z.literal("sell")]),
});

export async function registerWalletRoutes(app: FastifyInstance): Promise<void> {
  app.post("/wallets/:wallet_id/stocks/:stock_name", async (request, reply) => {
    const params = z
      .object({
        wallet_id: z.string().min(1),
        stock_name: z.string().min(1),
      })
      .parse(request.params);
    const body = operationBodySchema.parse(request.body);

    try {
      await app.marketService.processWalletOperation(params.wallet_id, params.stock_name, body.type);
      return reply.status(200).send();
    } catch (error) {
      if (error instanceof StockNotFoundError) {
        return reply.status(404).send({ message: error.message });
      }
      if (error instanceof BankOutOfStockError || error instanceof WalletOutOfStockError) {
        return reply.status(400).send({ message: error.message });
      }
      throw error;
    }
  });

  app.get("/wallets/:wallet_id", async (request) => {
    const params = z.object({ wallet_id: z.string().min(1) }).parse(request.params);
    return app.marketService.getWallet(params.wallet_id);
  });

  app.get("/wallets/:wallet_id/stocks/:stock_name", async (request) => {
    const params = z
      .object({
        wallet_id: z.string().min(1),
        stock_name: z.string().min(1),
      })
      .parse(request.params);

    return app.marketService.getWalletStockQuantity(params.wallet_id, params.stock_name);
  });
}
