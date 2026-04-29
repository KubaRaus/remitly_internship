import type { FastifyInstance } from "fastify";

export async function registerChaosRoutes(app: FastifyInstance): Promise<void> {
  app.post("/chaos", async (_request, reply) => {
    reply.status(200).send({ status: "terminating" });

    setTimeout(() => {
      process.exit(1);
    }, 25);
  });
}
