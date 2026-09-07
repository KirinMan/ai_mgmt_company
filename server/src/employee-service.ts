import path from "node:path";
import { fileURLToPath } from "node:url";
import { startAgent, listBackgroundAgents, getAgentLogs, stopAgent } from "./claude-cli.js";
import { loadEmployees, getAllStates, setCurrentAgent } from "./store.js";
import type { ClaudeBackgroundAgent, Employee, EmployeeStatus, EmployeeView } from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");

export function getTargetRepo(): string {
  return process.env.TARGET_REPO ? path.resolve(process.env.TARGET_REPO) : REPO_ROOT;
}

function mapStatus(agent: ClaudeBackgroundAgent | undefined): EmployeeStatus {
  if (!agent) return "no-agent";
  if (agent.state === "done") return "done";
  if (agent.status === "busy") return "working";
  const state = (agent.state ?? "").toLowerCase();
  if (state.includes("wait") || state.includes("permission")) return "waiting";
  if (agent.status === "idle") return "idle";
  return "error";
}

export async function buildEmployeeViews(): Promise<EmployeeView[]> {
  const employees = loadEmployees();
  const states = getAllStates();
  let agents: ClaudeBackgroundAgent[] = [];
  try {
    agents = await listBackgroundAgents(getTargetRepo());
  } catch (err) {
    console.error("failed to list background agents:", err);
  }

  return employees.map((employee: Employee): EmployeeView => {
    const state = states[employee.id];
    const agent = state?.currentAgentId
      ? agents.find((a) => a.id === state.currentAgentId)
      : undefined;

    return {
      id: employee.id,
      name: employee.name,
      role: employee.role,
      department: employee.department,
      status: mapStatus(agent),
      currentAgentId: state?.currentAgentId,
      currentPrompt: state?.history[0]?.prompt,
      lastUpdatedAt: agent?.startedAt,
    };
  });
}

function resolveApiKeyEnv(employee: Employee): Record<string, string> {
  const value = process.env[employee.apiKeyEnv];
  if (!value) return {};
  // CLI 自体は ANTHROPIC_API_KEY しか見ないので、社員ごとに割り当てた
  // 環境変数名（例: ANTHROPIC_API_KEY_ENG01）の値をここで標準名に詰め替える。
  return { ANTHROPIC_API_KEY: value };
}

export function findEmployee(employeeId: string): Employee | undefined {
  return loadEmployees().find((e) => e.id === employeeId);
}

export async function assignTask(
  employeeId: string,
  prompt: string,
): Promise<{ agentId: string }> {
  const employee = findEmployee(employeeId);
  if (!employee) throw new Error(`employee not found: ${employeeId}`);

  const trimmed = prompt.trim();
  if (!trimmed) throw new Error("prompt is required");

  const { agentId } = await startAgent({
    cwd: getTargetRepo(),
    worktreeName: employee.id,
    displayName: employee.name,
    prompt: trimmed,
    env: resolveApiKeyEnv(employee),
  });
  setCurrentAgent(employee.id, { agentId, prompt: trimmed, startedAt: Date.now() });
  return { agentId };
}

export async function getEmployeeLogsById(employeeId: string): Promise<string> {
  const agentId = getAllStates()[employeeId]?.currentAgentId;
  if (!agentId) return "";
  return getAgentLogs(agentId);
}

export async function stopEmployeeById(employeeId: string): Promise<void> {
  const agentId = getAllStates()[employeeId]?.currentAgentId;
  if (!agentId) throw new Error("no active agent");
  await stopAgent(agentId);
}
