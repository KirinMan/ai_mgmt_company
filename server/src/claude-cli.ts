import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import stripAnsi from "strip-ansi";
import type { ClaudeBackgroundAgent } from "./types.js";

const execFileAsync = promisify(execFile);

/**
 * `claude --bg` の出力に含まれる "backgrounded · <id> · <name>" 行から
 * 短いセッションIDを取り出す。CLI の表示フォーマットに依存するため
 * ここが変わった場合はこの正規表現だけ直せばよい。
 */
const BACKGROUNDED_LINE = /backgrounded[^\S\n]*[·-][^\S\n]*([a-z0-9]+)/i;

export interface StartAgentOptions {
  cwd: string;
  worktreeName: string;
  displayName: string;
  prompt: string;
  env: Record<string, string>;
}

export function startAgent(opts: StartAgentOptions): Promise<{ agentId: string }> {
  return new Promise((resolve, reject) => {
    // バックグラウンド実行では権限確認プロンプトに誰も応答できず永久に停止するため、
    // 確認なしで全ツールを実行できるようにする（git worktree で作業ブランチは分離される）。
    const args = [
      "--bg",
      "-w",
      opts.worktreeName,
      "-n",
      opts.displayName,
      "--dangerously-skip-permissions",
      opts.prompt,
    ];
    const child = spawn("claude", args, {
      cwd: opts.cwd,
      env: { ...process.env, ...opts.env },
    });

    let output = "";
    child.stdout.on("data", (d) => (output += d.toString()));
    child.stderr.on("data", (d) => (output += d.toString()));

    child.on("error", reject);
    child.on("close", (code) => {
      const clean = stripAnsi(output);
      const match = clean.match(BACKGROUNDED_LINE);
      if (match) {
        resolve({ agentId: match[1] });
      } else {
        reject(new Error(`claude --bg failed (exit ${code}): ${clean.trim()}`));
      }
    });
  });
}

export async function listBackgroundAgents(cwd: string): Promise<ClaudeBackgroundAgent[]> {
  const { stdout } = await execFileAsync("claude", ["agents", "--json", "--all", "--cwd", cwd]);
  const all = JSON.parse(stdout) as ClaudeBackgroundAgent[];
  return all.filter((a) => a.kind === "background");
}

export async function getAgentLogs(id: string): Promise<string> {
  const { stdout } = await execFileAsync("claude", ["logs", id], { maxBuffer: 10 * 1024 * 1024 });
  return stripAnsi(stdout);
}

export async function stopAgent(id: string): Promise<void> {
  await execFileAsync("claude", ["stop", id]);
}

export async function removeAgent(id: string): Promise<void> {
  await execFileAsync("claude", ["rm", id]);
}
