import type { AgentEvent, CommandSpec, ExecutionRequest } from "../core/execution-types.js";
import type { RuntimeDefinition } from "../core/types.js";
import { BaseRuntimeAdapter } from "./base-adapter.js";
import { completed, numberValue, record, stringValue, textDelta, usageEvent } from "./event-utils.js";

export class PiAdapter extends BaseRuntimeAdapter {
  constructor(definition: RuntimeDefinition) {
    super(definition);
  }

  protected parseJsonEvent(event: Record<string, unknown>): AgentEvent[] {
    const type = stringValue(event.type);
    if (type === "message_update") {
      const assistantEvent = record(event.assistantMessageEvent);
      const delta = assistantEvent?.type === "text_delta" ? stringValue(assistantEvent.delta) : undefined;
      return delta === undefined ? [] : [textDelta(delta)];
    }
    if (type === "tool_execution_start") {
      const name = stringValue(event.toolName);
      return name === undefined ? [] : [{ type: "tool.started", name, timestamp: new Date().toISOString() }];
    }
    if (type === "tool_execution_end") {
      const name = stringValue(event.toolName);
      return name === undefined ? [] : [{
        type: "tool.finished",
        name,
        isError: event.isError === true,
        timestamp: new Date().toISOString(),
      }];
    }
    if (type === "message_end") {
      const message = record(event.message);
      if (message?.role !== "assistant") return [];
      const usage = record(message.usage);
      const cost = record(usage?.cost);
      return [usageEvent({
        inputTokens: numberValue(usage?.input),
        outputTokens: numberValue(usage?.output),
        cacheReadTokens: numberValue(usage?.cacheRead),
        cacheWriteTokens: numberValue(usage?.cacheWrite),
        costUsd: numberValue(cost?.total),
      })];
    }
    if (type === "agent_settled") return [completed()];
    return [];
  }

  buildCommand(request: ExecutionRequest): CommandSpec {
    const args = [
      "--print",
      "--mode",
      "json",
      "--no-session",
      "--no-approve",
      "--no-extensions",
      "--no-skills",
      "--no-prompt-templates",
      "--tools",
      "read,grep,find,ls",
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
