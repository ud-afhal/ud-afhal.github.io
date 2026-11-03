"use strict";

const fs = require("node:fs");
const path = require("node:path");

const ROOT = __dirname;
const MATERIALS_DIR = path.join(ROOT, "materials");
const SITE_DIR = path.join(ROOT, ".site");
const OUTPUT_JS = path.join(SITE_DIR, "materials-auto.js");

const CATEGORIES = {
  notes: "勉強ノート",
  presentations: "発表ノート",
  drafts: "執筆中（正確性を保証しません）",
};

// LaTeX風ソースから \command{...} の引数を取得する。
// コメント、波括弧のネスト、エスケープされた波括弧に対応。
function readCommandArgument(source, commandName) {
  let i = 0;

  while (i < source.length) {
    if (source[i] === "%") {
      let slashes = 0;
      for (let j = i - 1; j >= 0 && source[j] === "\\"; j--) {
        slashes++;
      }
      if (slashes % 2 === 0) {
        while (i < source.length && !"\r\n".includes(source[i])) i++;
        continue;
      }
    }

    if (source[i] !== "\\") {
      i++;
      continue;
    }

    i++;
    const start = i;

    while (i < source.length && /[A-Za-z@]/.test(source[i])) i++;

    const name = source.slice(start, i);

    if (name !== commandName) continue;
    if (i < source.length && /[A-Za-z@]/.test(source[i])) continue;

    while (i < source.length && /\s/.test(source[i])) i++;
    if (source[i] !== "{") continue;

    i++;
    let depth = 1;
    let value = "";

    while (i < source.length) {
      const ch = source[i];

      if (ch === "\\") {
        const next = source[i + 1];

        if (next === "{" || next === "}") {
          value += ch + next;
          i += 2;
          continue;
        }

        value += ch;
        i++;

        if (i < source.length) {
          value += source[i];
          i++;
        }

        continue;
      }

      if (ch === "%") {
        let slashes = 0;
        for (let j = i - 1; j >= 0 && source[j] === "\\"; j--) {
          slashes++;
        }
        if (slashes % 2 === 0) {
          while (i < source.length && !"\r\n".includes(source[i])) i++;
          continue;
        }
      }

      if (ch === "{") {
        depth++;
        value += ch;
        i++;
        continue;
      }

      if (ch === "}") {
        depth--;
        i++;

        if (depth === 0) return value.trim();

        value += ch;
        continue;
      }

      value += ch;
      i++;
    }

    console.warn(`警告: \\${commandName} の閉じ波括弧がありません`);
    return null;
  }

  return null;
}

// YYYY-MM-DD形式の日付を検証する。
function normalizeDate(rawDate, relativePath) {
  if (rawDate === null || rawDate.trim() === "") return null;

  const match = rawDate.trim()
    .replace(/[‐‑‒–—−]/g, "-")
    .match(/(?<!\d)(\d{4})-(\d{1,2})-(\d{1,2})(?!\d)/);

  if (!match) {
    console.warn(`警告: 日付形式が不正です: ${relativePath}`);
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    console.warn(`警告: 存在しない日付です: ${relativePath}`);
    return null;
  }

  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// URLの各パス要素をエンコードする。
function encodeRelativeUrl(relativePath) {
  return relativePath
    .split("/")
    .map(part => encodeURIComponent(part))
    .join("/");
}

// ディレクトリを再帰的に探索する。
function walkTextFiles(directory) {
  if (!fs.existsSync(directory)) return [];

  const files = [];

  for (const entry of fs.readdirSync(directory, {
    withFileTypes: true
  })) {
    const fullPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...walkTextFiles(fullPath));
    } else if (
      entry.isFile() &&
      entry.name.toLowerCase().endsWith(".txt")
    ) {
      files.push(fullPath);
    }
  }

  return files;
}

// 個別のTXTファイルからメタデータを取得する。
function readMaterial(txtPath, categoryKey) {
  const relativePath = path.relative(ROOT, txtPath)
    .split(path.sep).join("/");

  const source = fs.readFileSync(txtPath, "utf8");

  const title = readCommandArgument(source, "title");

  if (!title) {
    console.warn(`警告: タイトルがないため除外: ${relativePath}`);
    return null;
  }

  const rawDate = readCommandArgument(source, "date");
  const date = normalizeDate(rawDate, relativePath);

  // TXTと同じ場所・同じ名前のHTMLをリンク先とする。
  const htmlPath = relativePath.replace(/\.txt$/i, ".html");

  return {
    title,
    date,
    categoryKey,
    category: CATEGORIES[categoryKey],
    url: encodeRelativeUrl(htmlPath)
  };
}

// すべての資料を収集する。
function collectMaterials() {
  if (!fs.existsSync(MATERIALS_DIR)) {
    throw new Error("materials フォルダが見つかりません");
  }

  const materials = [];

  for (const categoryKey of Object.keys(CATEGORIES)) {
    const directory = path.join(MATERIALS_DIR, categoryKey);

    for (const txtPath of walkTextFiles(directory).sort()) {
      try {
        const material = readMaterial(txtPath, categoryKey);
        if (material) materials.push(material);
      } catch (error) {
        console.warn(`警告: 読み込み失敗: ${txtPath}`);
        console.warn(error.message);
      }
    }
  }

  // 日付の新しい順。日付なしは末尾。
  materials.sort((a, b) =>
    a.title.localeCompare(b.title, "ja")
  );

  materials.sort((a, b) =>
    (b.date || "").localeCompare(a.date || "")
  );

  return materials;
}

// ブラウザ側の表示処理。
function makeOutput(materials) {
  return `/*
 * 自動生成ファイル。直接編集しないでください。
 */

const MATERIALS_AUTO_DATA = ${JSON.stringify(materials)};

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

  // トップページ：更新情報を最大5件表示。
  function renderRecentUpdates() {
    const target = document.getElementById("auto-recent-updates");
    if (!target) return;

    target.replaceChildren();

    const items = MATERIALS_AUTO_DATA.filter(
      item => item.categoryKey !== "drafts" && item.date
    );

    items.slice(0, 5).forEach(item => {
      target.appendChild(makeListItem(item, true));
    });
  }

  // トップページ：カテゴリ別に最大3件表示。
  function renderHomeMaterials() {
    const target = document.getElementById("auto-home-materials");
    if (!target) return;

    target.replaceChildren();

    categoryOrder.forEach(key => {
      const items = MATERIALS_AUTO_DATA.filter(
        item => item.categoryKey === key
      );

      if (items.length === 0) return;

      const section = document.createElement("section");
      const heading = document.createElement("h3");
      const categoryLink = document.createElement("a");

      categoryLink.href = "materials.html#" + key;
      categoryLink.textContent = categoryNames[key];

      heading.appendChild(categoryLink);
      section.appendChild(heading);

      const list = document.createElement("ul");

      items.slice(0, 3).forEach(item => {
        list.appendChild(makeListItem(item, false));
      });

      section.appendChild(list);
      target.appendChild(section);
    });
  }

  // 資料一覧ページ：カテゴリ別に全件表示。
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

      items.forEach(item => {
        list.appendChild(makeListItem(item, false));
      });

      section.appendChild(list);
      target.appendChild(section);
    });
  }

  function initialize() {
    renderRecentUpdates();
    renderHomeMaterials();
    renderMaterialsList();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize, {
      once: true
    });
  } else {
    initialize();
  }
})();
`;
}

// メイン処理。
function main() {
  const materials = collectMaterials();

  fs.mkdirSync(SITE_DIR, { recursive: true });

  fs.writeFileSync(
    OUTPUT_JS,
    makeOutput(materials),
    "utf8"
  );

  console.log(`資料 ${materials.length} 件を読み取りました。`);
  console.log(`生成先: ${OUTPUT_JS}`);
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
