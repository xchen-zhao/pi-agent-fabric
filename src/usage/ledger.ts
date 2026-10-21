import { randomUUID } from "node:crypto";
import { chmodSync, mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { AgentResult, ExecutionRequest } from "../core/execution-types.js";
import type { RuntimeId } from "../core/types.js";

const SCHEMA_VERSION = 2;

export interface UsageSummary {
  runtime: RuntimeId;
  runs: number;
  completed: number;
  failed: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  costUsd: number;
  lastRunAt?: string;
}

export interface RecentRun {
  id: string;
  runtime: RuntimeId;
  status: "completed" | "failed";
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  errorCategory?: string;
  costUsd?: number;
}

/** Quota-relevant metadata for one run. Never includes prompts, output text or working directories. */
export interface QuotaSignalRun {
  runtime: RuntimeId;
  status: "completed" | "failed";
  finishedAt: string;
  errorCategory?: string;
  quotaStatus?: string;
  quotaResetAt?: string;
  retryAfterMs?: number;
}

export function defaultLedgerPath(): string {
  return process.env.PI_AGENT_FABRIC_LEDGER_PATH
    ?? path.join(os.homedir(), ".local", "share", "pi-agent-fabric", "fabric.db");
}

export class UsageLedger {
  private constructor(
    private readonly database: DatabaseSync,
    readonly filePath: string,
  ) {}

  static open(filePath = defaultLedgerPath()): UsageLedger {
    if (filePath !== ":memory:") {
      mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
    }
    const database = new DatabaseSync(filePath);
    try {
      if (filePath !== ":memory:") chmodSync(filePath, 0o600);
      database.exec("PRAGMA busy_timeout = 5000");
      if (filePath !== ":memory:") database.exec("PRAGMA journal_mode = WAL");
      const ledger = new UsageLedger(database, filePath);
      ledger.migrate();
      return ledger;
    } catch (error) {
      database.close();
      throw error;
    }
  }

  close(): void {
    this.database.close();
  }

  record(request: ExecutionRequest, result: AgentResult, startedAt: Date, finishedAt = new Date()): string {
    const id = randomUUID();
    this.database.prepare(`
      INSERT INTO agent_runs (
        id, runtime, mode, status, started_at, finished_at, duration_ms,
        input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, cost_usd,
        error_category, quota_status, quota_confidence, quota_reset_at, log_path, retry_after_ms
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      request.runtime,
      request.mode,
      result.status,
      startedAt.toISOString(),
      finishedAt.toISOString(),
      result.process.durationMs,
      result.usage.inputTokens ?? null,
      result.usage.outputTokens ?? null,
      result.usage.cacheReadTokens ?? null,
      result.usage.cacheWriteTokens ?? null,
      result.usage.costUsd ?? null,
      result.error?.category ?? null,
      result.quota?.status ?? null,
      result.quota?.confidence ?? null,
      result.quota?.resetAt ?? null,
      result.process.fullOutputPath ?? null,
      result.error?.retryAfterMs ?? null,
    );
    return id;
  }

  summaries(): UsageSummary[] {
    const rows = this.database.prepare(`
      SELECT
        runtime,
        COUNT(*) AS runs,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed,
        COALESCE(SUM(input_tokens), 0) AS input_tokens,
        COALESCE(SUM(output_tokens), 0) AS output_tokens,
        COALESCE(SUM(cache_read_tokens), 0) AS cache_read_tokens,
        COALESCE(SUM(cache_write_tokens), 0) AS cache_write_tokens,
        COALESCE(SUM(cost_usd), 0) AS cost_usd,
        MAX(finished_at) AS last_run_at
      FROM agent_runs
      GROUP BY runtime
      ORDER BY runtime
    `).all() as Array<Record<string, string | number | null>>;

    return rows.map((row) => ({
      runtime: row.runtime as RuntimeId,
      runs: Number(row.runs),
      completed: Number(row.completed),
      failed: Number(row.failed),
      inputTokens: Number(row.input_tokens),
      outputTokens: Number(row.output_tokens),
      cacheReadTokens: Number(row.cache_read_tokens),
      cacheWriteTokens: Number(row.cache_write_tokens),
      costUsd: Number(row.cost_usd),
      ...(typeof row.last_run_at === "string" ? { lastRunAt: row.last_run_at } : {}),
    }));
  }

  recent(limit = 20): RecentRun[] {
    if (!Number.isInteger(limit) || limit < 1 || limit > 1_000) throw new Error("Recent run limit must be between 1 and 1000");
    const rows = this.database.prepare(`
      SELECT id, runtime, status, started_at, finished_at, duration_ms, error_category, cost_usd
      FROM agent_runs
      ORDER BY finished_at DESC
      LIMIT ?
    `).all(limit) as Array<Record<string, string | number | null>>;
    return rows.map((row) => ({
      id: String(row.id),
      runtime: row.runtime as RuntimeId,
      status: row.status as "completed" | "failed",
      startedAt: String(row.started_at),
      finishedAt: String(row.finished_at),
      durationMs: Number(row.duration_ms),
      ...(typeof row.error_category === "string" ? { errorCategory: row.error_category } : {}),
      ...(typeof row.cost_usd === "number" ? { costUsd: row.cost_usd } : {}),
    }));
  }

  /** Runs finished at or after `since`, newest first, for quota-state derivation. */
  quotaSignals(since: Date, limit = 500): QuotaSignalRun[] {
    if (!Number.isInteger(limit) || limit < 1 || limit > 10_000) throw new Error("Quota signal limit must be between 1 and 10000");
    const rows = this.database.prepare(`
      SELECT runtime, status, finished_at, error_category, quota_status, quota_reset_at, retry_after_ms
      FROM agent_runs
      WHERE finished_at >= ?
      ORDER BY finished_at DESC
      LIMIT ?
    `).all(since.toISOString(), limit) as Array<Record<string, string | number | null>>;
    return rows.map((row) => ({
      runtime: row.runtime as RuntimeId,
      status: row.status as "completed" | "failed",
      finishedAt: String(row.finished_at),
      ...(typeof row.error_category === "string" ? { errorCategory: row.error_category } : {}),
      ...(typeof row.quota_status === "string" ? { quotaStatus: row.quota_status } : {}),
      ...(typeof row.quota_reset_at === "string" ? { quotaResetAt: row.quota_reset_at } : {}),
      ...(typeof row.retry_after_ms === "number" ? { retryAfterMs: row.retry_after_ms } : {}),
    }));
  }

  private migrate(): void {
    const version = Number((this.database.prepare("PRAGMA user_version").get() as { user_version: number }).user_version);
    if (version > SCHEMA_VERSION) {
      throw new Error(`Usage ledger schema ${version} is newer than supported schema ${SCHEMA_VERSION}`);
    }
    if (version === 0) {
      this.database.exec(`
        BEGIN;
        CREATE TABLE agent_runs (
          id TEXT PRIMARY KEY,
          runtime TEXT NOT NULL,
          mode TEXT NOT NULL,
          status TEXT NOT NULL CHECK (status IN ('completed', 'failed')),
          started_at TEXT NOT NULL,
          finished_at TEXT NOT NULL,
          duration_ms INTEGER NOT NULL,
          input_tokens INTEGER,
          output_tokens INTEGER,
          cache_read_tokens INTEGER,
          cache_write_tokens INTEGER,
          cost_usd REAL,
          error_category TEXT,
          quota_status TEXT,
          quota_confidence TEXT,
          quota_reset_at TEXT,
          log_path TEXT,
          retry_after_ms INTEGER
        );
        CREATE INDEX idx_agent_runs_runtime_finished ON agent_runs(runtime, finished_at DESC);
        PRAGMA user_version = 2;
        COMMIT;
      `);
      return;
    }
    if (version === 1) {
      this.database.exec(`
        BEGIN;
        ALTER TABLE agent_runs ADD COLUMN retry_after_ms INTEGER;
        PRAGMA user_version = 2;
        COMMIT;
      `);
    }
  }
}
