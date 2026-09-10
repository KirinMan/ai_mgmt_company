import dotenv from "dotenv";
import express from "express";
import { WebSocketServer } from "ws";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

import { removeAgent } from "./claude-cli.js";
import { getAllStates } from "./store.js";
import { recordHookEvent } from "./activity-tracker.js";
import { browseDirectory } from "./browse.js";
import type { HookEventPayload } from "./types.js";
import {
  buildEmployeeViews,
  assignTask,
  getEmployeeLogsById,
  getEmployeeChatById,
  stopEmployeeById,
  getTargetRepo,
  listDepartments,
  addDepartment,
  renameDepartmentByName,
  removeDepartment,
  addEmployee,
  editEmployee,
  removeEmployee,
} from "./employee-service.js";

const PORT = Number(process.env.PORT ?? 4000);

const app = express();
app.use(express.json());

app.get("/api/employees", async (_req, res) => {
  res.json(await buildEmployeeViews());
});

app.get("/api/config", (_req, res) => {
  res.json({ defaultWorkdir: getTargetRepo() });
});

// 作業フォルダ選択モーダル用の簡易ディレクトリブラウザ
app.get("/api/browse", (req, res) => {
  try {
    const result = browseDirectory(req.query.path ? String(req.query.path) : undefined);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: String(err) });
  }
});

app.post("/api/employees/:id/tasks", async (req, res) => {
  const prompt = String(req.body?.prompt ?? "");
  const workdir = req.body?.workdir ? String(req.body.workdir) : undefined;
  try {
    const { agentId } = await assignTask(req.params.id, prompt, workdir);
    res.json({ agentId });
  } catch (err) {
    const message = String(err);
    const status = message.includes("not found")
      ? 404
      : message.includes("prompt is required") || message.includes("workdir does not exist")
        ? 400
        : 500;
    res.status(status).json({ error: message });
  }
});

app.get("/api/employees/:id/logs", async (req, res) => {
  try {
    const logs = await getEmployeeLogsById(req.params.id);
    res.json({ logs });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get("/api/employees/:id/chat", (req, res) => {
  res.json({ turns: getEmployeeChatById(req.params.id) });
});

app.post("/api/employees/:id/stop", async (req, res) => {
  try {
    await stopEmployeeById(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(404).json({ error: String(err) });
  }
});

app.delete("/api/employees/:id/agent", async (req, res) => {
  const agentId = getAllStates()[req.params.id]?.currentAgentId;
  if (!agentId) {
    res.status(404).json({ error: "no active agent" });
    return;
  }
  await removeAgent(agentId);
  res.json({ ok: true });
});

const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

async function broadcastEmployeeViews() {
  if (wss.clients.size === 0) return;
  const views = await buildEmployeeViews();
  const payload = JSON.stringify({ type: "employees", data: views });
  for (const client of wss.clients) {
    if (client.readyState === client.OPEN) client.send(payload);
  }
}

// --- 組織管理（部署・社員の追加/変更/削除）---

app.get("/api/departments", (_req, res) => {
  res.json({ departments: listDepartments() });
});

app.post("/api/departments", (req, res) => {
  try {
    addDepartment(String(req.body?.name ?? ""));
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: String(err) });
  }
});

app.patch("/api/departments/:name", async (req, res) => {
  try {
    renameDepartmentByName(req.params.name, String(req.body?.newName ?? ""));
    res.json({ ok: true });
    void broadcastEmployeeViews();
  } catch (err) {
    res.status(400).json({ error: String(err) });
  }
});

app.delete("/api/departments/:name", (req, res) => {
  try {
    removeDepartment(req.params.name);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: String(err) });
  }
});

app.post("/api/employees", async (req, res) => {
  try {
    const employee = addEmployee({
      name: String(req.body?.name ?? ""),
      role: String(req.body?.role ?? ""),
      department: String(req.body?.department ?? ""),
      apiKeyEnv: req.body?.apiKeyEnv ? String(req.body.apiKeyEnv) : undefined,
    });
    res.json(employee);
    void broadcastEmployeeViews();
  } catch (err) {
    res.status(400).json({ error: String(err) });
  }
});

app.patch("/api/employees/:id", async (req, res) => {
  try {
    const patch: Record<string, string> = {};
    for (const key of ["name", "role", "department", "apiKeyEnv"] as const) {
      if (req.body?.[key] !== undefined) patch[key] = String(req.body[key]);
    }
    const employee = editEmployee(req.params.id, patch);
    res.json(employee);
    void broadcastEmployeeViews();
  } catch (err) {
    res.status(400).json({ error: String(err) });
  }
});

app.delete("/api/employees/:id", async (req, res) => {
  try {
    await removeEmployee(req.params.id);
    res.json({ ok: true });
    void broadcastEmployeeViews();
  } catch (err) {
    res.status(400).json({ error: String(err) });
  }
});

// claude CLI の hooks（server/hooks/hook-handler.mjs）から飛んでくるイベント。
// worktree 内で動いているエージェントの「今何をしているか」を即座に反映する。
app.post("/api/hooks", (req, res) => {
  res.status(202).end();
  const employeeId = recordHookEvent(req.body as HookEventPayload);
  if (employeeId) void broadcastEmployeeViews();
});

wss.on("connection", (ws) => {
  buildEmployeeViews().then((views) => {
    ws.send(JSON.stringify({ type: "employees", data: views }));
  });
});

setInterval(broadcastEmployeeViews, 3000);

httpServer.listen(PORT, () => {
  console.log(`AI社員オフィス サーバー起動: http://localhost:${PORT}`);
  console.log(`対象リポジトリ: ${getTargetRepo()}`);
});
