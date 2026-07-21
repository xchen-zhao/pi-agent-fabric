import { spawn, type ChildProcess } from "node:child_process";
import type { WriteStream } from "node:fs";
import { mkdir, mkdtemp, open, rm, writeFile } from "node:fs/promises";
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

async function materializeTemporaryFiles(spec: CommandSpec): Promise<{ args: string[]; cleanup: () => Promise<void> }> {
  if (!spec.temporaryFiles?.length) return { args: spec.args, cleanup: async () => undefined };

  const tempDir = await mkdtemp(path.join(os.tmpdir(), "pi-agent-fabric-"));
  try {
    await Promise.all(spec.temporaryFiles.map(async (file) => {
      if (!/^[-_.A-Za-z0-9]+$/.test(file.fileName)) throw new Error(`Unsafe temporary file name: ${file.fileName}`);
      const filePath = path.join(tempDir, file.fileName);
      await writeFile(filePath, file.content, { encoding: "utf8", mode: 0o600, flag: "wx" });
    }));
    const replacements = new Map(spec.temporaryFiles.map((file) => [file.token, path.join(tempDir, file.fileName)]));
    return {
      args: spec.args.map((arg) => replacements.get(arg) ?? arg),
      cleanup: () => rm(tempDir, { recursive: true, force: true }),
    };
  } catch (error) {
    await rm(tempDir, { recursive: true, force: true });
    throw error;
  }
}

export async function superviseExecution(
  spec: CommandSpec,
  options: SupervisorOptions = {},
): Promise<ProcessResult> {
  const startedAt = Date.now();
  const materialized = await materializeTemporaryFiles(spec);
  const logDir = options.logDir ?? path.join(os.homedir(), ".local", "share", "pi-agent-fabric", "runs");
  const fullOutputPath = path.join(logDir, `${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID()}.log`);
  let log: WriteStream;
  try {
    await mkdir(logDir, { recursive: true, mode: 0o700 });
    const logHandle = await open(fullOutputPath, "wx", 0o600);
    log = logHandle.createWriteStream();
  } catch (error) {
    await materialized.cleanup();
    throw error;
  }
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
    let logError: string | undefined;
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
      const resolveAfterCleanup = (): void => {
        void materialized.cleanup().finally(() => {
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
            ...(logError ? { logError } : {}),
            durationMs: Date.now() - startedAt,
          });
        });
      };
      if (log.destroyed) resolveAfterCleanup();
      else log.end(resolveAfterCleanup);
    };

    const abortHandler = (): void => {
      aborted = true;
      requestTermination();
    };

    log.on("error", (error) => {
      logError = redactSecrets(`Audit log failed: ${error.message}`);
    });

    try {
      child = spawn(spec.command, materialized.args, {
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
