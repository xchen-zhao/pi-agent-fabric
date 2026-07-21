import type { CommandSpec, ExecutionRequest } from "../core/execution-types.js";
import type { RuntimeDefinition } from "../core/types.js";
import { BaseRuntimeAdapter } from "./base-adapter.js";
import { promptPlaceholder } from "./runtime-adapter.js";

export class GrokAdapter extends BaseRuntimeAdapter {
  constructor(definition: RuntimeDefinition) {
    super(definition);
  }

  buildCommand(request: ExecutionRequest): CommandSpec {
    const args = [
      "--cwd",
      request.cwd,
      "--output-format",
      "streaming-json",
      "--permission-mode",
      "plan",
      "--no-subagents",
      "--single",
      request.prompt,
    ];
    const displayArgs = [...args];
    displayArgs[displayArgs.length - 1] = promptPlaceholder(request.prompt);
    return {
      command: this.definition.command,
      args,
      displayArgs,
      cwd: request.cwd,
      outputFormat: "jsonl",
      timeoutMs: request.timeoutMs,
    };
  }
}
