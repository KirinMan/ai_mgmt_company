import { useEffect, useState } from "react";

interface DirEntry {
  name: string;
  path: string;
}

interface BrowseResult {
  path: string;
  parent: string | null;
  entries: DirEntry[];
}

export interface FolderPickerModalProps {
  initialPath?: string;
  onSelect: (path: string) => void;
  onClose: () => void;
}

export function FolderPickerModal({ initialPath, onSelect, onClose }: FolderPickerModalProps) {
  const [data, setData] = useState<BrowseResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load(path?: string) {
    const url = path ? `/api/browse?path=${encodeURIComponent(path)}` : "/api/browse";
    const res = await fetch(url);
    const body = await res.json();
    if (!res.ok) {
      setError(body.error ?? "読み込みに失敗しました");
      return;
    }
    setError(null);
    setData(body);
  }

  useEffect(() => {
    load(initialPath);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function pickNative() {
    if (!window.aiOffice) return;
    const picked = await window.aiOffice.pickFolder();
    if (picked) onSelect(picked);
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="folder-modal" onClick={(e) => e.stopPropagation()}>
        <div className="folder-modal-header">
          <h3>作業フォルダを選ぶ</h3>
          <button className="secondary" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="folder-modal-path" title={data?.path}>
          📁 {data?.path ?? "読み込み中…"}
        </div>

        {error && <p className="org-error">{error}</p>}

        <div className="folder-modal-list">
          {data?.parent && (
            <button className="folder-entry folder-entry-up" onClick={() => load(data.parent!)}>
              ⬆️ 上のフォルダへ
            </button>
          )}
          {data?.entries.map((entry) => (
            <button
              key={entry.path}
              className="folder-entry"
              onClick={() => load(entry.path)}
            >
              📁 {entry.name}
            </button>
          ))}
          {data && data.entries.length === 0 && (
            <p className="empty-hint folder-modal-empty">サブフォルダはありません。</p>
          )}
        </div>

        <div className="folder-modal-footer">
          {window.aiOffice && (
            <button className="secondary" onClick={pickNative}>
              🖥️ OSのダイアログを使う
            </button>
          )}
          <button onClick={() => data && onSelect(data.path)} disabled={!data}>
            このフォルダを選ぶ
          </button>
        </div>
      </div>
    </div>
  );
}
