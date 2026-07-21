import type {
  AgentEvent,
  CommandSpec,
  ExecutionRequest,
  ProcessResult,
  RuntimeError,
} from "../core/execution-types.js";
import type { RuntimeDefinition, RuntimeId } from "../core/types.js";

export interface AgentRuntimeAdapter {
  readonly id: RuntimeId;
  readonly definition: RuntimeDefinition;

  buildCommand(request: ExecutionRequest): CommandSpec;
  parseLine(line: string): AgentEvent[];
  classifyError(result: ProcessResult): RuntimeError | undefined;
}

export function promptPlaceholder(prompt: string): string {
  return `<prompt:${Buffer.byteLength(prompt, "utf8")} bytes>`;
}

export function classifyCommonError(result: ProcessResult): RuntimeError | undefined {
  if (result.aborted) return { category: "aborted", message: "Execution aborted", retryable: false };
  if (result.timedOut) return { category: "timeout", message: "Execution timed out", retryable: true };
  if (result.exitCode === 0) return undefined;

  const output = `${result.stderr}\n${result.stdout}`.toLowerCase();
  if (/rate.?limit|too many requests|\b429\b/.test(output)) {
    return { category: "rate-limited", message: "Runtime reported rate limiting", retryable: true };
  }
  if (/quota|usage limit|limit reached|credits? exhausted/.test(output)) {
    return { category: "quota-exhausted", message: "Runtime reported exhausted quota", retryable: true };
  }
  if (/unauthorized|authentication|not logged in|login required|invalid.*(?:token|key)|\b401\b/.test(output)) {
    return { category: "authentication", message: "Runtime authentication failed", retryable: false };
  }
  return {
    category: "unknown",
    message: `Runtime exited with code ${result.exitCode ?? "unknown"}`,
    retryable: false,
  };
}

export function parseJsonLine(line: string): Record<string, unknown> | undefined {
  try {
    const value: unknown = JSON.parse(line);
    return value !== null && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}
