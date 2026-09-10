# AI社員オフィス (ai_mgmt_company)

複数のAIコーディングエージェント（Claude Code CLI）を、部署に分かれたバーチャル会社の
「社員」として指示・監視できるアプリ。PC上のどんなフォルダでも作業させられる。

詳細な企画提案書はプロジェクトオーナーが保管しているArtifactを参照。

## できること

- 部署ごとにエリア分けされたオフィスフロアで、AI社員（動物キャラクター）が歩き回り、
  ステータスに応じて色が変わる（待機中/作業中/要対応/完了/エラー）
- 社員を選んでチャット風に指示を送り、AIの返答・実行したツールを会話として確認できる
- 指示ごとに作業フォルダを選べる（アプリ内蔵のフォルダブラウザ、またはElectronのネイティブ
  ダイアログ）。Gitリポジトリなら worktree でブランチを分離し、それ以外は直接そのフォルダで作業
- 「組織管理」画面から、社長のように部署の追加/改名/削除、社員の採用/編集/解雇ができる
- Claude Desktop から MCP 経由で「開発部のアキラに〇〇を指示して」のように話しかけられる

## ディレクトリ構成

```
server/            Node.js + TypeScript + Express + WebSocket
  config/employees.example.json   社員・部署のサンプルデータ（コミット対象）
  data/employees.json             実際の社員・部署データ（gitignore対象、初回起動時に上記からコピー）
  src/claude-cli.ts               claude CLI のラッパー（hooks注入、worktree判定など）
  src/employee-service.ts         社員・部署の操作、タスク割り当てのドメインロジック
  src/transcript.ts               会話ログ(JSONL)をチャット表示用にパース
  src/browse.ts                   フォルダ選択モーダル用のディレクトリ一覧API
  src/mcp-server.ts               Claude Desktop 連携用の MCP サーバー
  src/server.ts                   REST API + WebSocket サーバー
  hooks/hook-handler.mjs          claude hooks から状態変化を受け取る軽量スクリプト
web/               React + Vite + PixiJS のダッシュボード
electron/          Electron によるデスクトップアプリ化（Mac / Windows）
```

## セットアップ（デスクトップアプリとして起動）

```bash
npm install
cp .env.example .env   # 必要に応じて TARGET_REPO を編集
npm run dev            # server(:4000) / web(:5173) / Electronウィンドウ を同時起動
```

`npm run dev` で Electron のウィンドウが1枚開き、そこに web のダッシュボードが表示される
（開発時は内部で server:4000 / web:5173 を使うが、意識する必要はない）。

ブラウザだけで確認したい場合は `npm run dev:server` と `npm run dev:web` を別々に実行し、
`http://localhost:5173` を開けばよい。フォルダ選択モーダルも含め、主要機能はブラウザ単体でも
動作する（Electronのネイティブフォルダダイアログだけは使えない）。

### 配布用パッケージを作る

```bash
npm run dist:mac    # macOS 用 .dmg（electron/release/ に出力）
npm run dist:win    # Windows 用インストーラ（Windows機、または相互ビルド環境が必要）
```

パッケージ済みアプリは `server/dist` と `web/dist`（`npm run build` の成果物）を
`extraResources` として同梱し、アプリ起動時に Electron が `claude` CLI 経由でホストマシンの
認証情報を使ってサーバープロセスを立ち上げる。**Docker と違い、パッケージ後もユーザーが
ローカルでログイン済みの claude CLI（Claude Pro/Max のサブスクリプション認証）をそのまま
使える** — これが Docker 化ではなく Electron 化を選んだ主な理由（詳細は後述）。

## 仕組み

### 実行基盤：Claude Code CLI をそのままラップする

自前でプロセス管理や git worktree 操作を実装する代わりに、Claude Code CLI 自身が持つ
バックグラウンドエージェント機能（`claude --bg` / `claude agents` / `claude logs` /
`claude stop` / `claude rm`）をラップしている。

- 社員に指示を出すと、サーバーが `claude --bg --dangerously-skip-permissions --settings <hooks設定のJSON> "<指示内容>"` を実行する
- 作業フォルダがGitリポジトリなら `-w <社員id>` で git worktree を作り、独立したブランチで作業させる。
  Gitリポジトリでなければ `-w` を付けず、そのフォルダで直接作業させる
- サーバーは `claude agents --json` を3秒間隔でポーリングし、社員ごとの状態
  （待機中 / 作業中 / 完了など）を WebSocket でブラウザへ配信する

### 作業フォルダはPC上のどこでも選べる

指示を送る際に「作業フォルダ」を選べる（アプリ内蔵のフォルダブラウザ、Electronならネイティブ
ダイアログも使える）。選んだフォルダが対象になるので、開発部はプロジェクトA、企画部は
別のドキュメントフォルダ、というような使い方ができる。フォルダを指定しない場合は
`.env` の `TARGET_REPO`（省略時はこのプロジェクト自身）が使われる。

### hooksでリアルタイムに状態を反映する

`claude --bg` 実行時に `--settings` オプションで hooks 設定を直接注入している。これにより
**対象フォルダに何も用意しなくても**、PC上のどのフォルダで作業させても
PreToolUse/PostToolUse/Notification/Stop 等のイベントが `server/hooks/hook-handler.mjs`
経由でサーバーに届き、「今何をしているか」（考え中/編集中/コマンド実行中など）や
会話ログの実ファイルパス（`transcript_path`）をリアルタイムに把握できる。

### 会話はチャット形式で表示される

hooks から受け取った `transcript_path`（Claude Code が書き出す会話ログのJSONLファイル）を
パースし、ユーザーの指示・ツール実行・AIの返答テキストだけを抜き出してチャット吹き出しとして
表示する。生のターミナル出力は「詳細ログ」として折りたたみで確認できる。

### バックグラウンド実行時の権限モード

`claude --bg` はデフォルトの `manual` 権限モードのままだと、Bashコマンド実行のたびに
確認プロンプトを出そうとして、応答者がいないバックグラウンドでは永久に停止してしまう。
そのため `--dangerously-skip-permissions`（全ツールを確認なしで実行する `bypassPermissions`
モード）を付けて起動している。git worktree があればブランチは分離されるが、Bashコマンド
自体はworktree外にもアクセスしうるため、**AI社員は「確認なしで何でも実行できる」前提で
あることを理解した上で使うこと**。

このフラグは初回、対話的なターミナルで一度だけ免責事項に同意しないと機能しない。

```bash
claude --dangerously-skip-permissions
# 赤い警告が出た後、下矢印で「Yes, I accept」を選んで Enter → /exit で終了
```

### Dockerではなく Electron を選んだ理由

サーバーをコンテナ化すると claude CLI のブラウザログイン（Claude Pro/Max のサブスクリプション
認証）が使えなくなり、`ANTHROPIC_API_KEY` による従量課金のAPIキー認証が必須になる
（試したところ `claude --bg` がクレジット不足で `Not logged in` として失敗した）。
サブスクリプション契約をそのまま使いたい場合は、ホスト上で直接 `claude` CLI を動かす構成に
する必要があり、それを実現するのが Electron 版である。

## Claude Desktop 連携（MCP）

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
`~/Library/Application Support/Claude/claude_desktop_config.json`）の `mcpServers` に
以下のように登録する（`args` のパスは自分の環境に合わせる。設定変更後は Claude Desktop の
再起動が必要）。

```json
{
  "mcpServers": {
    "ai-office": {
      "command": "npx",
      "args": ["tsx", "/path/to/ai_mgmt_company/server/src/mcp-server.ts"]
    }
  }
}
```

動作確認には `npx @modelcontextprotocol/inspector --cli npx tsx src/mcp-server.ts --method tools/list`
のように MCP Inspector の CLI モードが使える（`server/` ディレクトリで実行）。

## 組織管理：部署・社員を編集する

ダッシュボード右上の「🏢 組織管理」ボタンから、部署の追加/改名/削除、社員の採用/編集/解雇が
GUIで行える（部署名を変えると、所属する社員のdepartmentにも自動的に反映される。社員が
残っている部署は削除できない）。

社員の「BYOK用の環境変数名」（デフォルト `ANTHROPIC_API_KEY`）を個別に設定すれば、
社員ごとに別の Anthropic アカウント/APIキーで動かせる。未設定なら claude CLI の
既存ログイン（サブスクリプション認証）を使う。

データの実体は `server/data/employees.json`（gitignore対象）で、初回起動時に
`server/config/employees.example.json`（コミット対象のサンプル）からコピーされる。
JSONファイルを直接編集してもよい。

## 既知の制約

- 対応CLIは Claude Code のみ（Codex CLI 等は未対応）
- 部署長（supervisor）によるタスク委任・エスカレーションは未実装
- Electronでの動作確認は macOS のみ（Windows向け `.exe` ビルドは未検証）
- AI社員は `--dangerously-skip-permissions` で動くため、確認なしで任意のコマンドを実行できる
- `/api/browse`（フォルダ選択）はサーバープロセスが読めるファイルシステム全体を列挙できる。
  ローカル専用アプリ（同一PC上の本人が操作する前提）であることを踏まえた設計
