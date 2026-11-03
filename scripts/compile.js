"use strict";

// 公開用フォルダ _site を作る。
//   1. リポジトリの静的ファイルを _site にコピーする
//   2. TXTから資料一覧(materials-auto.js)を生成する
//   3. materials/{notes,presentations,drafts} の .txt を HTML に変換する
// 生成物はすべて _site に出力し、リポジトリ側には書き戻さない。

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

const { buildPage, compileDocument } = require("../materials/mystyle.js");

const OUTPUT = path.join(ROOT, "_site");
const EXCLUDED = new Set(["_site", "node_modules", "scripts", "README.md"]);
const DATA_LINE = /^const MATERIALS_AUTO_DATA = .*;$/m;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

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

// TXTから資料一覧のデータを作る。
function readItem({ category, file, relative }) {
  const { meta } = compileDocument(readUtf8(file));

  let title = meta.title?.text;
  if (!title) {
    title = path.basename(relative).replace(TEXT_FILE, "");
    report("warning", relative, "\\title がないため、ファイル名を表題にします。");
  }

  let date = meta.date?.text || null;
  if (date !== null && !ISO_DATE.test(date)) {
    report(
      "warning",
      relative,
      `\\date「${date}」は YYYY-MM-DD ではないため、日付なしとして扱います。`
    );
    date = null;
  }

  const url = relative
    .replace(TEXT_FILE, ".html")
    .split("/")
    .map(encodeURIComponent)
    .join("/");

  return {
    title,
    date,
    categoryKey: category.key,
    category: category.name,
    url
  };
}

// 日付の新しい順。日付なしは末尾。同日はURL順で固定する。
function compareItems(a, b) {
  if (a.date !== b.date) {
    if (a.date === null) return 1;
    if (b.date === null) return -1;
    return a.date < b.date ? 1 : -1;
  }

  return a.url < b.url ? -1 : 1;
}

// 既存の表示処理を残し、データ部分だけを今回のTXTから作り直す。
function buildMaterialsList() {
  const items = [];
  let failed = 0;

  for (const source of collectSources()) {
    try {
      items.push(readItem(source));
    } catch (error) {
      failed++;
      report("error", source.relative, error.message);
    }
  }

  if (failed) {
    throw new Error(
      `${failed}件のTXTを資料一覧に反映できませんでした。公開を中止します。`
    );
  }

  items.sort(compareItems);

  const sourceFile = path.join(ROOT, "materials-auto.js");
  const source = readUtf8(sourceFile);
  // 表示処理だけを取り出す。古いデータ行が残っていても取り除く。
  const renderer = source.replace(DATA_LINE, "");
  const output = path.join(OUTPUT, "materials-auto.js");
  const dataLine = `const MATERIALS_AUTO_DATA = ${JSON.stringify(items)};`;

  fs.writeFileSync(output, `${dataLine}\n${renderer}`, "utf8");
  console.log(`資料一覧を生成しました（${items.length}件）。`);
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
buildMaterialsList();
compileSources();
