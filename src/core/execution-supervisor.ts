import { spawn, type ChildProcess } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { CommandSpec, ProcessResult } from "./execution-types.js";
import { BoundedOutputBuffer } from "./output-buffer.js";
import { redactSecrets } from "./redaction.js";

const DEFAULT_MAX_BYTES = 50 * 1024;
const DEFAULT_MAX_LINES = 2_000;

export interface SupervisorOptions {
  signal?: AbortSignal;
  logDir?: string;
  maxBytes?: number;
  maxLines?: number;
  onStdoutLine?: (line: string) => void;
  onStderrLine?: (line: string) => void;
}

function terminateProcess(child: ChildProcess, signal: NodeJS.Signals): void {
  if (child.pid === undefined) return;
  try {
    if (process.platform !== "win32") process.kill(-child.pid, signal);
    else child.kill(signal);
  } catch {
    child.kill(signal);
  }
}

function createLineConsumer(callback: ((line: string) => void) | undefined) {
  let pending = "";
  return {
    push(chunk: string): void {
      pending += chunk;
      while (true) {
        const index = pending.indexOf("\n");
        if (index < 0) return;
        const line = pending.slice(0, index).replace(/\r$/, "");
        pending = pending.slice(index + 1);
        callback?.(line);
      }
    },
    flush(): void {
      if (pending.length > 0) callback?.(pending.replace(/\r$/, ""));
      pending = "";
    },
  };
}

export async function superviseExecution(
  spec: CommandSpec,
  options: SupervisorOptions = {},
): Promise<ProcessResult> {
  const startedAt = Date.now();
  const logDir = options.logDir ?? path.join(os.homedir(), ".local", "share", "pi-agent-fabric", "runs");
  await mkdir(logDir, { recursive: true, mode: 0o700 });
  const fullOutputPath = path.join(logDir, `${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID()}.log`);
  const log = createWriteStream(fullOutputPath, { flags: "wx", mode: 0o600 });
  const stdout = new BoundedOutputBuffer({
    maxBytes: options.maxBytes ?? DEFAULT_MAX_BYTES,
    maxLines: options.maxLines ?? DEFAULT_MAX_LINES,
  });
  const stderr = new BoundedOutputBuffer({
    maxBytes: options.maxBytes ?? DEFAULT_MAX_BYTES,
    maxLines: options.maxLines ?? DEFAULT_MAX_LINES,
  });
  const stdoutLines = createLineConsumer(options.onStdoutLine);
  const stderrLines = createLineConsumer(options.onStderrLine);

  return new Promise((resolve) => {
    let child: ChildProcess;
    let timedOut = false;
    let aborted = false;
    let settled = false;
    let spawnError: string | undefined;
    let timer: NodeJS.Timeout | undefined;
    let forceKillTimer: NodeJS.Timeout | undefined;

    const requestTermination = (): void => {
      terminateProcess(child, "SIGTERM");
      forceKillTimer ??= setTimeout(() => terminateProcess(child, "SIGKILL"), 5_000);
    };

    const finish = (exitCode: number | null, signal: NodeJS.Signals | null): void => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (forceKillTimer) clearTimeout(forceKillTimer);
      options.signal?.removeEventListener("abort", abortHandler);
      stdoutLines.flush();
      stderrLines.flush();
      log.end(() => {
        resolve({
          stdout: stdout.content,
          stderr: stderr.content,
          exitCode,
          signal,
          timedOut,
          aborted,
          truncated: stdout.truncated || stderr.truncated,
          fullOutputPath,
          ...(spawnError ? { spawnError } : {}),
          durationMs: Date.now() - startedAt,
        });
      });
    };

    const abortHandler = (): void => {
      aborted = true;
      requestTermination();
    };

    try {
      child = spawn(spec.command, spec.args, {
        cwd: spec.cwd,
        shell: false,
        detached: process.platform !== "win32",
        stdio: ["pipe", "pipe", "pipe"],
        env: process.env,
      });
    } catch (error) {
      spawnError = redactSecrets(error instanceof Error ? error.message : String(error));
      log.write(`[spawn-error] ${spawnError}\n`);
      finish(null, null);
      return;
    }

    timer = setTimeout(() => {
      timedOut = true;
      requestTermination();
    }, spec.timeoutMs);

    if (options.signal?.aborted) abortHandler();
    else options.signal?.addEventListener("abort", abortHandler, { once: true });

    child.stdout?.on("data", (data: Buffer) => {
      const text = redactSecrets(data.toString("utf8"));
      stdout.append(text);
      stdoutLines.push(text);
      log.write(`[stdout] ${text}`);
    });
    child.stderr?.on("data", (data: Buffer) => {
      const text = redactSecrets(data.toString("utf8"));
      stderr.append(text);
      stderrLines.push(text);
      log.write(`[stderr] ${text}`);
    });
    child.on("error", (error) => {
      const text = redactSecrets(error.message);
      spawnError = text;
      stderr.append(text);
      log.write(`[process-error] ${text}\n`);
    });
    child.on("close", finish);

    if (spec.stdin !== undefined) child.stdin?.end(spec.stdin);
    else child.stdin?.end();
  });
}
