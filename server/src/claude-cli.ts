import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";
import stripAnsi from "strip-ansi";
import type { ClaudeBackgroundAgent } from "./types.js";

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * `claude --bg` の出力に含まれる "backgrounded · <id> · <name>" 行から
 * 短いセッションIDを取り出す。CLI の表示フォーマットに依存するため
 * ここが変わった場合はこの正規表現だけ直せばよい。
 */
const BACKGROUNDED_LINE = /backgrounded[^\S\n]*[·-][^\S\n]*([a-z0-9]+)/i;

/**
 * hooks を対象フォルダの設定ファイルに頼らず、起動のたびに `--settings` で
 * 直接注入する。これにより「PC上のどのフォルダで作業させても」フックが
 * 効くようになる（対象フォルダに .claude/settings.json を用意する必要がない）。
 */
function buildHookSettingsJson(port: number): string {
  const hookScript = path.resolve(__dirname, "..", "hooks", "hook-handler.mjs");
  const node = JSON.stringify(process.execPath);
  const script = JSON.stringify(hookScript);
  const command = (event: string) => `${node} ${script} ${event}`;

  return JSON.stringify({
    env: { AI_OFFICE_PORT: String(port) },
    hooks: {
      SessionStart: [{ hooks: [{ type: "command", command: command("SessionStart") }] }],
      PreToolUse: [{ matcher: "*", hooks: [{ type: "command", command: command("PreToolUse") }] }],
      PostToolUse: [{ matcher: "*", hooks: [{ type: "command", command: command("PostToolUse") }] }],
      Notification: [{ hooks: [{ type: "command", command: command("Notification") }] }],
      Stop: [{ hooks: [{ type: "command", command: command("Stop") }] }],
    },
  });
}

export interface StartAgentOptions {
  cwd: string;
  /** 省略すると git worktree を作らず、cwd で直接セッションを開始する */
  worktreeName?: string;
  displayName: string;
  prompt: string;
  env: Record<string, string>;
  port: number;
}

export async function isGitRepo(dir: string): Promise<boolean> {
  try {
    await execFileAsync("git", ["rev-parse", "--is-inside-work-tree"], { cwd: dir });
    return true;
  } catch {
    return false;
  }
}

export function startAgent(opts: StartAgentOptions): Promise<{ agentId: string }> {
  return new Promise((resolve, reject) => {
    // バックグラウンド実行では権限確認プロンプトに誰も応答できず永久に停止するため、
    // 確認なしで全ツールを実行できるようにする（git worktree があれば作業ブランチは分離される）。
    const args = ["--bg"];
    if (opts.worktreeName) args.push("-w", opts.worktreeName);
    args.push(
      "-n",
      opts.displayName,
      "--dangerously-skip-permissions",
      "--settings",
      buildHookSettingsJson(opts.port),
      opts.prompt,
    );

    const child = spawn("claude", args, {
      cwd: opts.cwd,
      env: { ...process.env, ...opts.env, AI_OFFICE_PORT: String(opts.port) },
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

/**
 * 社員は PC 上のどのフォルダでも作業しうるため、cwd で絞り込まず
 * 全てのバックグラウンドセッションを取得する。どれがどの社員かは
 * 呼び出し側が state.json の agentId で突き合わせる。
 */
export async function listBackgroundAgents(): Promise<ClaudeBackgroundAgent[]> {
  const { stdout } = await execFileAsync("claude", ["agents", "--json", "--all"]);
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
