import type { AgentEvent, CommandSpec, ExecutionRequest } from "../core/execution-types.js";
import type { RuntimeDefinition } from "../core/types.js";
import { BaseRuntimeAdapter } from "./base-adapter.js";
import { completed, numberValue, record, stringValue, textDelta, usageEvent } from "./event-utils.js";

export class CodexAdapter extends BaseRuntimeAdapter {
  constructor(definition: RuntimeDefinition) {
    super(definition);
  }

  protected parseJsonEvent(event: Record<string, unknown>): AgentEvent[] {
    const type = stringValue(event.type);
    if (type === "item.completed") {
      const item = record(event.item);
      const text = item?.type === "agent_message" ? stringValue(item.text) : undefined;
      return text === undefined ? [] : [textDelta(text)];
    }
    if (type === "turn.completed") {
      const usage = record(event.usage);
      return [
        usageEvent({
          inputTokens: numberValue(usage?.input_tokens),
          outputTokens: numberValue(usage?.output_tokens),
          cacheReadTokens: numberValue(usage?.cached_input_tokens),
          cacheWriteTokens: numberValue(usage?.cache_write_input_tokens),
        }),
        completed(),
      ];
    }
    return [];
  }

  buildCommand(request: ExecutionRequest): CommandSpec {
    const args = [
      "exec",
      "--json",
      "--sandbox",
      "read-only",
      "--ephemeral",
      "--ignore-user-config",
      "--ignore-rules",
      "-C",
      request.cwd,
      "-",
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
