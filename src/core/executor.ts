import type { AgentRuntimeAdapter } from "../adapters/runtime-adapter.js";
import { getRuntimeAdapter } from "../adapters/registry.js";
import type {
  AgentEvent,
  AgentResult,
  AgentUsage,
  ExecutionRequest,
  ProcessResult,
  RuntimeError,
} from "./execution-types.js";
import { superviseExecution, type SupervisorOptions } from "./execution-supervisor.js";
import { findExecutable } from "./process.js";

export interface ExecutorOptions extends SupervisorOptions {
  onEvent?: (event: AgentEvent) => void;
}

function now(): string {
  return new Date().toISOString();
}

function processSummary(result: ProcessResult): AgentResult["process"] {
  return {
    exitCode: result.exitCode,
    signal: result.signal,
    durationMs: result.durationMs,
    timedOut: result.timedOut,
    aborted: result.aborted,
    truncated: result.truncated,
    ...(result.fullOutputPath ? { fullOutputPath: result.fullOutputPath } : {}),
  };
}

function preflightFailure(request: ExecutionRequest, error: RuntimeError): AgentResult {
  return {
    runtime: request.runtime,
    status: "failed",
    text: "",
    usage: {},
    error,
    process: {
      exitCode: null,
      signal: null,
      durationMs: 0,
      timedOut: false,
      aborted: false,
      truncated: false,
    },
  };
}

export async function executeWithAdapter(
  adapter: AgentRuntimeAdapter,
  request: ExecutionRequest,
  options: ExecutorOptions = {},
): Promise<AgentResult> {
  const spec = adapter.buildCommand(request);
  if (spec.readOnlyEnforcement !== "native") {
    return preflightFailure(request, {
      category: "unsafe-execution",
      message: spec.safetyNote ?? `${adapter.definition.displayName} cannot enforce read-only execution`,
      retryable: false,
    });
  }

  const executable = await findExecutable(spec.command);
  if (!executable) {
    return preflightFailure(request, {
      category: "executable-not-found",
      message: `Runtime executable not found: ${spec.command}`,
      retryable: false,
    });
  }

  const events: AgentEvent[] = [];
  let parseError: string | undefined;
  const emit = (event: AgentEvent): void => {
    events.push(event);
    options.onEvent?.(event);
  };
  emit({ type: "run.started", runtime: request.runtime, timestamp: now() });

  const supervisorOptions: SupervisorOptions = {
    ...(options.signal ? { signal: options.signal } : {}),
    ...(options.logDir ? { logDir: options.logDir } : {}),
    ...(options.maxBytes === undefined ? {} : { maxBytes: options.maxBytes }),
    ...(options.maxLines === undefined ? {} : { maxLines: options.maxLines }),
    onStdoutLine: (line) => {
      try {
        for (const event of adapter.parseLine(line)) emit(event);
      } catch (error) {
        parseError ??= error instanceof Error ? error.message : String(error);
      }
      options.onStdoutLine?.(line);
    },
    ...(options.onStderrLine ? { onStderrLine: options.onStderrLine } : {}),
  };

  const processResult = await superviseExecution({ ...spec, command: executable }, supervisorOptions);
  let error = adapter.classifyError(processResult);
  const completed = events.some((event) => event.type === "run.completed");
  if (!error && parseError) {
    error = {
      category: "invalid-output",
      message: `${adapter.definition.displayName} emitted invalid output: ${parseError}`,
      retryable: false,
    };
  } else if (!error && !completed) {
    error = {
      category: "invalid-output",
      message: `${adapter.definition.displayName} exited successfully without a completion event`,
      retryable: false,
    };
  }

  if (error) {
    emit({ type: "run.failed", category: error.category, message: error.message, timestamp: now() });
  }

  const usageEvents = events.filter((event): event is Extract<AgentEvent, { type: "usage.updated" }> =>
    event.type === "usage.updated",
  );
  const lastUsage = usageEvents.at(-1);
  const usage: AgentUsage = lastUsage
    ? {
        ...(lastUsage.inputTokens === undefined ? {} : { inputTokens: lastUsage.inputTokens }),
        ...(lastUsage.outputTokens === undefined ? {} : { outputTokens: lastUsage.outputTokens }),
        ...(lastUsage.cacheReadTokens === undefined ? {} : { cacheReadTokens: lastUsage.cacheReadTokens }),
        ...(lastUsage.cacheWriteTokens === undefined ? {} : { cacheWriteTokens: lastUsage.cacheWriteTokens }),
        ...(lastUsage.costUsd === undefined ? {} : { costUsd: lastUsage.costUsd }),
      }
    : {};
  const quota = events
    .filter((event): event is Extract<AgentEvent, { type: "quota.updated" }> => event.type === "quota.updated")
    .at(-1);
  const text = events
    .filter((event): event is Extract<AgentEvent, { type: "message.delta" }> => event.type === "message.delta")
    .map((event) => event.text)
    .join("");

  return {
    runtime: request.runtime,
    status: error ? "failed" : "completed",
    text,
    usage,
    ...(quota ? { quota } : {}),
    ...(error ? { error } : {}),
    process: processSummary(processResult),
  };
}

export async function executeAgent(request: ExecutionRequest, options: ExecutorOptions = {}): Promise<AgentResult> {
  return executeWithAdapter(getRuntimeAdapter(request.runtime), request, options);
}
