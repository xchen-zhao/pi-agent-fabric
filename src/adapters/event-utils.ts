import type { AgentEvent } from "../core/execution-types.js";

export function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

export function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export function usageEvent(values: {
  inputTokens?: number | undefined;
  outputTokens?: number | undefined;
  cacheReadTokens?: number | undefined;
  cacheWriteTokens?: number | undefined;
  costUsd?: number | undefined;
}): AgentEvent {
  return {
    type: "usage.updated",
    ...(values.inputTokens === undefined ? {} : { inputTokens: values.inputTokens }),
    ...(values.outputTokens === undefined ? {} : { outputTokens: values.outputTokens }),
    ...(values.cacheReadTokens === undefined ? {} : { cacheReadTokens: values.cacheReadTokens }),
    ...(values.cacheWriteTokens === undefined ? {} : { cacheWriteTokens: values.cacheWriteTokens }),
    ...(values.costUsd === undefined ? {} : { costUsd: values.costUsd }),
    timestamp: new Date().toISOString(),
  };
}

export function textDelta(text: string): AgentEvent {
  return { type: "message.delta", text, timestamp: new Date().toISOString() };
}

export function completed(): AgentEvent {
  return { type: "run.completed", timestamp: new Date().toISOString() };
}
