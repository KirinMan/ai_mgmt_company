import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import type { Employee, EmployeeState, TaskRecord } from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.join(__dirname, "..", "config", "employees.json");
const STATE_PATH = path.join(__dirname, "..", "data", "state.json");

export function loadEmployees(): Employee[] {
  const raw = readFileSync(CONFIG_PATH, "utf-8");
  return (JSON.parse(raw) as { employees: Employee[] }).employees;
}

type StateMap = Record<string, EmployeeState>;

function readStateFile(): StateMap {
  if (!existsSync(STATE_PATH)) return {};
  try {
    return JSON.parse(readFileSync(STATE_PATH, "utf-8"));
  } catch {
    return {};
  }
}

function writeStateFile(state: StateMap): void {
  mkdirSync(path.dirname(STATE_PATH), { recursive: true });
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

export function getEmployeeState(employeeId: string): EmployeeState {
  const state = readStateFile();
  return state[employeeId] ?? { history: [] };
}

export function setCurrentAgent(employeeId: string, task: TaskRecord): void {
  const state = readStateFile();
  const existing = state[employeeId] ?? { history: [] };
  existing.currentAgentId = task.agentId;
  existing.history = [task, ...existing.history].slice(0, 20);
  state[employeeId] = existing;
  writeStateFile(state);
}

export function clearCurrentAgent(employeeId: string): void {
  const state = readStateFile();
  const existing = state[employeeId];
  if (existing) {
    delete existing.currentAgentId;
    state[employeeId] = existing;
    writeStateFile(state);
  }
}

export function getAllStates(): StateMap {
  return readStateFile();
}
