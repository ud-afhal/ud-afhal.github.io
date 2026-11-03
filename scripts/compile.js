"use strict";

// 公開用フォルダ _site を作る。
//   1. リポジトリの静的ファイルを _site にコピーする
//   2. materials/{notes,presentations,drafts} の .txt を HTML に変換し、
//      _site の同じ位置・同じ名前の .html として書き出す
// 変換結果はリポジトリ側には書き出さない。

const fs = require("node:fs");
const path = require("node:path");

const {
  ROOT,
  CATEGORIES,
  TEXT_FILE,
  readUtf8,
  collectSources,
  report
} = require("./common.js");

const { buildPage } = require("../materials/mystyle.js");

const OUTPUT = path.join(ROOT, "_site");

// _site にコピーしないトップレベルの名前(ドット始まりも除く)。
const EXCLUDED = new Set(["_site", "node_modules", "scripts", "README.md"]);

function copyStaticFiles() {
  const sourceDirectories = CATEGORIES.map((category) => {
    return path.join(ROOT, "materials", category.key) + path.sep;
  });

  // 変換元の .txt は公開しない。
  const isSource = (file) => {
    return TEXT_FILE.test(file) &&
      sourceDirectories.some((directory) => file.startsWith(directory));
  };

  fs.rmSync(OUTPUT, { recursive: true, force: true });
  fs.mkdirSync(OUTPUT);

  for (const name of fs.readdirSync(ROOT)) {
    if (name.startsWith(".") || EXCLUDED.has(name)) {
      continue;
    }

    fs.cpSync(path.join(ROOT, name), path.join(OUTPUT, name), {
      recursive: true,
      filter: (source) => !isSource(source)
    });
  }
}

function compileSources() {
  const sources = collectSources();
  let failed = 0;

  for (const { file, relative } of sources) {
    try {
      const { html, issues } = buildPage(readUtf8(file));
      const output = path.join(
        OUTPUT,
        relative.replace(TEXT_FILE, ".html")
      );

      fs.mkdirSync(path.dirname(output), { recursive: true });
      fs.writeFileSync(output, html, "utf8");

      console.log(`${relative} -> ${path.relative(ROOT, output)}`);

      for (const issue of issues) {
        report("warning", relative, issue);
      }
    } catch (error) {
      failed++;
      report("error", relative, error.message);
    }
  }

  console.log(`${sources.length - failed}/${sources.length} 件を変換しました。`);

  // 1件でも失敗したら、壊れたサイトを公開しないよう異常終了する。
  process.exitCode = failed ? 1 : 0;
}

copyStaticFiles();
compileSources();
