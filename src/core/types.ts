export const RUNTIME_IDS = ["pi", "claude", "codex", "grok", "kimi"] as const;

export type RuntimeId = (typeof RUNTIME_IDS)[number];

export type QuotaStatus =
  | "available"
  | "constrained"
  | "cooldown"
  | "exhausted"
  | "unauthorized"
  | "unknown";

export type Confidence = "exact" | "reported" | "inferred" | "unknown";

export interface RuntimeCapabilities {
  headless: boolean;
  structuredOutput: boolean;
  streamingOutput: boolean;
  resume: boolean;
  worktree: boolean;
  nativeQuotaQuery: boolean;
}

export interface RuntimeDefinition {
  id: RuntimeId;
  displayName: string;
  command: string;
  versionArgs: string[];
  capabilities: RuntimeCapabilities;
  authMarkers: string[];
  notes: string[];
}

export interface RuntimeDiscovery {
  id: RuntimeId;
  displayName: string;
  command: string;
  executable?: string;
  installed: boolean;
  version?: string;
  auth: "configured" | "not-detected" | "unknown";
  quotaStatus: QuotaStatus;
  quotaConfidence: Confidence;
  capabilities: RuntimeCapabilities;
  notes: string[];
  error?: string;
}
