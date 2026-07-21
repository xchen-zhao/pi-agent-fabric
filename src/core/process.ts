import { constants } from "node:fs";
import { access } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

export interface CommandResult {
  stdout: string;
  stderr: string;
  code: number | null;
  timedOut: boolean;
}

export async function findExecutable(command: string, pathValue = process.env.PATH ?? ""): Promise<string | undefined> {
  if (command.includes(path.sep)) {
    try {
      await access(command, constants.X_OK);
      return path.resolve(command);
    } catch {
      return undefined;
    }
  }

  for (const directory of pathValue.split(path.delimiter).filter(Boolean)) {
    const candidate = path.join(directory, command);
    try {
      await access(candidate, constants.X_OK);
      return candidate;
    } catch {
      // 继续查找 PATH 中的下一个目录。
    }
  }
  return undefined;
}

export async function runCommand(
  executable: string,
  args: string[],
  timeoutMs = 5_000,
): Promise<CommandResult> {
  return new Promise((resolve) => {
    const child = spawn(executable, args, {
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({ stdout, stderr: `${stderr}${error.message}`, code: null, timedOut });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, code, timedOut });
    });
  });
}
