#!/usr/bin/env node
"use strict";

/*
 * materials/ 以下の .txt 原稿から資料一覧 materials-auto.js を生成する。
 *
 * 対象:
 *   materials/notes/
 *   materials/presentations/
 *   materials/drafts/
 *
 * 各 .txt と同じディレクトリ・同じ basename の .html が存在する場合に登録する。
 * .txt 内の \title{...} をタイトル、\date{YYYY-MM-DD} を日付として読む。
 * \date は省略可能。日付がない資料は一覧の末尾に配置する。
 *
 * 実行:
 *   node generate-materials.js
 */

const fs = require("node:fs");
const path = require("node:path");

const ROOT = __dirname;
const MATERIALS_DIR = path.join(ROOT, "materials");
const OUTPUT_JS = path.join(ROOT, "materials-auto.js");

const CATEGORIES = {
  notes: "勉強ノート",
  presentations: "発表ノート",
  drafts: "執筆中（正確性を保証しません）",
};

const CATEGORY_ORDER = Object.keys(CATEGORIES);

/**
 * LaTeX風ソースから、コメントを考慮しつつ \command{...} の内容を読む。
 * 波括弧のネストと \{, \} を考慮する。
 * 同じコマンドが複数ある場合は最初のものを返す。
 */
function readCommandArgument(source, commandName) {
  let openBrace = -1;
  let inComment = false;

  // コメント内の \title や \date を誤認しないようにコマンド位置を探す。
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];

    if (inComment) {
      if (ch === "\n" || ch === "\r") inComment = false;
      continue;
    }

    if (ch === "%") {
      let slashCount = 0;
      for (let j = i - 1; j >= 0 && source[j] === "\\"; j--) slashCount++;
      if (slashCount % 2 === 0) {
        inComment = true;
        continue;
      }
    }

    if (ch !== "\\") continue;

    const commandStart = i + 1;
    const commandEnd = commandStart + commandName.length;
    if (source.slice(commandStart, commandEnd) !== commandName) continue;

    const following = source[commandEnd];
    if (following && /[A-Za-z@]/.test(following)) continue;

    let j = commandEnd;
    while (j < source.length && /\s/.test(source[j])) j++;
    if (source[j] === "{") {
      openBrace = j;
      break;
    }
  }

  if (openBrace < 0) return null;

  let depth = 1;
  let value = "";
  inComment = false;

  for (let i = openBrace + 1; i < source.length; i++) {
    const ch = source[i];

    if (inComment) {
      if (ch === "\n" || ch === "\r") {
        inComment = false;
        value += ch;
      }
      continue;
    }

    if (ch === "%") {
      let slashCount = 0;
      for (let j = i - 1; j >= 0 && source[j] === "\\"; j--) slashCount++;
      if (slashCount % 2 === 0) {
        inComment = true;
        continue;
      }
    }

    if (ch === "\\") {
      const next = source[i + 1];
      if (next === "{" || next === "}") {
        value += ch + next;
        i++;
        continue;
      }
    }

    if (ch === "{") {
      depth++;
      value += ch;
    } else if (ch === "}") {
      depth--;
      if (depth === 0) return value.trim();
      value += ch;
    } else {
      value += ch;
    }
  }

  console.warn(`[警告] \\${commandName}{...} の閉じ波括弧がありません。`);
  return null;
}

/** 日付を YYYY-MM-DD に正規化する。不正・未記載の場合は null。 */
function normalizeDate(rawDate, relativePath) {
  if (rawDate === null || rawDate.trim() === "") {
    return null;
  }

  const normalized = rawDate.trim().replace(/[‐‑‒–—−]/g, "-");
  const match = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);

  if (!match) {
    console.warn(`[警告] 日付の形式が不正です（YYYY-MM-DD を指定してください）: ${relativePath}`);
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const candidate = new Date(Date.UTC(year, month - 1, day));

  if (
    candidate.getUTCFullYear() !== year ||
    candidate.getUTCMonth() !== month - 1 ||
    candidate.getUTCDate() !== day
  ) {
    console.warn(`[警告] 存在しない日付です: ${relativePath}`);
    return null;
  }

  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** URLの各パス要素を個別にエンコードする。 */
function encodeRelativeUrl(relativePath) {
  return relativePath
    .split("/")
    .map((part) =>
      encodeURIComponent(part).replace(/[!'()*]/g, (char) =>
        `%${char.charCodeAt(0).toString(16).toUpperCase()}`
      )
    )
    .join("/");
}

function walkFiles(directory) {
  if (!fs.existsSync(directory) || !fs.statSync(directory).isDirectory()) {
    console.info(`[情報] フォルダがないためスキップ: ${path.relative(ROOT, directory).split(path.sep).join("/")}/`);
    return [];
  }

  const found = [];

  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      found.push(...walkFiles(fullPath));
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".txt")) {
      found.push(fullPath);
    }
  }

  return found;
}

function readMaterial(txtPath, categoryKey) {
  const relativeTxtPath = path.relative(ROOT, txtPath).split(path.sep).join("/");
  let source;

  try {
    source = fs.readFileSync(txtPath, "utf8");
  } catch (error) {
    console.warn(`[警告] 読み込めません: ${relativeTxtPath} (${error.message})`);
    return null;
  }

  const title = readCommandArgument(source, "title");

  if (!title) {
    console.warn(`[警告] \\title{...} がないため除外: ${relativeTxtPath}`);
    return null;
  }

  const rawDate = readCommandArgument(source, "date");
  const updated = normalizeDate(rawDate, relativeTxtPath);

  if (!updated) {
    console.info(`[情報] 日付未記載または不正（日付なしとして登録）: ${relativeTxtPath}`);
  }

  // .txt と同じディレクトリ・同じ basename の .html を公開先とする。
  const htmlPath = txtPath.slice(0, -path.extname(txtPath).length) + ".html";

  if (!fs.existsSync(htmlPath) || !fs.statSync(htmlPath).isFile()) {
    console.warn(`[警告] 対応するHTMLがないため除外: ${relativeTxtPath}`);
    return null;
  }

  const relativeHtmlPath = path.relative(ROOT, htmlPath).split(path.sep).join("/");

  return {
    title,
    date: updated,
    categoryKey,
    category: CATEGORIES[categoryKey],
    url: encodeRelativeUrl(relativeHtmlPath),
  };
}

function collectMaterials() {
  if (!fs.existsSync(MATERIALS_DIR) || !fs.statSync(MATERIALS_DIR).isDirectory()) {
    throw new Error(`materials フォルダが見つかりません: ${MATERIALS_DIR}`);
  }

  const materials = [];

  for (const categoryKey of CATEGORY_ORDER) {
    const categoryDir = path.join(MATERIALS_DIR, categoryKey);

    for (const txtPath of walkFiles(categoryDir).sort()) {
      const material = readMaterial(txtPath, categoryKey);
      if (material) materials.push(material);
    }
  }

  // 日付の新しい順。日付が同じ場合・日付がない場合はタイトル順。
  materials.sort((a, b) => a.title.toLocaleLowerCase().localeCompare(
    b.title.toLocaleLowerCase()
  ));
  materials.sort((a, b) => (b.date || "").localeCompare(a.date || ""));

  return materials;
}

function makeOutput(materials) {
  const data = JSON.stringify(materials);

  return `/*
 * 資料一覧の表示処理。
 *
 * このファイルは generate-materials.js が生成します。直接編集しないでください。
 * データは materials/notes、materials/presentations、materials/drafts 内の
 * .txt 原稿から取得し、対応する .html へのリンクを生成します。
 */

const MATERIALS_AUTO_DATA = ${data};

(() => {
  "use strict";

  const categoryOrder = ["notes", "presentations", "drafts"];
  const categoryNames = {
    notes: "勉強ノート",
    presentations: "発表ノート",
    drafts: "執筆中（正確性を保証しません）"
  };

  function makeLink(item) {
    const link = document.createElement("a");
    link.href = item.url;
    link.textContent = item.title;
    return link;
  }

  function makeListItem(item, withDate) {
    const li = document.createElement("li");

    if (withDate && item.date) {
      const date = document.createElement("time");
      date.dateTime = item.date;
      date.textContent = item.date;
      li.appendChild(date);
      li.appendChild(document.createTextNode(" "));
    }

    li.appendChild(makeLink(item));
    return li;
  }

  // トップページ: draftsを除き、更新日の新しい資料を最大5件表示。
  function renderRecentUpdates() {
    const target = document.getElementById("auto-recent-updates");
    if (!target) return;

    target.replaceChildren();

    const items = MATERIALS_AUTO_DATA
      .filter(item => item.categoryKey !== "drafts" && item.date);

    items.slice(0, 5).forEach(item => {
      target.appendChild(makeListItem(item, true));
    });

    if (items.length === 0) {
      const li = document.createElement("li");
      li.textContent = "資料はまだ登録されていません。";
      target.appendChild(li);
    }
  }

  // トップページ: 各カテゴリから新しい資料を最大3件表示。
  function renderHomeMaterials() {
    const target = document.getElementById("auto-home-materials");
    if (!target) return;

    target.replaceChildren();

    categoryOrder.forEach(key => {
      const items = MATERIALS_AUTO_DATA.filter(item => item.categoryKey === key);
      if (items.length === 0) return;

      const section = document.createElement("section");
      const heading = document.createElement("h3");
      const categoryLink = document.createElement("a");

      categoryLink.href = "materials.html#" + key;
      categoryLink.textContent = categoryNames[key];
      heading.appendChild(categoryLink);
      section.appendChild(heading);

      const list = document.createElement("ul");
      items.slice(0, 3).forEach(item => list.appendChild(makeListItem(item, false)));
      section.appendChild(list);
      target.appendChild(section);
    });
  }

  // 資料一覧ページ: 3カテゴリを見出しごとに表示。
  function renderMaterialsList() {
    const target = document.getElementById("auto-materials-list");
    if (!target) return;

    target.replaceChildren();

    categoryOrder.forEach(key => {
      const items = MATERIALS_AUTO_DATA
        .filter(item => item.categoryKey === key)
        .sort((a, b) => a.title.localeCompare(b.title, "ja"));

      if (items.length === 0) return;

      const section = document.createElement("section");
      section.id = key;

      const heading = document.createElement("h2");
      heading.textContent = categoryNames[key];
      section.appendChild(heading);

      const list = document.createElement("ul");
      items.forEach(item => list.appendChild(makeListItem(item, false)));
      section.appendChild(list);
      target.appendChild(section);
    });

    if (MATERIALS_AUTO_DATA.length === 0) {
      const p = document.createElement("p");
      p.textContent = "資料はまだ登録されていません。";
      target.appendChild(p);
    }
  }

  function initialize() {
    renderRecentUpdates();
    renderHomeMaterials();
    renderMaterialsList();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize, { once: true });
  } else {
    initialize();
  }
})();
`;
}

function main() {
  const materials = collectMaterials();
  fs.writeFileSync(OUTPUT_JS, makeOutput(materials), "utf8");

  console.log(`資料 ${materials.length} 件を読み取りました。`);
  console.log(`生成先: ${OUTPUT_JS}`);
  console.log("対象フォルダ: materials/notes/, materials/presentations/, materials/drafts/");
}

try {
  main();
} catch (error) {
  console.error(`[エラー] ${error.message}`);
  process.exitCode = 1;
}
