import { useEffect, useRef, useState } from "react";
import type { Activity, EmployeeStatus, EmployeeView } from "./types";
import { OfficeMap } from "./OfficeMap";

const STATUS_LABEL: Record<EmployeeStatus, string> = {
  "no-agent": "未着手",
  idle: "待機中",
  working: "作業中",
  waiting: "要対応",
  done: "完了",
  error: "エラー",
};

const STATUS_CLASS: Record<EmployeeStatus, string> = {
  "no-agent": "status status-idle",
  idle: "status status-idle",
  working: "status status-working",
  waiting: "status status-waiting",
  done: "status status-done",
  error: "status status-error",
};

const ACTIVITY_LABEL: Record<Activity, string> = {
  starting: "出社中…",
  thinking: "考え中…",
  typing: "編集中…",
  reading: "調査中…",
  running: "コマンド実行中…",
  researching: "Web検索中…",
  waiting: "確認待ち…",
  idle: "待機中",
};

export default function App() {
  const [employees, setEmployees] = useState<EmployeeView[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [logs, setLogs] = useState<string>("");
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${location.host}/ws`);
    wsRef.current = ws;
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === "employees") setEmployees(msg.data);
    };
    return () => ws.close();
  }, []);

  const selected = employees.find((e) => e.id === selectedId) ?? null;

  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    const fetchLogs = async () => {
      const res = await fetch(`/api/employees/${selectedId}/logs`);
      const data = await res.json();
      if (!cancelled) setLogs(data.logs ?? "");
    };
    fetchLogs();
    const interval = setInterval(fetchLogs, 3000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [selectedId]);

  async function submitTask() {
    if (!selectedId || !prompt.trim()) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/employees/${selectedId}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      if (!res.ok) {
        const err = await res.json();
        alert(`指示の送信に失敗しました: ${err.error ?? res.statusText}`);
      } else {
        setPrompt("");
      }
    } finally {
      setBusy(false);
    }
  }

  async function stopCurrent() {
    if (!selectedId) return;
    await fetch(`/api/employees/${selectedId}/stop`, { method: "POST" });
  }

  return (
    <div className="layout">
      <header className="topbar">
        <h1>AI社員オフィス</h1>
        <span className="topbar-sub">部署別フロアマップ · Phase 2</span>
      </header>

      <main className="main">
        <section className="floor">
          {employees.length === 0 ? (
            <p className="empty-hint">
              社員データを読み込み中、またはサーバーに接続できていません。
            </p>
          ) : (
            <OfficeMap employees={employees} selectedId={selectedId} onSelect={setSelectedId} />
          )}
        </section>

        <aside className="panel">
          {!selected && <p className="empty-hint">社員を選んで指示を出せます。</p>}
          {selected && (
            <>
              <h2 className="panel-title">
                {selected.name}
                <span className={STATUS_CLASS[selected.status]}>
                  {STATUS_LABEL[selected.status]}
                </span>
              </h2>
              <p className="panel-meta">
                {selected.department} / {selected.role}
              </p>
              {selected.status === "working" && (
                <p className="panel-activity">
                  {ACTIVITY_LABEL[selected.activity ?? "thinking"]}
                </p>
              )}

              <label className="field-label" htmlFor="prompt">
                指示内容
              </label>
              <textarea
                id="prompt"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="例: READMEに開発環境のセットアップ手順を追記してください"
                rows={4}
              />
              <div className="actions">
                <button onClick={submitTask} disabled={busy || !prompt.trim()}>
                  指示を送る
                </button>
                <button
                  onClick={stopCurrent}
                  disabled={!selected.currentAgentId || selected.status !== "working"}
                  className="secondary"
                >
                  停止
                </button>
              </div>

              <h3 className="log-title">ログ</h3>
              <pre className="log">{logs || "（ログはまだありません）"}</pre>
            </>
          )}
        </aside>
      </main>
    </div>
  );
}
