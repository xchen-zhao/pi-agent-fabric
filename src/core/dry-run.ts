import { getRuntimeAdapter } from "../adapters/registry.js";
import type { DryRunPlan, ExecutionRequest } from "./execution-types.js";
import { findExecutable } from "./process.js";

export async function createDryRunPlan(request: ExecutionRequest): Promise<DryRunPlan> {
  const adapter = getRuntimeAdapter(request.runtime);
  const command = adapter.buildCommand(request);
  const executable = await findExecutable(command.command);
  if (!executable) throw new Error(`Runtime executable not found: ${command.command}`);

  return {
    runtime: request.runtime,
    executable,
    args: command.displayArgs,
    cwd: command.cwd,
    mode: request.mode,
    outputFormat: command.outputFormat,
    timeoutMs: command.timeoutMs,
    promptDelivery: command.stdin === undefined ? "argument" : "stdin",
    readOnlyEnforcement: command.readOnlyEnforcement,
    ...(command.safetyNote ? { safetyNote: command.safetyNote } : {}),
  };
}

export function formatDryRunPlan(plan: DryRunPlan): string {
  return [
    `Runtime: ${plan.runtime}`,
    `Mode: ${plan.mode}`,
    `CWD: ${plan.cwd}`,
    `Executable: ${plan.executable}`,
    `Arguments: ${plan.args.join(" ")}`,
    `Prompt delivery: ${plan.promptDelivery}`,
    `Output: ${plan.outputFormat}`,
    `Timeout: ${Math.round(plan.timeoutMs / 1_000)}s`,
    `Read-only enforcement: ${plan.readOnlyEnforcement}`,
    ...(plan.safetyNote ? [`Safety note: ${plan.safetyNote}`] : []),
    "Dry run: no Agent process was started and no model quota was consumed.",
  ].join("\n");
}
