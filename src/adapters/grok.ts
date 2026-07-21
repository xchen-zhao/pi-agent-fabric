import type { AgentEvent, CommandSpec, ExecutionRequest } from "../core/execution-types.js";
import type { RuntimeDefinition } from "../core/types.js";
import { BaseRuntimeAdapter } from "./base-adapter.js";
import { completed, numberValue, record, stringValue, textDelta, usageEvent } from "./event-utils.js";

export class GrokAdapter extends BaseRuntimeAdapter {
  constructor(definition: RuntimeDefinition) {
    super(definition);
  }

  protected parseJsonEvent(event: Record<string, unknown>): AgentEvent[] {
    const type = stringValue(event.type);
    if (type === "text") {
      const text = stringValue(event.data);
      return text === undefined ? [] : [textDelta(text)];
    }
    if (type === "end") {
      const usage = record(event.usage);
      return [
        usageEvent({
          inputTokens: numberValue(usage?.input_tokens),
          outputTokens: numberValue(usage?.output_tokens),
          cacheReadTokens: numberValue(usage?.cache_read_input_tokens),
          costUsd: numberValue(event.total_cost_usd),
        }),
        completed(),
      ];
    }
    return [];
  }

  buildCommand(request: ExecutionRequest): CommandSpec {
    const promptFileToken = "__PI_AGENT_FABRIC_PROMPT_FILE__";
    const args = [
      "--cwd",
      request.cwd,
      "--output-format",
      "streaming-json",
      "--permission-mode",
      "plan",
      "--no-subagents",
      "--no-memory",
      "--disable-web-search",
      "--prompt-file",
      promptFileToken,
    ];
    const displayArgs = args.map((arg) => arg === promptFileToken ? "<prompt-file>" : arg);
    return {
      command: this.definition.command,
      args,
      displayArgs,
      temporaryFiles: [{ token: promptFileToken, content: request.prompt, fileName: "prompt.md" }],
      cwd: request.cwd,
      outputFormat: "jsonl",
      timeoutMs: request.timeoutMs,
      readOnlyEnforcement: "native",
    };
  }
}
