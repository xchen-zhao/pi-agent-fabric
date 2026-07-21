import type { AgentEvent, ProcessResult, RuntimeError } from "../core/execution-types.js";
import type { RuntimeDefinition, RuntimeId } from "../core/types.js";
import type { AgentRuntimeAdapter } from "./runtime-adapter.js";
import { classifyCommonError, parseJsonLine } from "./runtime-adapter.js";

export abstract class BaseRuntimeAdapter implements AgentRuntimeAdapter {
  readonly id: RuntimeId;

  constructor(readonly definition: RuntimeDefinition) {
    this.id = definition.id;
  }

  abstract buildCommand(request: import("../core/execution-types.js").ExecutionRequest): import("../core/execution-types.js").CommandSpec;

  parseLine(line: string): AgentEvent[] {
    const event = parseJsonLine(line);
    if (!event) return [];
    return this.parseJsonEvent(event);
  }

  protected parseJsonEvent(_event: Record<string, unknown>): AgentEvent[] {
    return [];
  }

  classifyError(result: ProcessResult): RuntimeError | undefined {
    return classifyCommonError(result);
  }
}
