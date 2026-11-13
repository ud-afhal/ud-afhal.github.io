"use strict";

// 公開用フォルダ _site を作る。
//   1. リポジトリの静的ファイルを _site にコピーする
//   2. TXTから資料一覧(materials-auto.js)を生成する
//   3. materials/{notes,presentations,drafts} の .txt を HTML に変換する
//   4. 検索エンジン向けの処理をする（_site の中だけを書き換える）
//      - 資料一覧を index.html・materials.html に静的な HTML として埋め込む
//      - 各ページに canonical を、資料ページに description を付ける
//      - materials/editor.html・materials/figure.html と drafts の資料に noindex を付ける
//      - sitemap.xml を生成する
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

// 公開URLの起点（末尾のスラッシュなし）。
const SITE_URL = "https://ud-afhal.org";
// sitemap.xml に載せる、ルート直下の手書きページ。
const ROOT_PAGES = [
  "index.html",
  "materials.html",
  "updates.html",
  "about.html",
  "links.html"
];
// 公開はするが、検索結果には出さないページ。
const NOINDEX_PAGES = ["materials/editor.html", "materials/figure.html"];
// sitemap.xml に載せない資料のカテゴリ（公開とサイト内リンクは続ける）。
const SITEMAP_EXCLUDED_CATEGORIES = new Set(["drafts"]);
// 資料ページに noindex を付けるカテゴリ（検索結果に出さない）。
const NOINDEX_CATEGORIES = new Set(["drafts"]);
// 資料ページの description の最大文字数。
const DESCRIPTION_LENGTH = 120;

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
// 作った一覧（日付の新しい順）を返す。
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

  return items;
}

// \includegraphics の画像のうち、_site に存在しないもの（http(s) の URL は確かめない）。
function missingImages(images, output) {
  return images.filter((image) => {
    if (/^[a-z][a-z0-9+.-]*:/i.test(image)) {
      return false;
    }
    const file = image.replace(/[?#].*$/, "");
    const target = file.startsWith("/")
      ? path.join(OUTPUT, file)
      : path.resolve(path.dirname(output), file);
    return !target.startsWith(OUTPUT + path.sep) || !fs.existsSync(target);
  });
}

function compileSources() {
  const sources = collectSources();
  let failed = 0;

  for (const { category, file, relative } of sources) {
    try {
      const source = readUtf8(file);
      const { html, issues, images } = buildPage(source);
      const outputRelative = relative.replace(TEXT_FILE, ".html");
      const output = path.join(OUTPUT, outputRelative);
      const description = makeDescription(category, source);
      const headTags = [
        canonicalTag(outputRelative),
        `<meta name="description" content="${escapeHTML(description)}">`
      ];
      if (NOINDEX_CATEGORIES.has(category.key)) {
        headTags.push('<meta name="robots" content="noindex">');
      }

      fs.mkdirSync(path.dirname(output), { recursive: true });
      fs.writeFileSync(output, insertIntoHead(html, headTags), "utf8");

      console.log(`${relative} -> ${path.relative(ROOT, output)}`);
      for (const issue of issues) {
        report("warning", relative, issue);
      }
      for (const image of missingImages(images, output)) {
        report(
          "warning",
          relative,
          `画像「${image}」が公開用フォルダにありません。.txt からの相対パスと、ファイルのコミットを確認してください。`
        );
      }
    } catch (error) {
      failed++;
      report("error", relative, error.message);
    }
  }

  console.log(`${sources.length - failed}/${sources.length} 件を変換しました。`);

  return failed;
}

// ---- 検索エンジン向けの処理 ----

function escapeHTML(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ページのURLを返す。index.html はサイトのルート（/）とする。
// relative は _site からの相対パス（区切りは /）。
function pageUrl(relative) {
  if (relative === "index.html") {
    return `${SITE_URL}/`;
  }

  const encoded = relative
    .split("/")
    .map((part) => encodeURIComponent(decodeURIComponent(part)))
    .join("/");
  return `${SITE_URL}/${encoded}`;
}

function canonicalTag(relative) {
  return `<link rel="canonical" href="${escapeHTML(pageUrl(relative))}">`;
}

// 最初の </head> の直前にタグを挿入する。</head> がなければ何もしない。
function insertIntoHead(html, tags) {
  const index = html.search(/<\/head>/i);
  if (index < 0) {
    return html;
  }
  return html.slice(0, index) + tags.join("\n") + "\n" + html.slice(index);
}

// 資料ページの description: 「カテゴリ名：本文の冒頭」。
// 本文は表題・著者・日付を除いた部分で、数式は TeX のまま残る。
function makeDescription(category, source) {
  const { html } = compileDocument(source);
  const text = htmlToText(html);
  const chars = Array.from(text);
  const body = chars.length > DESCRIPTION_LENGTH
    ? chars.slice(0, DESCRIPTION_LENGTH).join("") + "…"
    : text;
  return body ? `${category.name}：${body}` : category.name;
}

function htmlToText(html) {
  return html
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&quot;/g, "\"")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

// 以下の3関数は materials-auto.js の表示処理と同じ HTML を作る。
// JavaScript を実行しない検索エンジンにも資料へのリンクが見えるようにするため。
// ブラウザでは materials-auto.js が同じ内容で描画し直す。
const CATEGORY_ORDER = CATEGORIES.map((category) => category.key);
const CATEGORY_NAMES = Object.fromEntries(
  CATEGORIES.map((category) => [category.key, category.name])
);
const collator = new Intl.Collator("ja");

function listItemHTML(item, withDate) {
  const link = `<a href="${escapeHTML(item.url)}">${escapeHTML(item.title)}</a>`;
  if (!withDate || item.date === null) {
    return `<li>${link}</li>`;
  }
  const date = escapeHTML(item.date);
  return `<li><time datetime="${date}">${date}</time> ${link}</li>`;
}

// トップページ: draftsを除き、更新日の新しい資料を最大5件。
function recentUpdatesHTML(items) {
  const recent = items.filter((item) => item.categoryKey !== "drafts");
  if (recent.length === 0) {
    return "<li>資料はまだ登録されていません。</li>";
  }
  return recent.slice(0, 5).map((item) => listItemHTML(item, true)).join("");
}

// トップページ: 各カテゴリから新しい資料を最大3件。
function homeMaterialsHTML(items) {
  return CATEGORY_ORDER.map((key) => {
    const selected = items.filter((item) => item.categoryKey === key);
    if (selected.length === 0) return "";
    return `<section><h3><a href="materials.html#${key}">` +
      `${escapeHTML(CATEGORY_NAMES[key])}</a></h3><ul>` +
      selected.slice(0, 3).map((item) => listItemHTML(item, false)).join("") +
      "</ul></section>";
  }).join("");
}

// 資料一覧ページ: 3カテゴリを見出しごとに、タイトルの五十音順で。
function materialsListHTML(items) {
  if (items.length === 0) {
    return "<p>資料はまだ登録されていません。</p>";
  }
  return CATEGORY_ORDER.map((key) => {
    const selected = items
      .filter((item) => item.categoryKey === key)
      .sort((a, b) => collator.compare(a.title, b.title));
    if (selected.length === 0) return "";
    return `<section id="${key}"><h2>${escapeHTML(CATEGORY_NAMES[key])}</h2><ul>` +
      selected.map((item) => listItemHTML(item, false)).join("") +
      "</ul></section>";
  }).join("");
}

// id で指定した空の要素（<ul id="..."></ul> など）の中身を埋める。
function fillPlaceholder(html, id, inner) {
  const pattern = new RegExp(
    `(<([a-z][a-z0-9]*)\\b[^>]*\\bid="${id}"[^>]*>)\\s*(</\\2>)`,
    "i"
  );
  return html.replace(pattern, (_, open, _tag, close) => open + inner + close);
}

function rewriteOutput(relative, transform) {
  const file = path.join(OUTPUT, relative);
  if (!fs.existsSync(file)) {
    return;
  }
  const html = fs.readFileSync(file, "utf8");
  const next = transform(html);
  if (next !== html) {
    fs.writeFileSync(file, next, "utf8");
  }
}

function optimizeRootPages(items) {
  const lists = {
    "auto-recent-updates": recentUpdatesHTML(items),
    "auto-home-materials": homeMaterialsHTML(items),
    "auto-materials-list": materialsListHTML(items)
  };

  for (const relative of ROOT_PAGES) {
    rewriteOutput(relative, (html) => {
      let next = html;
      for (const [id, inner] of Object.entries(lists)) {
        next = fillPlaceholder(next, id, inner);
      }
      return insertIntoHead(next, [canonicalTag(relative)]);
    });
  }

  for (const relative of NOINDEX_PAGES) {
    rewriteOutput(relative, (html) => {
      return insertIntoHead(html, ['<meta name="robots" content="noindex">']);
    });
  }
}

// sitemap.xml を作る。lastmod は資料の \date。
// トップと資料一覧の lastmod は、sitemap に載せる資料のうち最も新しい日付とする。
// SITEMAP_EXCLUDED_CATEGORIES（drafts）の資料は載せない。
function buildSitemap(allItems) {
  const items = allItems.filter((item) => {
    return !SITEMAP_EXCLUDED_CATEGORIES.has(item.categoryKey);
  });
  const latest = items.find((item) => item.date !== null)?.date ?? null;
  const entries = [];

  for (const relative of ROOT_PAGES) {
    if (!fs.existsSync(path.join(OUTPUT, relative))) continue;
    const listsMaterials = relative === "index.html" ||
      relative === "materials.html";
    entries.push({
      loc: pageUrl(relative),
      lastmod: listsMaterials ? latest : null
    });
  }

  for (const item of items) {
    entries.push({ loc: pageUrl(item.url), lastmod: item.date });
  }

  const body = entries.map(({ loc, lastmod }) => {
    const date = lastmod ? `<lastmod>${lastmod}</lastmod>` : "";
    return `  <url><loc>${escapeHTML(loc)}</loc>${date}</url>`;
  }).join("\n");

  const xml = '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    `${body}\n</urlset>\n`;

  fs.writeFileSync(path.join(OUTPUT, "sitemap.xml"), xml, "utf8");
  console.log(`sitemap.xml を生成しました（${entries.length}件）。`);
}

copyStaticFiles();
const items = buildMaterialsList();
const failed = compileSources();
optimizeRootPages(items);
buildSitemap(items);

// 1件でも失敗したら、壊れたサイトを公開しないよう異常終了する。
process.exitCode = failed ? 1 : 0;
