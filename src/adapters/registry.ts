import { RUNTIME_DEFINITIONS } from "./definitions.js";
import type { AgentRuntimeAdapter } from "./runtime-adapter.js";
import type { RuntimeId } from "../core/types.js";
import { ClaudeAdapter } from "./claude.js";
import { CodexAdapter } from "./codex.js";
import { GrokAdapter } from "./grok.js";
import { KimiAdapter } from "./kimi.js";
import { PiAdapter } from "./pi.js";

const definitions = new Map(RUNTIME_DEFINITIONS.map((definition) => [definition.id, definition]));

function requireDefinition(id: RuntimeId) {
  const definition = definitions.get(id);
  if (!definition) throw new Error(`Missing runtime definition: ${id}`);
  return definition;
}

const adapters = new Map<RuntimeId, AgentRuntimeAdapter>([
  ["pi", new PiAdapter(requireDefinition("pi"))],
  ["claude", new ClaudeAdapter(requireDefinition("claude"))],
  ["codex", new CodexAdapter(requireDefinition("codex"))],
  ["grok", new GrokAdapter(requireDefinition("grok"))],
  ["kimi", new KimiAdapter(requireDefinition("kimi"))],
]);

export function getRuntimeAdapter(id: RuntimeId): AgentRuntimeAdapter {
  const adapter = adapters.get(id);
  if (!adapter) throw new Error(`Unsupported runtime: ${id}`);
  return adapter;
}

export function listRuntimeAdapters(): AgentRuntimeAdapter[] {
  return [...adapters.values()];
}
