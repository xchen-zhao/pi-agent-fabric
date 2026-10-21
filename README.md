# Pi Agent Fabric

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

> Build the open, local-first, vendor-neutral orchestration fabric that developers trust to coordinate any AI agent—safely, transparently, and reliably.

[简体中文](README.zh-CN.md)

Pi Agent Fabric is a small, local-first control layer for the coding agents you already have installed. It is **not another agent**. It gives Pi, Claude Code, Codex CLI, Grok Build and Kimi Code one safe, read-only execution interface, normalizes their output into a single event stream, records usage locally, and can route a task to a runtime that is not currently rate-limited.

It runs as a `fabric` CLI and as a [Pi](https://www.npmjs.com/package/@earendil-works/pi-coding-agent) extension.

## Status

Early and experimental (v0.x). APIs, CLI flags and the ledger schema may change.

| Area | State |
|---|---|
| Runtime discovery (`doctor`, `agents`) for Pi, Claude Code, Codex CLI, Grok Build, Kimi Code | ✅ Working |
| Unified **read-only** execution (`run --runtime <id>`), JSONL event normalization, timeouts, cancellation, output truncation, redacted logs | ✅ Pi, Claude, Codex, Grok |
| Kimi Code execution | ⛔ Refused on purpose until an ACP permission layer + OS sandbox exist (see [`docs/kimi-acp-assessment.md`](docs/kimi-acp-assessment.md)) |
| Local Usage Ledger (SQLite, metadata only — never prompts, output or paths) | ✅ Working |
| Quota state derived from local signals (`quota`) | ✅ Minimal: available / limited / unknown with cooldowns |
| Quota-aware routing (`run --runtime auto`) | ✅ Minimal: picks by derived state + your priority order |
| Real remaining-quota numbers from providers | ❌ Not implemented — states are inferred from your own past runs |
| Automatic failover / retry on another runtime mid-task | ❌ Not implemented |
| Write tasks, git worktree / sandbox isolation | ❌ Not implemented (read-only only) |
| Task persistence, concurrency leases, cross-model review | ❌ Not implemented |

## Requirements

- Node.js **24+** (uses the built-in `node:sqlite`)
- macOS or Linux. Windows is untested.
- At least one supported agent CLI installed and logged in (`pi`, `claude`, `codex`, `grok`, `kimi`). Fabric never reads their credential files; it only checks whether they exist.

## Quick start

```bash
git clone https://github.com/xchen-zhao/pi-agent-fabric.git
cd pi-agent-fabric
npm ci
npm run check && npm test
npm run doctor      # what is installed on this machine
```

After `npm run build`:

```bash
node dist/src/cli/index.js agents
node dist/src/cli/index.js quota
node dist/src/cli/index.js usage --recent 10

# Preview only — no agent is started, no quota is used
node dist/src/cli/index.js run --runtime codex \
  --prompt "Summarize this repo" --cwd . --read-only --dry-run

# Actually run — consumes the selected runtime's quota
printf 'Summarize this repo' | node dist/src/cli/index.js run \
  --runtime codex --prompt - --cwd . --read-only --execute
```

## Quota-aware routing

`fabric quota` derives a per-runtime state **only from local facts**: whether the CLI is installed and what your recent runs recorded in the Usage Ledger.

| State | Meaning |
|---|---|
| `available` | The newest run on this runtime succeeded (inferred, not a provider guarantee). |
| `limited` | The newest run reported a rate limit, exhausted quota, cooldown, or auth failure, and its cooldown has not expired. |
| `unknown` | Not installed, no recent runs, cooldown expired without a newer success, or an unrelated failure. |

Cooldown length, in order of preference: a reset time reported by the runtime → a `retry-after` value in its output → a default window (15 min for rate limits, 60 min for exhausted quota / auth). Override with `--cooldown-minutes` and `--quota-cooldown-minutes`.

`run --runtime auto` picks the first runtime in your priority order that is installed and `available`, then falls back to the first that is `unknown`. `limited`, missing, and policy-excluded runtimes are skipped, and the reason for every candidate is printed (or emitted as a `route.selected` JSON event with `--json`). Kimi is never auto-selected.

```bash
# Priority via flag or env (default: pi,claude,codex,grok)
node dist/src/cli/index.js run --runtime auto --priority codex,claude,pi \
  --prompt "Review the last commit" --read-only --dry-run
export PI_AGENT_FABRIC_PRIORITY=claude,codex
```

Routing happens once, before execution. If the chosen runtime fails mid-run, Fabric records the signal so the **next** `auto` run avoids it; it does not retry automatically yet.

## As a Pi extension

```bash
pi -e ./src/extension/index.ts
```

Inside Pi:

```text
/fabric-agents
/fabric-quota
/fabric-usage
/fabric-dry-run codex Analyze this project
/fabric-run codex Analyze this project
```

## Safety principles

- Never reads or prints the contents of auth files.
- Never scrapes web dashboards to guess subscription quota.
- Anything that cannot be known exactly is labelled `unknown` or `inferred`.
- Agent runs have timeouts, cancellation, output truncation, redacted logs and a read-only gate.
- The CLI requires an explicit `--execute`; the Pi extension asks for confirmation before running.
- Kimi's direct-prompt mode cannot enforce read-only, so it is refused.
- Prompts for executable runtimes go through stdin (Pi, Claude, Codex) or a private `0600` temp file (Grok), never process arguments. Stale prompt temp dirs left by a killed process are cleaned up before the next `--execute` run.

## Configuration

| Env var | Purpose |
|---|---|
| `PI_AGENT_FABRIC_LEDGER_PATH` | Ledger location (default `~/.local/share/pi-agent-fabric/fabric.db`) |
| `PI_AGENT_FABRIC_PRIORITY` | Default priority for `--runtime auto` |

Run logs go to `~/.local/share/pi-agent-fabric/runs/` with `0600` permissions.

## Docs

- [Vision and principles](docs/vision-and-principles.md)
- [Architecture & roadmap](docs/architecture.md)
- [Runtime execution](docs/runtime-execution.md)
- [Usage ledger](docs/usage-ledger.md)
- [Kimi safety assessment](docs/kimi-acp-assessment.md)

(Design docs are currently in Chinese.)

## Roadmap

- **Next:** automatic failover to the next eligible runtime when a run hits a rate limit; provider-reported quota where an official API/CLI exposes it.
- Later: concurrency leases, task persistence and resume, git worktree isolation for write tasks, cross-model review.

Contributions and issues are welcome.

## License

[MIT](LICENSE)
