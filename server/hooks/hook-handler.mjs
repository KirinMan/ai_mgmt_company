#!/usr/bin/env node
// Claude Code の hooks から呼ばれる軽量スクリプト。
// worktree 内には node_modules が存在しない（git 管理外）ため、
// 外部パッケージに依存せず Node.js 標準モジュールのみで書いている。
//
// stdin で受け取った hook イベントの JSON をそのまま
// AI社員オフィスのサーバー（/api/hooks）へ転送する。
// サーバーが起動していない・タイムアウトしても、hook 自体は失敗させない
// （Claude Code 本体の動作を絶対にブロックしないため）。

import http from "node:http";

const hookEventName = process.argv[2] || "Unknown";
const port = Number(process.env.AI_OFFICE_PORT || 4000);

let input = "";
process.stdin.on("data", (chunk) => {
  input += chunk;
});

process.stdin.on("end", () => {
  send(input);
});

// stdin が来ないケースのフェイルセーフ
setTimeout(() => send(input), 1000).unref();

let sent = false;
function send(raw) {
  if (sent) return;
  sent = true;

  let payload = {};
  try {
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    // JSON でなければ空のまま送る
  }

  const body = JSON.stringify({ hookEventName, ...payload });
  const req = http.request(
    {
      hostname: "127.0.0.1",
      port,
      path: "/api/hooks",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
      },
      timeout: 1500,
    },
    (res) => {
      res.resume();
      res.on("end", () => process.exit(0));
    },
  );
  req.on("error", () => process.exit(0));
  req.on("timeout", () => {
    req.destroy();
    process.exit(0);
  });
  req.write(body);
  req.end();

  // 万一 response が返らなくても長居しない
  setTimeout(() => process.exit(0), 2000).unref();
}
