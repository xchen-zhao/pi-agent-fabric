import type { RuntimeDiscovery } from "./types.js";

function yesNo(value: boolean): string {
  return value ? "yes" : "no";
}

function pad(value: string, width: number): string {
  return value.padEnd(width, " ");
}

export function formatRuntimeTable(runtimes: RuntimeDiscovery[]): string {
  const rows = runtimes.map((runtime) => [
    runtime.displayName,
    yesNo(runtime.installed),
    runtime.version ?? "-",
    runtime.auth,
    yesNo(runtime.capabilities.headless),
    runtime.capabilities.structuredOutput ? "yes" : "partial",
    runtime.quotaStatus,
  ]);
  const headers = ["Runtime", "Installed", "Version", "Auth", "Headless", "JSON", "Quota"];
  const widths = headers.map((header, index) =>
    Math.max(header.length, ...rows.map((row) => row[index]?.length ?? 0)),
  );
  const render = (row: string[]) => row.map((cell, index) => pad(cell, widths[index] ?? cell.length)).join("  ").trimEnd();
  return [render(headers), render(widths.map((width) => "-".repeat(width))), ...rows.map(render)].join("\n");
}

export function formatDetailedReport(runtimes: RuntimeDiscovery[]): string {
  const table = formatRuntimeTable(runtimes);
  const details = runtimes
    .map((runtime) => {
      const lines = [
        `## ${runtime.displayName}`,
        `- command: ${runtime.executable ?? runtime.command}`,
        `- streaming: ${yesNo(runtime.capabilities.streamingOutput)}`,
        `- resume: ${yesNo(runtime.capabilities.resume)}`,
        `- native worktree: ${yesNo(runtime.capabilities.worktree)}`,
        `- native quota query: ${yesNo(runtime.capabilities.nativeQuotaQuery)}`,
      ];
      for (const note of runtime.notes) lines.push(`- note: ${note}`);
      if (runtime.error) lines.push(`- error: ${runtime.error}`);
      return lines.join("\n");
    })
    .join("\n\n");
  return `${table}\n\n${details}`;
}
