#!/usr/bin/env node
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { loadEmployees } from "./store.js";
import {
  buildEmployeeViews,
  assignTask,
  getEmployeeLogsById,
  stopEmployeeById,
} from "./employee-service.js";

const server = new McpServer({
  name: "ai-office",
  version: "0.1.0",
});

server.tool(
  "list_employees",
  "AI社員オフィスに所属する社員（AIコーディングエージェント）の一覧と、部署・役職・現在の状態" +
    "（no-agent=未着手 / idle=待機中 / working=作業中 / waiting=要対応 / done=完了 / error=エラー）を取得する。",
  {},
  async () => {
    const views = await buildEmployeeViews();
    return { content: [{ type: "text", text: JSON.stringify(views, null, 2) }] };
  },
);

server.tool(
  "assign_task",
  "指定した社員に指示（タスク）を出す。社員IDは list_employees で調べる。" +
    "実行中は Claude Code のバックグラウンドセッションとして動き、進捗は get_employee_logs で確認できる。",
  {
    employeeId: z.string().describe("社員ID（例: eng-01）。list_employees の id フィールド"),
    prompt: z.string().describe("自然文の指示内容"),
  },
  async ({ employeeId, prompt }) => {
    try {
      const { agentId } = await assignTask(employeeId, prompt);
      return {
        content: [
          { type: "text", text: `指示を出しました。agentId=${agentId}` },
        ],
      };
    } catch (err) {
      return {
        content: [{ type: "text", text: `指示に失敗しました: ${String(err)}` }],
        isError: true,
      };
    }
  },
);

server.tool(
  "get_employee_logs",
  "指定した社員の直近の作業ログ（ターミナル出力のテキスト）を取得する。",
  {
    employeeId: z.string().describe("社員ID"),
  },
  async ({ employeeId }) => {
    try {
      const logs = await getEmployeeLogsById(employeeId);
      return { content: [{ type: "text", text: logs || "(ログはまだありません)" }] };
    } catch (err) {
      return {
        content: [{ type: "text", text: `ログ取得に失敗しました: ${String(err)}` }],
        isError: true,
      };
    }
  },
);

server.tool(
  "stop_employee",
  "指定した社員が実行中のタスクを停止する。会話（コンテキスト）は保持されるので、" +
    "後から assign_task で続きを指示すれば再開できる。",
  {
    employeeId: z.string().describe("社員ID"),
  },
  async ({ employeeId }) => {
    try {
      await stopEmployeeById(employeeId);
      return { content: [{ type: "text", text: "停止しました" }] };
    } catch (err) {
      return {
        content: [{ type: "text", text: `停止に失敗しました: ${String(err)}` }],
        isError: true,
      };
    }
  },
);

server.tool(
  "find_employee_by_name",
  "社員の名前（または役職・部署名）からIDを検索する。「開発部のアキラ」のような自然な" +
    "呼びかけから employeeId を特定するのに使う。",
  {
    query: z.string().describe("社員名・役職・部署名の一部（例: アキラ / Engineer / 開発部）"),
  },
  async ({ query }) => {
    const employees = loadEmployees();
    const hit = employees.filter(
      (e) =>
        e.name.includes(query) || e.role.includes(query) || e.department.includes(query),
    );
    return { content: [{ type: "text", text: JSON.stringify(hit, null, 2) }] };
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
