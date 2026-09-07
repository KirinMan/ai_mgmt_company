import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// server のホスト/ポートを変えたい場合に上書きできるようにしておく。
const apiTarget = process.env.API_PROXY_TARGET ?? "http://localhost:4000";
const wsTarget = process.env.WS_PROXY_TARGET ?? "ws://localhost:4000";

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    proxy: {
      "/api": apiTarget,
      "/ws": { target: wsTarget, ws: true },
    },
  },
});
