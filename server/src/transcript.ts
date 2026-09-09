import { readFileSync } from "node:fs";
import path from "node:path";
import type { ChatTurn } from "./types.js";

interface ContentBlock {
  type: string;
  text?: string;
  name?: string;
  input?: Record<string, unknown>;
}

interface TranscriptLine {
  type: string;
  timestamp?: string;
  message?: {
    role: string;
    content: string | ContentBlock[];
  };
}

function shortenPath(p: unknown): string {
  if (typeof p !== "string") return "";
  return path.basename(p);
}

function summarizeToolUse(name: string | undefined, input: Record<string, unknown> | undefined): string {
  const i = input ?? {};
  switch (name) {
    case "Bash":
      return `🔧 ${(i.description as string) || (i.command as string) || ""}`;
    case "Read":
      return `📖 ${shortenPath(i.file_path)}`;
    case "Write":
      return `📝 ${shortenPath(i.file_path)}`;
    case "Edit":
    case "MultiEdit":
      return `✏️ ${shortenPath(i.file_path)}`;
    case "Grep":
      return `🔍 検索: ${i.pattern ?? ""}`;
    case "Glob":
      return `🔍 検索: ${i.pattern ?? ""}`;
    case "WebFetch":
      return `🌐 ${i.url ?? ""}`;
    case "WebSearch":
      return `🌐 検索: ${i.query ?? ""}`;
    case "TodoWrite":
      return "📋 タスクリストを更新";
    default:
      return `🔧 ${name ?? "ツール実行"}`;
  }
}

/**
 * Claude Code の会話ログ(JSONL, 1行1メッセージ)を読み、
 * チャット表示向けに「ユーザーの指示」「ツール実行」「AIの返答テキスト」だけを抜き出す。
 * thinking ブロックや tool_result（ツールの生出力）はノイズになるため表示しない。
 */
export function readChatTurns(transcriptPath: string, limit = 200): ChatTurn[] {
  let raw: string;
  try {
    raw = readFileSync(transcriptPath, "utf-8");
  } catch {
    return [];
  }

  const turns: ChatTurn[] = [];
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    let entry: TranscriptLine;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }

    if (entry.type !== "user" && entry.type !== "assistant") continue;
    const content = entry.message?.content;
    if (content == null) continue;

    if (typeof content === "string") {
      if (entry.type === "user" && content.trim()) {
        turns.push({ role: "user", text: content, ts: entry.timestamp });
      }
      continue;
    }

    for (const block of content) {
      if (block.type === "text" && block.text?.trim()) {
        turns.push({
          role: entry.type === "user" ? "user" : "assistant",
          text: block.text,
          ts: entry.timestamp,
        });
      } else if (block.type === "tool_use" && entry.type === "assistant") {
        turns.push({ role: "action", text: summarizeToolUse(block.name, block.input), ts: entry.timestamp });
      }
      // tool_result, thinking は表示しない
    }
  }

  return turns.slice(-limit);
}
