import type { AgentEvent, CommandSpec, ExecutionRequest } from "../core/execution-types.js";
import type { RuntimeDefinition } from "../core/types.js";
import { BaseRuntimeAdapter } from "./base-adapter.js";
import { completed, numberValue, record, stringValue, textDelta, usageEvent } from "./event-utils.js";

export class ClaudeAdapter extends BaseRuntimeAdapter {
  constructor(definition: RuntimeDefinition) {
    super(definition);
  }

  protected parseJsonEvent(event: Record<string, unknown>): AgentEvent[] {
    const type = stringValue(event.type);
    if (type === "assistant") {
      const message = record(event.message);
      const content = Array.isArray(message?.content) ? message.content : [];
      return content.flatMap((part) => {
        const block = record(part);
        const text = block?.type === "text" ? stringValue(block.text) : undefined;
        return text === undefined ? [] : [textDelta(text)];
      });
    }
    if (type === "rate_limit_event") {
      const info = record(event.rate_limit_info);
      const status = info?.status === "allowed" ? "available" : "constrained";
      const resetSeconds = numberValue(info?.resetsAt);
      return [{
        type: "quota.updated",
        status,
        confidence: "reported",
        ...(resetSeconds === undefined ? {} : { resetAt: new Date(resetSeconds * 1_000).toISOString() }),
        timestamp: new Date().toISOString(),
      }];
    }
    if (type === "result") {
      if (event.subtype !== "success") return [];
      const usage = record(event.usage);
      return [
        usageEvent({
          inputTokens: numberValue(usage?.input_tokens),
          outputTokens: numberValue(usage?.output_tokens),
          cacheReadTokens: numberValue(usage?.cache_read_input_tokens),
          cacheWriteTokens: numberValue(usage?.cache_creation_input_tokens),
          costUsd: numberValue(event.total_cost_usd),
        }),
        completed(),
      ];
    }
    return [];
  }

  buildCommand(request: ExecutionRequest): CommandSpec {
    const args = [
      "--print",
      "--input-format",
      "text",
      "--output-format",
      "stream-json",
      "--verbose",
      "--safe-mode",
      "--permission-mode",
      "plan",
      "--allowedTools",
      "Read,Grep,Glob",
      "--no-session-persistence",
    ];
    return {
      command: this.definition.command,
      args,
      displayArgs: args,
      cwd: request.cwd,
      stdin: request.prompt,
      outputFormat: "jsonl",
      timeoutMs: request.timeoutMs,
      readOnlyEnforcement: "native",
    };
  }
}
