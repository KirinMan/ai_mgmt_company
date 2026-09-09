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
import type { HookEventPayload } from "./types.js";
import {
  buildEmployeeViews,
  assignTask,
  getEmployeeLogsById,
  getEmployeeChatById,
  stopEmployeeById,
  getTargetRepo,
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
