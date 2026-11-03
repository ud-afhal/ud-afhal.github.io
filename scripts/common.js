"use strict";

// compile.js と update-materials.js が共有する定義と補助関数。

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");

// 変換・一覧化の対象は、この3つのフォルダの .txt だけ。
const CATEGORIES = [
  { key: "notes", name: "勉強ノート" },
  { key: "presentations", name: "発表ノート" },
  { key: "drafts", name: "執筆中（正確性を保証しません）" }
];

const TEXT_FILE = /\.txt$/i;

function readUtf8(file) {
  try {
    return new TextDecoder("utf-8", { fatal: true })
      .decode(fs.readFileSync(file));
  } catch (error) {
    throw error instanceof TypeError
      ? new Error("UTF-8のテキストとして読み込めませんでした。")
      : error;
  }
}

// 対象フォルダ以下の .txt を、パス順に返す。
function collectSources() {
  const found = [];

  function walk(directory, category) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);

      if (entry.isDirectory()) {
        walk(full, category);
      } else if (entry.isFile() && TEXT_FILE.test(entry.name)) {
        found.push({
          category,
          file: full,
          relative: path.relative(ROOT, full).split(path.sep).join("/")
        });
      }
    }
  }

  for (const category of CATEGORIES) {
    const directory = path.join(ROOT, "materials", category.key);

    if (fs.existsSync(directory)) {
      walk(directory, category);
    }
  }

  return found.sort((a, b) => (a.relative < b.relative ? -1 : 1));
}

// GitHub Actions 上では注釈として、それ以外では通常の行として出力する。
function report(level, file, message) {
  if (process.env.GITHUB_ACTIONS) {
    const escaped = message
      .replace(/%/g, "%25")
      .replace(/\r/g, "%0D")
      .replace(/\n/g, "%0A");

    console.log(`::${level} file=${file}::${escaped}`);
  } else {
    console.log(`${level}: ${file}: ${message}`);
  }
}

module.exports = {
  ROOT,
  CATEGORIES,
  TEXT_FILE,
  readUtf8,
  collectSources,
  report
};
