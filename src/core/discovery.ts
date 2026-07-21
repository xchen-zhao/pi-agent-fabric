import { access } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { RUNTIME_DEFINITIONS } from "../adapters/definitions.js";
import type { RuntimeDefinition, RuntimeDiscovery } from "./types.js";
import { findExecutable, runCommand } from "./process.js";

function expandHome(value: string): string {
  if (value === "~") return os.homedir();
  if (value.startsWith("~/")) return path.join(os.homedir(), value.slice(2));
  return value;
}

async function detectAuth(definition: RuntimeDefinition): Promise<RuntimeDiscovery["auth"]> {
  if (definition.authMarkers.length === 0) return "unknown";
  for (const marker of definition.authMarkers) {
    try {
      await access(expandHome(marker));
      return "configured";
    } catch {
      // 只检测文件是否存在，绝不读取认证文件内容。
    }
  }
  return "not-detected";
}

function firstNonEmptyLine(value: string): string | undefined {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
}

export async function discoverRuntime(definition: RuntimeDefinition): Promise<RuntimeDiscovery> {
  const executable = await findExecutable(definition.command);
  const auth = await detectAuth(definition);
  if (!executable) {
    return {
      id: definition.id,
      displayName: definition.displayName,
      command: definition.command,
      installed: false,
      auth,
      quotaStatus: "unknown",
      quotaConfidence: "unknown",
      capabilities: definition.capabilities,
      notes: definition.notes,
    };
  }

  const result = await runCommand(executable, definition.versionArgs);
  const version = firstNonEmptyLine(result.stdout) ?? firstNonEmptyLine(result.stderr);
  const error = result.timedOut
    ? "版本检测超时"
    : result.code !== 0
      ? `版本命令退出码 ${result.code ?? "unknown"}`
      : undefined;

  return {
    id: definition.id,
    displayName: definition.displayName,
    command: definition.command,
    executable,
    installed: true,
    ...(version ? { version } : {}),
    auth,
    quotaStatus: "unknown",
    quotaConfidence: "unknown",
    capabilities: definition.capabilities,
    notes: definition.notes,
    ...(error ? { error } : {}),
  };
}

export async function discoverRuntimes(): Promise<RuntimeDiscovery[]> {
  return Promise.all(RUNTIME_DEFINITIONS.map(discoverRuntime));
}
