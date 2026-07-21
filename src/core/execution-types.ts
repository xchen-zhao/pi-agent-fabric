import type { RuntimeId } from "./types.js";

export type ExecutionMode = "read-only";
export type OutputFormat = "json" | "jsonl" | "text";

export interface ExecutionRequest {
  runtime: RuntimeId;
  prompt: string;
  cwd: string;
  mode: ExecutionMode;
  timeoutMs: number;
}

export interface TemporaryFileSpec {
  token: string;
  content: string;
  fileName: string;
}

export interface CommandSpec {
  command: string;
  args: string[];
  displayArgs: string[];
  cwd: string;
  stdin?: string;
  temporaryFiles?: TemporaryFileSpec[];
  outputFormat: OutputFormat;
  timeoutMs: number;
  readOnlyEnforcement: "native" | "best-effort";
  safetyNote?: string;
}

export type AgentEvent =
  | { type: "run.started"; runtime: RuntimeId; timestamp: string }
  | { type: "message.delta"; text: string; timestamp: string }
  | { type: "tool.started"; name: string; timestamp: string }
  | { type: "tool.finished"; name: string; isError: boolean; timestamp: string }
  | {
      type: "usage.updated";
      inputTokens?: number;
      outputTokens?: number;
      cacheReadTokens?: number;
      cacheWriteTokens?: number;
      costUsd?: number;
      timestamp: string;
    }
  | {
      type: "quota.updated";
      status: "available" | "constrained" | "cooldown" | "exhausted" | "unknown";
      confidence: "reported";
      resetAt?: string;
      timestamp: string;
    }
  | { type: "run.completed"; timestamp: string }
  | { type: "run.failed"; category: RuntimeErrorCategory; message: string; timestamp: string };

export type RuntimeErrorCategory =
  | "aborted"
  | "audit-log-failed"
  | "authentication"
  | "executable-not-found"
  | "invalid-output"
  | "quota-exhausted"
  | "rate-limited"
  | "spawn-failed"
  | "timeout"
  | "unsafe-execution"
  | "unknown";

export interface ProcessResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  timedOut: boolean;
  aborted: boolean;
  truncated: boolean;
  fullOutputPath?: string;
  spawnError?: string;
  logError?: string;
  durationMs: number;
}

export interface RuntimeError {
  category: RuntimeErrorCategory;
  message: string;
  retryable: boolean;
  retryAfterMs?: number;
}

export interface AgentUsage {
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  costUsd?: number;
}

export interface AgentResult {
  runtime: RuntimeId;
  status: "completed" | "failed";
  text: string;
  usage: AgentUsage;
  quota?: Extract<AgentEvent, { type: "quota.updated" }>;
  error?: RuntimeError;
  process: {
    exitCode: number | null;
    signal: NodeJS.Signals | null;
    durationMs: number;
    timedOut: boolean;
    aborted: boolean;
    truncated: boolean;
    fullOutputPath?: string;
  };
}

export interface DryRunPlan {
  runtime: RuntimeId;
  executable: string;
  args: string[];
  cwd: string;
  mode: ExecutionMode;
  outputFormat: OutputFormat;
  timeoutMs: number;
  promptDelivery: "stdin" | "argument" | "file";
  readOnlyEnforcement: "native" | "best-effort";
  safetyNote?: string;
}
