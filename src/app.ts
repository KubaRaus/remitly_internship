import Fastify, { type FastifyInstance } from "fastify";
import { ZodError } from "zod";
import { registerChaosRoutes } from "./routes/chaosRoutes";
import { registerLogRoutes } from "./routes/logRoutes";
import { registerStocksRoutes } from "./routes/stocksRoutes";
import { registerWalletRoutes } from "./routes/walletRoutes";
import { AuditService, type AuditServiceContract } from "./services/auditService";
import { MarketService, type MarketServiceContract } from "./services/marketService";
import { getRedisClient } from "./storage/redisClient";

declare module "fastify" {
  interface FastifyInstance {
    marketService: MarketServiceContract;
    auditService: AuditServiceContract;
  }
}

interface BuildAppOptions {
  marketService?: MarketServiceContract;
  auditService?: AuditServiceContract;
}

export function buildApp(options?: BuildAppOptions): FastifyInstance {
  const app = Fastify({ logger: true });
  const redis = options?.marketService && options?.auditService ? null : getRedisClient();

  app.decorate("marketService", options?.marketService ?? new MarketService(redis!));
  app.decorate("auditService", options?.auditService ?? new AuditService(redis!));

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      return reply.status(400).send({
        message: "Invalid request body or parameters.",
        details: error.issues,
      });
    }

    app.log.error(error);
    return reply.status(500).send({ message: "Internal server error." });
  });

  app.register(registerWalletRoutes);
  app.register(registerStocksRoutes);
  app.register(registerLogRoutes);
  app.register(registerChaosRoutes);

  return app;
}
