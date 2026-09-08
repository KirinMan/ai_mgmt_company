import { getAllStates } from "./store.js";
import type { Activity, HookEventPayload } from "./types.js";

interface ActivityRecord {
  activity: Activity;
  updatedAt: number;
  detail?: string;
}

// employeeId -> 直近のアクティビティ（プロセス内メモリのみ、再起動でリセットされてよい）
const activityByEmployee = new Map<string, ActivityRecord>();

const TYPING_TOOLS = new Set(["Write", "Edit", "MultiEdit", "NotebookEdit"]);
const READING_TOOLS = new Set(["Read", "Grep", "Glob"]);
const RUNNING_TOOLS = new Set(["Bash", "BashOutput", "KillShell"]);
const RESEARCH_TOOLS = new Set(["WebFetch", "WebSearch"]);

function toolNameToActivity(toolName: string | undefined): Activity {
  if (!toolName) return "thinking";
  if (TYPING_TOOLS.has(toolName)) return "typing";
  if (READING_TOOLS.has(toolName)) return "reading";
  if (RUNNING_TOOLS.has(toolName)) return "running";
  if (RESEARCH_TOOLS.has(toolName)) return "researching";
  return "thinking";
}

function eventToActivity(payload: HookEventPayload): Activity {
  const eventName = payload.hookEventName || payload.hook_event_name || "";
  switch (eventName) {
    case "SessionStart":
      return "starting";
    case "PreToolUse":
      return toolNameToActivity(payload.tool_name);
    case "PostToolUse":
      return "thinking";
    case "Notification":
      return "waiting";
    case "Stop":
    case "SessionEnd":
      return "idle";
    default:
      return "thinking";
  }
}

/**
 * hooks が送ってくる session_id（フルUUID）は、`claude --bg` の短い agentId
 * （agents --json の id）を先頭に含む形式になっている。state.json に記録した
 * currentAgentId と前方一致させて、どの社員のイベントかを逆引きする。
 */
function findEmployeeIdBySessionId(sessionId: string | undefined): string | undefined {
  if (!sessionId) return undefined;
  const states = getAllStates();
  for (const [employeeId, state] of Object.entries(states)) {
    if (state.currentAgentId && sessionId.startsWith(state.currentAgentId)) {
      return employeeId;
    }
  }
  return undefined;
}

export function recordHookEvent(payload: HookEventPayload): string | undefined {
  const employeeId = findEmployeeIdBySessionId(payload.session_id);
  if (!employeeId) return undefined;

  activityByEmployee.set(employeeId, {
    activity: eventToActivity(payload),
    updatedAt: Date.now(),
    detail: typeof payload.tool_name === "string" ? payload.tool_name : undefined,
  });
  return employeeId;
}

export function getActivity(employeeId: string): Activity | undefined {
  return activityByEmployee.get(employeeId)?.activity;
}

export function clearActivity(employeeId: string): void {
  activityByEmployee.delete(employeeId);
}
