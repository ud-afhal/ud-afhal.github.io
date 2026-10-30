/*
 * 資料一覧の表示処理。
 * このファイルは generate.py が生成します。直接編集せず、generate.py を実行してください。
 * 対象データは materials/notes、materials/presentations、materials/drafts 内の HTML のみです。
 */
const MATERIALS_AUTO_DATA = [{"title":"GCHを強制するクラス強制法","date":"2026-10-30","categoryKey":"notes","category":"勉強ノート","url":"materials/notes/GCH-forcing.html"},{"title":"axiom A forcingの可算台反復に関する発表ノート","date":"2026-10-27","categoryKey":"presentations","category":"発表ノート","url":"materials/presentations/axiomA.html"},{"title":"$2$-huge cardinalとhyper- huge cardinal","date":"2026-10-12","categoryKey":"drafts","category":"執筆中（正確性を保証しません）","url":"materials/drafts/2huge_and_hyperhuge.html"},{"title":"hyper-huge cardinalと硬い岩盤","date":null,"categoryKey":"drafts","category":"執筆中（正確性を保証しません）","url":"materials/drafts/hyperhuge_and_solid_bedrock.html"}];

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
