import { readdirSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";

export interface DirEntry {
  name: string;
  path: string;
}

export interface BrowseResult {
  path: string;
  parent: string | null;
  entries: DirEntry[];
}

/**
 * サーバープロセスから見えるファイルシステムのサブフォルダ一覧を返す。
 * ブラウザ・Electron のどちらから開いても同じ体験でフォルダ選択できるようにするための
 * 簡易ディレクトリブラウザ。ローカル専用アプリという前提（同一PC上の本人が操作する）で、
 * 既にこのアプリ自体が任意フォルダで任意コマンドを実行できる以上、追加のリスクはない。
 */
export function browseDirectory(targetPath?: string): BrowseResult {
  const target = targetPath ? path.resolve(targetPath) : os.homedir();

  const stat = statSync(target);
  if (!stat.isDirectory()) {
    throw new Error(`not a directory: ${target}`);
  }

  const entries: DirEntry[] = [];
  for (const dirent of readdirSync(target, { withFileTypes: true })) {
    if (!dirent.isDirectory() || dirent.name.startsWith(".")) continue;
    entries.push({ name: dirent.name, path: path.join(target, dirent.name) });
  }
  entries.sort((a, b) => a.name.localeCompare(b.name, "ja"));

  const parentDir = path.dirname(target);
  const parent = parentDir !== target ? parentDir : null;

  return { path: target, parent, entries };
}
