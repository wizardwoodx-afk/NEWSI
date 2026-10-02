/**
 * COMPUTER-USE NODE ADAPTER — the node-side defaults for the runtime-agnostic
 * computer-use plane (19.5.1). Node runtimes (probes, the stdio MCP server,
 * the desktop host) inject these; browser runtimes never import this file.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { detectBrowserBinary } from "./computerUse";

export const nodeRun = (bin: string, args: string[], timeoutMs: number) => {
  const r = spawnSync(bin, args, { timeout: timeoutMs, encoding: "utf-8", shell: false });
  return {
    status: r.status,
    timedOut: Boolean(r.error && "code" in r.error && r.error.code === "ETIMEDOUT") || (r.signal === "SIGTERM" && r.status === null),
    stdout: r.stdout ?? "",
    stderr: r.stderr ?? "",
  };
};

export const nodeExists = (p: string) => existsSync(p);

export const nodeSpawn = (bin: string, args: string[]) => {
  const r = spawnSync(bin, args, { timeout: 30_000, encoding: "utf-8" });
  return { status: r.status, stderr: r.stderr ?? "" };
};

export const detectBrowserBinaryNode = () => detectBrowserBinary(undefined, nodeExists);
