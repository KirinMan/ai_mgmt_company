export interface Employee {
  id: string;
  name: string;
  role: string;
  department: string;
  apiKeyEnv: string;
}

export interface TaskRecord {
  agentId: string;
  prompt: string;
  startedAt: number;
}

export interface EmployeeState {
  currentAgentId?: string;
  history: TaskRecord[];
}

export interface ClaudeBackgroundAgent {
  pid: number;
  id: string;
  cwd: string;
  kind: "background" | "interactive";
  startedAt: number;
  sessionId: string;
  name: string;
  status: "busy" | "idle";
  state?: string;
}

export type EmployeeStatus = "idle" | "working" | "waiting" | "done" | "error" | "no-agent";

export interface EmployeeView {
  id: string;
  name: string;
  role: string;
  department: string;
  status: EmployeeStatus;
  currentAgentId?: string;
  currentPrompt?: string;
  lastUpdatedAt?: number;
}
