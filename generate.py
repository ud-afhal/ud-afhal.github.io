#!/usr/bin/env python3
"""資料 HTML を読み取り、materials-auto.js を生成するスクリプト。

想定する配置:
  generate.py
  materials-auto.js
  materials/
    notes/*.html
    presentations/*.html
    drafts/*.html

この3つのカテゴリフォルダ内にある HTML だけを対象にします。
外部ライブラリは使用しません。
"""

from __future__ import annotations

import json
import re
from datetime import date
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parent
MATERIALS_DIR = ROOT / "materials"
OUTPUT_JS = ROOT / "materials-auto.js"

# フォルダ名とサイト上での表示名の対応。
CATEGORIES = {
    "notes": "勉強ノート",
    "presentations": "発表ノート",
    "drafts": "執筆中（正確性を保証しません）",
}


class MaterialHTMLParser(HTMLParser):
    """資料の h1 と、document-meta 内の time 要素を取得する。"""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.title_parts: list[str] = []
        self.date_parts: list[str] = []
        self.in_h1 = False
        self.h1_found = False
        self.in_meta = False
        self.in_time = False

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attrs_dict = dict(attrs)
        classes = (attrs_dict.get("class") or "").split()

        # 資料タイトルとして使うのは最初の h1 だけ。
        # 本文中に h1 が複数ある場合、すべて連結されるのを防ぐ。
        if tag.lower() == "h1" and not self.h1_found:
            self.in_h1 = True
            self.h1_found = True
        if tag.lower() == "div" and "document-meta" in classes:
            self.in_meta = True
        if tag.lower() == "time" and self.in_meta:
            self.in_time = True

    def handle_endtag(self, tag: str) -> None:
        tag = tag.lower()
        if tag == "h1":
            self.in_h1 = False
        elif tag == "time":
            self.in_time = False
        elif tag == "div" and self.in_meta:
            self.in_meta = False
            self.in_time = False

    def handle_data(self, data: str) -> None:
        if self.in_h1:
            self.title_parts.append(data)
        if self.in_time:
            self.date_parts.append(data)


def normalize_date(raw_date: str) -> str | None:
    """日付を YYYY-MM-DD に正規化する。例: 2026–10-27 → 2026-10-27。"""
    value = raw_date.strip()
    # 生成ツールが出力する en dash (–) などを通常のハイフンに統一。
    value = re.sub(r"[‐‑‒–—−]", "-", value)
    match = re.search(r"(?<!\d)(\d{4})-(\d{1,2})-(\d{1,2})(?!\d)", value)
    if not match:
        return None
    try:
        return date(int(match.group(1)), int(match.group(2)), int(match.group(3))).isoformat()
    except ValueError:
        return None


def read_material(path: Path, category_key: str) -> dict | None:
    """HTML からタイトル・更新日・相対 URL を取得する。"""
    try:
        source = path.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError) as exc:
        print(f"[警告] 読み込めません: {path.relative_to(ROOT)} ({exc})")
        return None

    parser = MaterialHTMLParser()
    parser.feed(source)
    title = "".join(parser.title_parts).strip()
    updated = normalize_date("".join(parser.date_parts))

    # タイトルがない資料はリンク名を決められないため除外する。
    # 更新日は任意。未記載でも資料を登録し、一覧の末尾に表示する。
    if not title:
        print(f"[警告] h1 がないため除外: {path.relative_to(ROOT)}")
        return None
    if not updated:
        print(f"[情報] 更新日未記載（一覧には登録）: {path.relative_to(ROOT)}")

    relative_path = path.relative_to(ROOT).as_posix()
    # 日本語や空白を含むファイル名もリンクとして扱えるよう、各パス要素を URL エンコード。
    url = "/".join(quote(part, safe="-._~") for part in relative_path.split("/"))

    return {
        "title": title,
        "date": updated,
        "categoryKey": category_key,
        "category": CATEGORIES[category_key],
        "url": url,
    }


def collect_materials() -> list[dict]:
    """指定した3フォルダだけを走査する。他の場所の HTML は取得しない。"""
    materials: list[dict] = []

    for category_key in CATEGORIES:
        category_dir = MATERIALS_DIR / category_key
        if not category_dir.is_dir():
            print(f"[情報] フォルダがないためスキップ: materials/{category_key}/")
            continue

        # 各カテゴリフォルダ以下の HTML を再帰的に取得する。
        for path in sorted(category_dir.rglob("*.html")):
            if path.is_file():
                material = read_material(path, category_key)
                if material:
                    materials.append(material)

    # 更新日がある資料を新しい順に並べ、日付が同じならタイトル順にする。
    # 更新日がない資料は最後にまとめ、タイトル順にする。
    materials.sort(key=lambda item: item["title"].casefold())
    materials.sort(key=lambda item: item["date"] or "", reverse=True)
    return materials


JS_TEMPLATE = r'''/*
 * 資料一覧の表示処理。
 * このファイルは generate.py が生成します。直接編集せず、generate.py を実行してください。
 * 対象データは materials/notes、materials/presentations、materials/drafts 内の HTML のみです。
 */
const MATERIALS_AUTO_DATA = __MATERIALS_DATA__;

(() => {
  "use strict";

  const categoryOrder = ["notes", "presentations", "drafts"];
  const categoryNames = {
    notes: "勉強ノート",
    presentations: "発表ノート",
    drafts: "執筆中（正確性を保証しません）"
  };

  // HTML 要素を作り、テキストは textContent で設定する。
  function makeLink(item) {
    const link = document.createElement("a");
    link.href = item.url;
    link.textContent = item.title;
    return link;
  }

  function makeListItem(item, withDate) {
    const li = document.createElement("li");
    if (withDate) {
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
    .filter(item => item.categoryKey !== "drafts");

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
      // 資料一覧は更新日ではなく、タイトルの五十音順で表示する。
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
'''


def main() -> None:
    if not MATERIALS_DIR.is_dir():
        raise SystemExit(f"materials フォルダが見つかりません: {MATERIALS_DIR}")

    materials = collect_materials()
    js_data = json.dumps(materials, ensure_ascii=False, separators=(",", ":"))
    output = JS_TEMPLATE.replace("__MATERIALS_DATA__", js_data)
    OUTPUT_JS.write_text(output, encoding="utf-8")

    print(f"資料 {len(materials)} 件を読み取りました。")
    print(f"生成先: {OUTPUT_JS}")
    print("対象フォルダ: materials/notes/, materials/presentations/, materials/drafts/")


if __name__ == "__main__":
    main()
