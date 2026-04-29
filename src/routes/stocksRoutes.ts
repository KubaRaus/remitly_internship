import type { FastifyInstance } from "fastify";
import { z } from "zod";

const stockSchema = z.object({
  name: z.string().min(1),
  quantity: z.number().int().nonnegative(),
});

export async function registerStocksRoutes(app: FastifyInstance): Promise<void> {
  app.get("/stocks", async () => {
    const stocks = await app.marketService.getBankState();
    return { stocks };
  });

  app.post("/stocks", async (request, reply) => {
    const body = z.object({ stocks: z.array(stockSchema) }).parse(request.body);
    await app.marketService.setBankState(body.stocks);
    return reply.status(200).send();
  });
}
