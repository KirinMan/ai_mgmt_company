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
  workdir?: string;
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

/**
 * claude hooks イベントから推定する、より粒度の細かい「今何をしているか」。
 * status（claude agents --json 由来、数秒遅れ）を hooks が届く限り上書きする。
 */
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
  apiKeyEnv?: string;
  status: EmployeeStatus;
  currentAgentId?: string;
  currentPrompt?: string;
  lastUpdatedAt?: number;
  activity?: Activity;
  cwd?: string;
}

export interface HookEventPayload {
  hookEventName: string;
  session_id?: string;
  hook_event_name?: string;
  tool_name?: string;
  cwd?: string;
  transcript_path?: string;
  [key: string]: unknown;
}

/** チャット表示用に会話ログ(JSONL)を要約した1エントリ */
export interface ChatTurn {
  role: "user" | "assistant" | "action";
  text: string;
  ts?: string;
}
