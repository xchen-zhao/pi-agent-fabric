import type { CommandSpec, ExecutionRequest } from "../core/execution-types.js";
import type { RuntimeDefinition } from "../core/types.js";
import { BaseRuntimeAdapter } from "./base-adapter.js";

export class ClaudeAdapter extends BaseRuntimeAdapter {
  constructor(definition: RuntimeDefinition) {
    super(definition);
  }

  buildCommand(request: ExecutionRequest): CommandSpec {
    const args = [
      "--print",
      "--input-format",
      "text",
      "--output-format",
      "stream-json",
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
    };
  }
}
