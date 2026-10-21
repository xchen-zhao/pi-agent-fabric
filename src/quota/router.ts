import { RUNTIME_IDS, type RuntimeDiscovery, type RuntimeId } from "../core/types.js";
import type { QuotaSnapshot } from "./types.js";

/** Runtimes that existing safety policy refuses to execute automatically. */
export const AUTO_ROUTING_EXCLUDED: readonly RuntimeId[] = ["kimi"];

export const DEFAULT_PRIORITY: readonly RuntimeId[] = RUNTIME_IDS.filter((id) => !AUTO_ROUTING_EXCLUDED.includes(id));

export function parsePriority(value: string | undefined): RuntimeId[] {
  if (value === undefined || value.trim() === "") return [...DEFAULT_PRIORITY];
  const ids = value.split(",").map((item) => item.trim()).filter(Boolean);
  const seen = new Set<RuntimeId>();
  for (const id of ids) {
    if (!RUNTIME_IDS.includes(id as RuntimeId)) {
      throw new Error(`Invalid runtime in priority: ${id}. Expected one of: ${RUNTIME_IDS.join(", ")}`);
    }
    seen.add(id as RuntimeId);
  }
  return [...seen];
}

export interface RouteCandidate {
  runtime: RuntimeId;
  eligible: boolean;
  state: QuotaSnapshot["state"];
  reason: string;
}

export interface RouteDecision {
  selected?: RuntimeId;
  reason: string;
  candidates: RouteCandidate[];
}

/**
 * Pick a runtime for `--runtime auto`.
 * Order: installed + `available` in priority order, then installed + `unknown`
 * in priority order. `limited`, not installed, and policy-excluded runtimes are skipped.
 */
export function selectRuntime(
  runtimes: RuntimeDiscovery[],
  snapshots: QuotaSnapshot[],
  priority: readonly RuntimeId[] = DEFAULT_PRIORITY,
): RouteDecision {
  const byId = new Map(runtimes.map((runtime) => [runtime.id, runtime]));
  const snapshotById = new Map(snapshots.map((snapshot) => [snapshot.runtime, snapshot]));
  const candidates: RouteCandidate[] = priority.map((id) => {
    const runtime = byId.get(id);
    const snapshot = snapshotById.get(id);
    const state = snapshot?.state ?? "unknown";
    if (AUTO_ROUTING_EXCLUDED.includes(id)) {
      return { runtime: id, eligible: false, state, reason: "excluded by safety policy (no enforceable read-only mode)" };
    }
    if (!runtime?.installed) return { runtime: id, eligible: false, state, reason: "not installed" };
    if (state === "limited") {
      return { runtime: id, eligible: false, state, reason: `limited until ${snapshot?.cooldownUntil ?? "unknown"}` };
    }
    return { runtime: id, eligible: true, state, reason: state === "available" ? "recent successful run" : "no recent quota signal" };
  });

  const pick = candidates.find((c) => c.eligible && c.state === "available")
    ?? candidates.find((c) => c.eligible);
  if (!pick) {
    return {
      reason: `No eligible runtime: ${candidates.map((c) => `${c.runtime}=${c.reason}`).join("; ") || "empty priority"}`,
      candidates,
    };
  }
  return { selected: pick.runtime, reason: `${pick.runtime}: ${pick.state} (${pick.reason})`, candidates };
}
