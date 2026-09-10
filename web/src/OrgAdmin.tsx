import { useEffect, useState } from "react";
import type { EmployeeView } from "./types";

interface EmployeeDraft {
  name: string;
  role: string;
  department: string;
  apiKeyEnv: string;
}

function toDraft(e: EmployeeView): EmployeeDraft {
  return {
    name: e.name,
    role: e.role,
    department: e.department,
    apiKeyEnv: e.apiKeyEnv || "ANTHROPIC_API_KEY",
  };
}

export interface OrgAdminProps {
  onClose: () => void;
}

export function OrgAdmin({ onClose }: OrgAdminProps) {
  const [departments, setDepartments] = useState<string[]>([]);
  const [employees, setEmployees] = useState<EmployeeView[]>([]);
  const [deptDrafts, setDeptDrafts] = useState<Record<string, string>>({});
  const [empDrafts, setEmpDrafts] = useState<Record<string, EmployeeDraft>>({});
  const [newDeptName, setNewDeptName] = useState("");
  const [newEmp, setNewEmp] = useState({ name: "", role: "", department: "" });
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    const [deptRes, empRes] = await Promise.all([
      fetch("/api/departments").then((r) => r.json()),
      fetch("/api/employees").then((r) => r.json() as Promise<EmployeeView[]>),
    ]);
    const depts: string[] = deptRes.departments;
    setDepartments(depts);
    setEmployees(empRes);
    setDeptDrafts(Object.fromEntries(depts.map((d) => [d, d])));
    setEmpDrafts(Object.fromEntries(empRes.map((e) => [e.id, toDraft(e)])));
    setNewEmp((v) => (v.department ? v : { ...v, department: depts[0] ?? "" }));
  }

  useEffect(() => {
    refresh();
  }, []);

  function employeeCount(dept: string): number {
    return employees.filter((e) => e.department === dept).length;
  }

  async function handleApiError(res: Response) {
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? res.statusText);
      return false;
    }
    setError(null);
    return true;
  }

  async function createDepartment() {
    if (!newDeptName.trim()) return;
    const res = await fetch("/api/departments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newDeptName.trim() }),
    });
    if (await handleApiError(res)) {
      setNewDeptName("");
      await refresh();
    }
  }

  async function saveDepartment(oldName: string) {
    const newName = deptDrafts[oldName]?.trim();
    if (!newName || newName === oldName) return;
    const res = await fetch(`/api/departments/${encodeURIComponent(oldName)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newName }),
    });
    if (await handleApiError(res)) await refresh();
  }

  async function deleteDepartment(name: string) {
    const res = await fetch(`/api/departments/${encodeURIComponent(name)}`, { method: "DELETE" });
    if (await handleApiError(res)) await refresh();
  }

  async function createEmployee() {
    if (!newEmp.name.trim() || !newEmp.role.trim() || !newEmp.department) return;
    const res = await fetch("/api/employees", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newEmp),
    });
    if (await handleApiError(res)) {
      setNewEmp({ name: "", role: "", department: newEmp.department });
      await refresh();
    }
  }

  async function saveEmployee(id: string) {
    const draft = empDrafts[id];
    if (!draft) return;
    const res = await fetch(`/api/employees/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
    });
    if (await handleApiError(res)) await refresh();
  }

  async function deleteEmployee(id: string) {
    const res = await fetch(`/api/employees/${id}`, { method: "DELETE" });
    if (await handleApiError(res)) await refresh();
  }

  return (
    <div className="org-admin">
      <div className="org-admin-header">
        <h2>🏢 組織管理</h2>
        <button className="secondary" onClick={onClose}>
          ✕ 閉じる
        </button>
      </div>

      {error && <p className="org-error">{error}</p>}

      <section className="org-section">
        <h3>部署</h3>
        <div className="org-table">
          {departments.map((dept) => (
            <div className="org-row" key={dept}>
              <input
                type="text"
                value={deptDrafts[dept] ?? dept}
                onChange={(e) => setDeptDrafts((v) => ({ ...v, [dept]: e.target.value }))}
              />
              <span className="org-count">{employeeCount(dept)}人</span>
              <button className="secondary" onClick={() => saveDepartment(dept)}>
                保存
              </button>
              <button
                className="secondary"
                onClick={() => deleteDepartment(dept)}
                disabled={employeeCount(dept) > 0}
                title={employeeCount(dept) > 0 ? "社員が所属しているため削除できません" : "削除"}
              >
                削除
              </button>
            </div>
          ))}
        </div>
        <div className="org-add-row">
          <input
            type="text"
            placeholder="新しい部署名（例: 営業部）"
            value={newDeptName}
            onChange={(e) => setNewDeptName(e.target.value)}
          />
          <button onClick={createDepartment} disabled={!newDeptName.trim()}>
            + 部署を追加
          </button>
        </div>
      </section>

      <section className="org-section">
        <h3>社員</h3>
        <div className="org-table org-table-employee">
          {employees.map((emp) => {
            const draft = empDrafts[emp.id] ?? toDraft(emp);
            return (
              <div className="org-row org-row-employee" key={emp.id}>
                <input
                  type="text"
                  value={draft.name}
                  onChange={(e) =>
                    setEmpDrafts((v) => ({ ...v, [emp.id]: { ...draft, name: e.target.value } }))
                  }
                  placeholder="名前"
                />
                <input
                  type="text"
                  value={draft.role}
                  onChange={(e) =>
                    setEmpDrafts((v) => ({ ...v, [emp.id]: { ...draft, role: e.target.value } }))
                  }
                  placeholder="役職"
                />
                <select
                  value={draft.department}
                  onChange={(e) =>
                    setEmpDrafts((v) => ({
                      ...v,
                      [emp.id]: { ...draft, department: e.target.value },
                    }))
                  }
                >
                  {departments.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  className="org-apikey"
                  value={draft.apiKeyEnv}
                  onChange={(e) =>
                    setEmpDrafts((v) => ({
                      ...v,
                      [emp.id]: { ...draft, apiKeyEnv: e.target.value },
                    }))
                  }
                  placeholder="ANTHROPIC_API_KEY"
                  title="この社員のタスク実行時に読む環境変数名（BYOK用）"
                />
                <button className="secondary" onClick={() => saveEmployee(emp.id)}>
                  保存
                </button>
                <button className="secondary" onClick={() => deleteEmployee(emp.id)}>
                  解雇
                </button>
              </div>
            );
          })}
        </div>
        <div className="org-add-row org-add-row-employee">
          <input
            type="text"
            placeholder="名前"
            value={newEmp.name}
            onChange={(e) => setNewEmp((v) => ({ ...v, name: e.target.value }))}
          />
          <input
            type="text"
            placeholder="役職（例: Engineer）"
            value={newEmp.role}
            onChange={(e) => setNewEmp((v) => ({ ...v, role: e.target.value }))}
          />
          <select
            value={newEmp.department}
            onChange={(e) => setNewEmp((v) => ({ ...v, department: e.target.value }))}
          >
            {departments.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
          <button
            onClick={createEmployee}
            disabled={!newEmp.name.trim() || !newEmp.role.trim() || !newEmp.department}
          >
            + 社員を採用
          </button>
        </div>
      </section>
    </div>
  );
}
