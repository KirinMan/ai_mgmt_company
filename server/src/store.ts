import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { Employee, EmployeeState, TaskRecord } from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXAMPLE_CONFIG_PATH = path.join(__dirname, "..", "config", "employees.example.json");
const CONFIG_PATH = path.join(__dirname, "..", "data", "employees.json");
const STATE_PATH = path.join(__dirname, "..", "data", "state.json");

export interface OrgConfig {
  departments: string[];
  employees: Employee[];
}

/**
 * 社員・部署のデータは「ユーザーがアプリ上で自由に編集する実行時データ」なので
 * .env と同じように、リポジトリにコミットされるのはサンプル(employees.example.json)
 * のみとし、実データは gitignore された server/data/employees.json に持つ。
 * 初回起動時にサンプルをコピーしてブートストラップする。
 */
function ensureConfigFile(): void {
  if (existsSync(CONFIG_PATH)) return;
  mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
  copyFileSync(EXAMPLE_CONFIG_PATH, CONFIG_PATH);
}

function readConfig(): OrgConfig {
  ensureConfigFile();
  const raw = readFileSync(CONFIG_PATH, "utf-8");
  const parsed = JSON.parse(raw) as Partial<OrgConfig>;
  const employees = parsed.employees ?? [];
  // departments が未定義の古い形式のデータでも、社員の department 値から補完する
  const departments = parsed.departments ?? [...new Set(employees.map((e) => e.department))];
  return { departments, employees };
}

function writeConfig(config: OrgConfig): void {
  mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

export function loadEmployees(): Employee[] {
  return readConfig().employees;
}

export function loadDepartments(): string[] {
  return readConfig().departments;
}

export function createDepartment(name: string): void {
  const config = readConfig();
  if (config.departments.includes(name)) throw new Error("department already exists");
  config.departments.push(name);
  writeConfig(config);
}

export function renameDepartment(oldName: string, newName: string): void {
  const config = readConfig();
  if (!config.departments.includes(oldName)) throw new Error("department not found");
  if (oldName !== newName && config.departments.includes(newName)) {
    throw new Error("department already exists");
  }
  config.departments = config.departments.map((d) => (d === oldName ? newName : d));
  config.employees = config.employees.map((e) =>
    e.department === oldName ? { ...e, department: newName } : e,
  );
  writeConfig(config);
}

export function deleteDepartment(name: string): void {
  const config = readConfig();
  if (config.employees.some((e) => e.department === name)) {
    throw new Error("department is not empty");
  }
  config.departments = config.departments.filter((d) => d !== name);
  writeConfig(config);
}

export interface CreateEmployeeInput {
  name: string;
  role: string;
  department: string;
  apiKeyEnv?: string;
}

export function createEmployee(input: CreateEmployeeInput): Employee {
  const config = readConfig();
  if (!config.departments.includes(input.department)) {
    throw new Error("department not found");
  }
  const employee: Employee = {
    id: `emp-${randomUUID().slice(0, 8)}`,
    name: input.name,
    role: input.role,
    department: input.department,
    apiKeyEnv: input.apiKeyEnv || "ANTHROPIC_API_KEY",
  };
  config.employees.push(employee);
  writeConfig(config);
  return employee;
}

export type UpdateEmployeeInput = Partial<Omit<Employee, "id">>;

export function updateEmployee(id: string, patch: UpdateEmployeeInput): Employee {
  const config = readConfig();
  const idx = config.employees.findIndex((e) => e.id === id);
  if (idx === -1) throw new Error("employee not found");
  if (patch.department && !config.departments.includes(patch.department)) {
    throw new Error("department not found");
  }
  config.employees[idx] = { ...config.employees[idx], ...patch };
  writeConfig(config);
  return config.employees[idx];
}

export function deleteEmployee(id: string): void {
  const config = readConfig();
  config.employees = config.employees.filter((e) => e.id !== id);
  writeConfig(config);
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

export function removeEmployeeState(employeeId: string): void {
  const state = readStateFile();
  delete state[employeeId];
  writeStateFile(state);
}

export function getAllStates(): StateMap {
  return readStateFile();
}
