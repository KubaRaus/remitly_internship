import Redis from "ioredis";

let redisClient: Redis | null = null;

export function getRedisClient(): Redis {
  if (!redisClient) {
    const redisUrl = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";
    redisClient = new Redis(redisUrl);
  }
  return redisClient;
}
