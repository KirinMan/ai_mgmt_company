import path from "node:path";
import { existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  startAgent,
  listBackgroundAgents,
  getAgentLogs,
  stopAgent,
  removeAgent,
  isGitRepo,
} from "./claude-cli.js";
import {
  loadEmployees,
  loadDepartments,
  getAllStates,
  setCurrentAgent,
  createDepartment as storeCreateDepartment,
  renameDepartment as storeRenameDepartment,
  deleteDepartment as storeDeleteDepartment,
  createEmployee as storeCreateEmployee,
  updateEmployee as storeUpdateEmployee,
  deleteEmployee as storeDeleteEmployee,
  removeEmployeeState,
  type CreateEmployeeInput,
  type UpdateEmployeeInput,
} from "./store.js";
import { getActivity, getTranscriptPath, clearActivity } from "./activity-tracker.js";
import { readChatTurns } from "./transcript.js";
import type {
  ChatTurn,
  ClaudeBackgroundAgent,
  Employee,
  EmployeeStatus,
  EmployeeView,
} from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");

export function getTargetRepo(): string {
  return process.env.TARGET_REPO ? path.resolve(process.env.TARGET_REPO) : REPO_ROOT;
}

export function getPort(): number {
  return Number(process.env.PORT ?? 4000);
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
    agents = await listBackgroundAgents();
  } catch (err) {
    console.error("failed to list background agents:", err);
  }

  return employees.map((employee: Employee): EmployeeView => {
    const state = states[employee.id];
    const agent = state?.currentAgentId
      ? agents.find((a) => a.id === state.currentAgentId)
      : undefined;
    const status = mapStatus(agent);

    return {
      id: employee.id,
      name: employee.name,
      role: employee.role,
      department: employee.department,
      apiKeyEnv: employee.apiKeyEnv,
      status,
      currentAgentId: state?.currentAgentId,
      currentPrompt: state?.history[0]?.prompt,
      lastUpdatedAt: agent?.startedAt,
      // hooks 由来のアクティビティは working 中の演出にのみ使う
      activity: status === "working" ? getActivity(employee.id) : undefined,
      // 実際にプロセスが動いているディレクトリ（worktree の有無に関わらず正確）
      cwd: agent?.cwd,
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

function validateWorkdir(workdir: string): void {
  if (!existsSync(workdir) || !statSync(workdir).isDirectory()) {
    throw new Error(`workdir does not exist or is not a directory: ${workdir}`);
  }
}

export async function assignTask(
  employeeId: string,
  prompt: string,
  workdir?: string,
): Promise<{ agentId: string }> {
  const employee = findEmployee(employeeId);
  if (!employee) throw new Error(`employee not found: ${employeeId}`);

  const trimmed = prompt.trim();
  if (!trimmed) throw new Error("prompt is required");

  const cwd = workdir ? path.resolve(workdir) : getTargetRepo();
  if (workdir) validateWorkdir(cwd);

  // Git 管理下のフォルダなら worktree でブランチを分離し、それ以外は
  // そのフォルダで直接作業させる（PC上のどんなフォルダでも指示できるようにするため）。
  const useWorktree = await isGitRepo(cwd);

  const { agentId } = await startAgent({
    cwd,
    worktreeName: useWorktree ? employee.id : undefined,
    displayName: employee.name,
    prompt: trimmed,
    env: resolveApiKeyEnv(employee),
    port: getPort(),
  });
  clearActivity(employee.id);
  setCurrentAgent(employee.id, { agentId, prompt: trimmed, startedAt: Date.now(), workdir: cwd });
  return { agentId };
}

export async function getEmployeeLogsById(employeeId: string): Promise<string> {
  const agentId = getAllStates()[employeeId]?.currentAgentId;
  if (!agentId) return "";
  return getAgentLogs(agentId);
}

export function getEmployeeChatById(employeeId: string): ChatTurn[] {
  const transcriptPath = getTranscriptPath(employeeId);
  if (!transcriptPath) return [];
  return readChatTurns(transcriptPath);
}

export async function stopEmployeeById(employeeId: string): Promise<void> {
  const agentId = getAllStates()[employeeId]?.currentAgentId;
  if (!agentId) throw new Error("no active agent");
  await stopAgent(agentId);
}

// --- 組織管理（社長として部署・社員を操作する）---

export function listDepartments(): string[] {
  return loadDepartments();
}

export function addDepartment(name: string): void {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("department name is required");
  storeCreateDepartment(trimmed);
}

export function renameDepartmentByName(oldName: string, newName: string): void {
  const trimmed = newName.trim();
  if (!trimmed) throw new Error("department name is required");
  storeRenameDepartment(oldName, trimmed);
}

export function removeDepartment(name: string): void {
  storeDeleteDepartment(name);
}

export function addEmployee(input: CreateEmployeeInput): Employee {
  if (!input.name?.trim()) throw new Error("name is required");
  if (!input.role?.trim()) throw new Error("role is required");
  if (!input.department?.trim()) throw new Error("department is required");
  return storeCreateEmployee({
    name: input.name.trim(),
    role: input.role.trim(),
    department: input.department.trim(),
    apiKeyEnv: input.apiKeyEnv?.trim(),
  });
}

export function editEmployee(id: string, patch: UpdateEmployeeInput): Employee {
  return storeUpdateEmployee(id, patch);
}

/** 社員を解雇する。実行中のバックグラウンドセッションがあれば止めてから削除する。 */
export async function removeEmployee(employeeId: string): Promise<void> {
  const agentId = getAllStates()[employeeId]?.currentAgentId;
  if (agentId) {
    try {
      await stopAgent(agentId);
    } catch {
      // 既に終了している等は無視
    }
    try {
      await removeAgent(agentId);
    } catch {
      // worktree が使用中で消せない等は無視（孤立しても実害は小さい）
    }
  }
  removeEmployeeState(employeeId);
  storeDeleteEmployee(employeeId);
  clearActivity(employeeId);
}
