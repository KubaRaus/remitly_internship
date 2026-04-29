import type { FastifyInstance } from "fastify";

export async function registerLogRoutes(app: FastifyInstance): Promise<void> {
  app.get("/log", async () => {
    const log = await app.auditService.getLog();
    return { log };
  });
}
