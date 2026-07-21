import type { CommandSpec, ExecutionRequest } from "../core/execution-types.js";
import type { RuntimeDefinition } from "../core/types.js";
import { BaseRuntimeAdapter } from "./base-adapter.js";

export class CodexAdapter extends BaseRuntimeAdapter {
  constructor(definition: RuntimeDefinition) {
    super(definition);
  }

  buildCommand(request: ExecutionRequest): CommandSpec {
    const args = [
      "exec",
      "--json",
      "--sandbox",
      "read-only",
      "--ephemeral",
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
    };
  }
}
