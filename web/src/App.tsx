import { useEffect, useRef, useState } from "react";
import type { Activity, ChatTurn, EmployeeStatus, EmployeeView } from "./types";
import { OfficeMap } from "./OfficeMap";
import { OrgAdmin } from "./OrgAdmin";
import { FolderPickerModal } from "./FolderPickerModal";

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

function workdirStorageKey(employeeId: string) {
  return `ai-office:workdir:${employeeId}`;
}

export default function App() {
  const [employees, setEmployees] = useState<EmployeeView[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [chat, setChat] = useState<ChatTurn[]>([]);
  const [rawLogs, setRawLogs] = useState<string>("");
  const [prompt, setPrompt] = useState("");
  const [workdir, setWorkdir] = useState("");
  const [defaultWorkdir, setDefaultWorkdir] = useState("");
  const [busy, setBusy] = useState(false);
  const [showOrgAdmin, setShowOrgAdmin] = useState(false);
  const [showFolderPicker, setShowFolderPicker] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then((d) => setDefaultWorkdir(d.defaultWorkdir ?? ""));
  }, []);

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

  // 社員を切り替えたら、その社員向けに前回選んだフォルダ（なければ既定フォルダ）を復元する
  useEffect(() => {
    if (!selectedId) return;
    const saved = localStorage.getItem(workdirStorageKey(selectedId));
    setWorkdir(saved ?? defaultWorkdir);
  }, [selectedId, defaultWorkdir]);

  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    const fetchChat = async () => {
      const [chatRes, logsRes] = await Promise.all([
        fetch(`/api/employees/${selectedId}/chat`),
        fetch(`/api/employees/${selectedId}/logs`),
      ]);
      const chatData = await chatRes.json();
      const logsData = await logsRes.json();
      if (!cancelled) {
        setChat(chatData.turns ?? []);
        setRawLogs(logsData.logs ?? "");
      }
    };
    fetchChat();
    const interval = setInterval(fetchChat, 2000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [selectedId]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ block: "end" });
  }, [chat]);

  async function submitTask() {
    if (!selectedId || !prompt.trim()) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/employees/${selectedId}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, workdir: workdir.trim() || undefined }),
      });
      if (!res.ok) {
        const err = await res.json();
        alert(`指示の送信に失敗しました: ${err.error ?? res.statusText}`);
      } else {
        setPrompt("");
        if (workdir.trim()) {
          localStorage.setItem(workdirStorageKey(selectedId), workdir.trim());
        }
      }
    } finally {
      setBusy(false);
    }
  }

  async function stopCurrent() {
    if (!selectedId) return;
    await fetch(`/api/employees/${selectedId}/stop`, { method: "POST" });
  }

  if (showOrgAdmin) {
    return (
      <div className="layout">
        <header className="topbar">
          <h1>AI社員オフィス</h1>
          <span className="topbar-sub">部署別フロアマップ · Phase 2</span>
        </header>
        <main className="main main-single">
          <OrgAdmin onClose={() => setShowOrgAdmin(false)} />
        </main>
      </div>
    );
  }

  return (
    <div className="layout">
      <header className="topbar">
        <h1>AI社員オフィス</h1>
        <span className="topbar-sub">部署別フロアマップ · Phase 2</span>
        <button className="secondary org-admin-open" onClick={() => setShowOrgAdmin(true)}>
          🏢 組織管理
        </button>
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

              <div className="cwd-row" title={selected.cwd ?? workdir}>
                <span className="cwd-icon">📁</span>
                <span className="cwd-path">
                  {selected.cwd ?? workdir ?? "（未設定）"}
                </span>
              </div>

              <label className="field-label" htmlFor="workdir">
                作業フォルダ（次の指示で使う）
              </label>
              <div className="workdir-row">
                <input
                  id="workdir"
                  type="text"
                  value={workdir}
                  onChange={(e) => setWorkdir(e.target.value)}
                  placeholder="/path/to/project"
                  spellCheck={false}
                />
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setShowFolderPicker(true)}
                >
                  📂 選ぶ
                </button>
              </div>

              <label className="field-label" htmlFor="prompt">
                指示内容
              </label>
              <textarea
                id="prompt"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="例: READMEに開発環境のセットアップ手順を追記してください"
                rows={3}
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

              <h3 className="log-title">会話</h3>
              <div className="chat">
                {chat.length === 0 && (
                  <p className="empty-hint chat-empty">まだ会話はありません。</p>
                )}
                {chat.map((turn, i) => (
                  <ChatBubble key={i} turn={turn} />
                ))}
                <div ref={chatEndRef} />
              </div>

              <details className="raw-log-details">
                <summary>詳細ログ（生のターミナル出力）</summary>
                <pre className="log">{rawLogs || "（ログはまだありません）"}</pre>
              </details>
            </>
          )}
        </aside>
      </main>

      {showFolderPicker && (
        <FolderPickerModal
          initialPath={workdir || defaultWorkdir}
          onSelect={(path) => {
            setWorkdir(path);
            setShowFolderPicker(false);
          }}
          onClose={() => setShowFolderPicker(false)}
        />
      )}
    </div>
  );
}

function ChatBubble({ turn }: { turn: ChatTurn }) {
  if (turn.role === "action") {
    return <div className="chat-action">{turn.text}</div>;
  }
  return (
    <div className={`chat-bubble-row chat-bubble-row-${turn.role}`}>
      <div className={`chat-bubble chat-bubble-${turn.role}`}>{turn.text}</div>
    </div>
  );
}
