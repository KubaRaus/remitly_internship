import type Redis from "ioredis";
import type { AuditEntry } from "./marketService";

export interface AuditServiceContract {
  getLog(): Promise<AuditEntry[]>;
}

export class AuditService implements AuditServiceContract {
  private readonly auditLogKey = "audit:log";

  constructor(private readonly redis: Redis) {}

  async getLog(): Promise<AuditEntry[]> {
    const rawEntries = await this.redis.lrange(this.auditLogKey, 0, -1);
    return rawEntries.map((entry) => JSON.parse(entry) as AuditEntry);
  }
}
