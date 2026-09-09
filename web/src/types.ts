export type EmployeeStatus = "idle" | "working" | "waiting" | "done" | "error" | "no-agent";

export type Activity =
  | "starting"
  | "thinking"
  | "typing"
  | "reading"
  | "running"
  | "researching"
  | "waiting"
  | "idle";

export interface EmployeeView {
  id: string;
  name: string;
  role: string;
  department: string;
  status: EmployeeStatus;
  currentAgentId?: string;
  currentPrompt?: string;
  lastUpdatedAt?: number;
  activity?: Activity;
}
