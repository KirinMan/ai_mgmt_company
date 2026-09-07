# AI社員オフィス (ai_mgmt_company)

複数のAIコーディングエージェント（Claude Code CLI）を、部署に分かれたバーチャル会社の「社員」として指示・監視できるアプリ。

詳細な企画提案書はプロジェクトオーナーが保管しているArtifactを参照。

## Phase 1: 実行基盤 + 最小ダッシュボード

現時点の実装は企画提案書のロードマップにおける Phase 1（実行基盤を固める）にあたる。
自前でプロセス管理や git worktree 操作を実装する代わりに、Claude Code CLI 自身が持つ
バックグラウンドエージェント機能（`claude --bg` / `claude agents` / `claude logs` /
`claude stop` / `claude rm`）をラップしている。

### 仕組み

- 社員を1人指示すると、サーバーが `claude --bg -w <社員id> -n <社員名> "<指示内容>"` を実行する
- `-w` オプションにより Claude Code が自動で git worktree（`.claude/worktrees/<社員id>`）を作成し、
  そこで独立したブランチとして作業する
- サーバーは `claude agents --json` を3秒間隔でポーリングし、社員ごとの状態
  （待機中 / 作業中 / 完了など）を WebSocket でブラウザへ配信する
- ログは `claude logs <agentId>` の出力（ANSIエスケープ除去済み）をそのまま表示する

### ディレクトリ構成

```
server/            Node.js + TypeScript + Express + WebSocket
  config/employees.json   社員（エージェント）の定義
  src/claude-cli.ts       claude CLI のラッパー
  src/server.ts           REST API + WebSocket サーバー
web/               React + Vite のダッシュボード
electron/          Electron によるデスクトップアプリ化（Mac / Windows）
  src/main.ts             ウィンドウ作成、パッケージ時のサーバー起動
```

### セットアップ（デスクトップアプリとして起動）

```bash
npm install
cp .env.example .env   # 必要に応じて TARGET_REPO を編集
npm run dev            # server(:4000) / web(:5173) / Electronウィンドウ を同時起動
```

`npm run dev` で Electron のウィンドウが1枚開き、そこに web のダッシュボードが表示される
（開発時は内部で server:4000 / web:5173 を使うが、意識する必要はない）。

ブラウザだけで確認したい場合は `npm run dev:server` と `npm run dev:web` を別々に実行し、
`http://localhost:5173` を開けばよい。

#### 配布用パッケージを作る

```bash
npm run dist:mac    # macOS 用 .dmg（electron/release/ に出力）
npm run dist:win    # Windows 用インストーラ（Windows機、または相互ビルド環境が必要）
```

パッケージ済みアプリは `server/dist` と `web/dist`（`npm run build` の成果物）を
`extraResources` として同梱し、アプリ起動時に Electron が `claude` CLI 経由でホストマシンの
認証情報を使ってサーバープロセスを立ち上げる。**Docker と違い、パッケージ後もユーザーが
ローカルでログイン済みの claude CLI（Claude Pro/Max のサブスクリプション認証）をそのまま
使える** — これが Docker 化ではなく Electron 化を選んだ主な理由。

> **Dockerについて**: サーバーをコンテナ化すると claude CLI のブラウザログイン
> （Claude Pro/Max のサブスクリプション認証）が使えなくなり、`ANTHROPIC_API_KEY` による
> 従量課金のAPIキー認証が必須になる（試したところ `claude --bg` がクレジット不足で
> `Not logged in` として失敗した）。サブスクリプション契約をそのまま使いたい場合は、
> このようにホスト上で直接 `claude` CLI を動かす構成にする必要がある。
> `claude setup-token` でサブスクリプション由来の長期トークンを発行し、それを
> コンテナに渡す方法は未検証（対話的なブラウザ認証が必要なため、ローカルターミナルで
> 試す必要がある）。

### バックグラウンド実行時の権限モード

`claude --bg` はデフォルトの `manual` 権限モードのままだと、Bashコマンド実行のたびに
確認プロンプトを出そうとして、応答者がいないバックグラウンドでは永久に停止してしまう。
そのため `server/src/claude-cli.ts` では `--dangerously-skip-permissions`
（全ツールを確認なしで実行する `bypassPermissions` モード）を付けて起動している。
git worktree でブランチは分離されるが、Bashコマンド自体はworktree外にもアクセスしうる
ため、**AI社員は「確認なしで何でも実行できる」前提であることを理解した上で使うこと**。

このフラグは初回、対話的なターミナルで一度だけ免責事項に同意しないと機能しない。

```bash
claude --dangerously-skip-permissions
# 赤い警告が出た後、下矢印で「Yes, I accept」を選んで Enter → /exit で終了
```

### Claude Desktop 連携（MCP）

`server/src/mcp-server.ts` が MCP（Model Context Protocol）サーバーになっており、
Claude Desktop のチャットから「開発部のアキラに〇〇を指示して」のように話しかけて
AI社員へタスクを振れる。公開しているツールは次の5つ。

| ツール | 内容 |
|---|---|
| `list_employees` | 社員一覧と現在の状態を取得 |
| `find_employee_by_name` | 名前・役職・部署の一部から社員IDを検索 |
| `assign_task` | 指定した社員に指示を出す |
| `get_employee_logs` | 指定した社員の直近ログを取得 |
| `stop_employee` | 実行中のタスクを停止 |

Claude Desktop の設定ファイル（macOSは
`~/Library/Application Support/Claude/claude_desktop_config.json`）の
`mcpServers` にこのプロジェクト用に以下を登録済み（設定変更後は Claude Desktop の再起動が必要）。

```json
{
  "mcpServers": {
    "ai-office": {
      "command": "npx",
      "args": ["tsx", "/Users/kiri/Develop/ai_mgmt_company/server/src/mcp-server.ts"]
    }
  }
}
```

動作確認には `npx @modelcontextprotocol/inspector --cli npx tsx src/mcp-server.ts --method tools/list`
のように MCP Inspector の CLI モードが使える（`server/` ディレクトリで実行）。

### 社員（エージェント）の追加・編集

`server/config/employees.json` を編集する。

```json
{
  "id": "eng-01",
  "name": "アキラ",
  "role": "Engineer",
  "department": "開発部",
  "apiKeyEnv": "ANTHROPIC_API_KEY"
}
```

- `apiKeyEnv` は、この社員のタスク実行時に読む環境変数名。全員 `ANTHROPIC_API_KEY` を指せば
  共通キーを使う（未設定なら claude CLI の既存ログイン/サブスクリプション認証を利用）。
  社員ごとに `ANTHROPIC_API_KEY_ENG01` のような専用の変数名を割り当てれば、
  その社員だけ別の Anthropic アカウント/キーで動かせる（BYOK）。

### 既知の制約（Phase 2以降で解消予定）

- 対応CLIは Claude Code のみ（Codex CLI 等は未対応）
- UIは部署別のリスト表示のみで、企画提案書にあるゲーム風フロアマップは未実装
- ログは生のANSI端末出力からエスケープコードを除去しただけのプレーンテキスト
- 部署長（supervisor）によるタスク委任・エスカレーションは未実装
- Electronでの動作確認は macOS のみ（Windows向け `.exe` ビルドは未検証）
- AI社員は `--dangerously-skip-permissions` で動くため、確認なしで任意のコマンドを実行できる
