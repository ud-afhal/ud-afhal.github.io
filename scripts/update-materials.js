"use strict";

// 資料一覧のソース materials-auto.js の MATERIALS_AUTO_DATA を、
// materials/{notes,presentations,drafts} の .txt から作り直す。
// \title が title、\date(YYYY-MM-DD)が date になる。
// ファイルのそれ以外の部分は書き換えない。

const fs = require("node:fs");
const path = require("node:path");

const { ROOT, TEXT_FILE, readUtf8, collectSources, report } =
  require("./common.js");

const { compileDocument } = require("../materials/mystyle.js");

const TARGET = path.join(ROOT, "materials-auto.js");
const DATA_LINE = /^const MATERIALS_AUTO_DATA = .*;$/m;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function readItem({ category, file, relative }) {
  const { meta } = compileDocument(readUtf8(file));

  let title = meta.title?.text;

  if (!title) {
    title = path.basename(relative).replace(TEXT_FILE, "");
    report("warning", relative, "\\title がないため、ファイル名を表題にします。");
  }

  let date = meta.date?.text || null;

  if (date !== null && !ISO_DATE.test(date)) {
    report("warning", relative, `\\date「${date}」は YYYY-MM-DD ではないため、日付なしとして扱います。`);
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

// 日付の新しい順。日付なしは末尾。同日は url 順で固定する。
function compareItems(a, b) {
  if (a.date !== b.date) {
    if (a.date === null) return 1;
    if (b.date === null) return -1;
    return a.date < b.date ? 1 : -1;
  }

  return a.url < b.url ? -1 : 1;
}

function main() {
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

  // 読めない txt がある間は、一覧を書き換えない。
  if (failed) {
    process.exitCode = 1;
    return;
  }

  items.sort(compareItems);

  const line = `const MATERIALS_AUTO_DATA = ${JSON.stringify(items)};`;
  const current = fs.readFileSync(TARGET, "utf8");

  if (!DATA_LINE.test(current)) {
    throw new Error("materials-auto.js に MATERIALS_AUTO_DATA の行が見つかりません。");
  }

  const next = current.replace(DATA_LINE, () => line);

  if (next === current) {
    console.log(`materials-auto.js は最新です(${items.length} 件)。`);
    return;
  }

  fs.writeFileSync(TARGET, next, "utf8");
  console.log(`materials-auto.js を更新しました(${items.length} 件)。`);
}

try {
  main();
} catch (error) {
  report("error", "materials-auto.js", error.message);
  process.exitCode = 1;
}
