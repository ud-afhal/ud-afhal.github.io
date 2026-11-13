/*!
 * mystyle.js — LaTeX風ソース(.txt/.tex)から公開用HTMLを生成する変換ライブラリ。
 *
 * editor.html は <script src="mystyle.js"> として読み込み、
 * ビルド用スクリプト(scripts/*.js)は require("../materials/mystyle.js") で使う。
 * コマンドラインからの実行機能は持たない。
 *
 * 公開ページの表題・著者・更新日は、ソースの
 *   \title{...}  \author{...}  \date{YYYY-MM-DD}
 * から読み取る。未指定の項目は DEFAULT_SITE の値を使う。
 */
(function (root, factory) {
  "use strict";

  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.Mystyle = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  // ================================================================
  // サイト既定値
  // ================================================================

  // 公開用HTMLのヘッダー・フッター・リンク先。
  // author は、ソースに \author{...} がない場合に使う。
  // updatedDate は、ソースに \date{...} がない場合に使う(空なら表示しない)。
  const DEFAULT_SITE = Object.freeze({
    siteName: "Chicken-generic over Rice",
    headerImageUrl: "/images/header.png",
    stylesheetUrl: "/style.css",
    homeUrl: "/",
    materialsUrl: "/materials.html",
    updatesUrl: "/updates.html",
    aboutUrl: "/about.html",
    linksUrl: "/links.html",
    copyrightHolder: "Ud.afhal",
    copyrightYear: "2026",
    author: "Ud.afhal",
    updatedDate: ""
  });

  const URL_KEYS = [
    "headerImageUrl",
    "stylesheetUrl",
    "homeUrl",
    "materialsUrl",
    "updatesUrl",
    "aboutUrl",
    "linksUrl"
  ];

  // editor.html の <script id="mathjax-loader"> の src と同じにする。
  const MATHJAX_URL = "/MathJax-4.1.3/tex-chtml.js";

  // ================================================================
  // MathJax設定
  // ================================================================

  const MATHJAX_CONFIG = {
    startup: {
      typeset: false
    },
    tex: {
      inlineMath: [
        ["\\(", "\\)"],
        ["$", "$"]
      ],
      displayMath: [
        ["\\[", "\\]"],
        ["$$", "$$"]
      ],
      tags: "ams",
      useLabelIds: true,
      processEscapes: true,
      macros: {
        be: ["#1:\\text{#2}", 2],
        proves: "\\vdash",
        forces: "\\Vdash",
        PA: "\\mathrm{PA}",
        BST: "\\mathrm{BST}",
        ZF: "\\mathrm{ZF}",
        ZFC: "\\mathrm{ZFC}",
        Con: "\\mathrm{Con}",
        MA: "\\mathrm{MA}",
        HF: "\\mathrm{HF}",
        bval: ["\\left[\\!\\left[ #1 \\right]\\!\\right]", 1],
        set: ["\\{{}#1{}\\}", 1],
        power: "\\mathcal{P}",
        Def: "\\mathrm{def}",
        val: "\\mathrm{val}",
        prm: "\\mathrm{prm}",
        img: "\\text{``}",
        dom: "\\mathrm{dom}",
        ran: "\\mathrm{ran}",
        inj: "\\overset{1-1}{\\longrightarrow}",
        surj: "\\overset{onto}{\\longrightarrow}",
        bij: "\\xrightarrow[onto]{1-1}",
        iso: "\\overset{\\sim}{\\longrightarrow}",
        ee: "\\overset{\\prec}{\\rightarrow}",
        ON: "\\mathrm{ON}",
        ot: "\\mathrm{ot}",
        cf: "\\mathrm{cf}",
        len: "\\mathrm{len}",
        club: "\\mathrm{club}",
        nonstat: "\\mathrm{nonstat}",
        inn: "\\varepsilon",
        obj: ["\\ulcorner #1\\urcorner", 1],
        bbepsilon: "\\mathord{\\unicode{x03F5}}",
        mathbbl: ["\\mathbb{#1}", 1]
      }
    },
    chtml: {
      displayAlign: "left",
      displayIndent: "1.5em"
    },
    options: {
      skipHtmlTags: [
        "script",
        "noscript",
        "style",
        "textarea",
        "pre",
        "code"
      ]
    }
  };

  function createMathJaxConfig() {
    return JSON.parse(JSON.stringify(MATHJAX_CONFIG));
  }

  // ================================================================
  // ブラウザー用ランタイム(証明・理由の開閉、MathJax組版、ハッシュ移動)
  // editor.html のプレビューでは実行し、公開用HTMLには
  // この関数の本文をそのまま埋め込む。
  // ================================================================

  function createRuntime() {
    "use strict";

    const TOGGLE_SELECTOR =
      "details.proof-box[data-toggle-key], .reason-box[data-toggle-key]";

    const revisions = new WeakMap();
    const lockedStates = new WeakMap();

    let queue = Promise.resolve();
    let printState = null;

    const mathReady = new Promise((resolve) => {
      const loader = document.getElementById("mathjax-loader");
      let settled = false;

      const timer = window.setTimeout(() => finish(null), 20000);

      function finish(value) {
        if (settled) {
          return;
        }

        settled = true;
        window.clearTimeout(timer);
        resolve(value);
      }

      async function loaded() {
        try {
          const mathJax = window.MathJax;

          if (mathJax?.startup?.promise) {
            await mathJax.startup.promise;
          }

          finish(mathJax?.typesetPromise ? mathJax : null);
        } catch {
          finish(null);
        }
      }

      if (window.MathJax?.startup?.promise) {
        loaded();
      } else if (loader) {
        loader.addEventListener("load", loaded, {
          once: true
        });

        loader.addEventListener("error", () => finish(null), {
          once: true
        });
      } else {
        finish(null);
      }
    });

    function schedule(task) {
      const pending = queue
        .catch(() => undefined)
        .then(() => mathReady)
        .then(async (initialMathJax) => {
          const mathJax = window.MathJax?.typesetPromise
            ? window.MathJax
            : initialMathJax;

          if (mathJax?.startup?.promise) {
            await mathJax.startup.promise;
          }

          return task(mathJax);
        });

      queue = pending;
      return pending;
    }

    function toggleElements(root) {
      return Array.from(root.querySelectorAll(TOGGLE_SELECTOR));
    }

    function isExpanded(element) {
      return element.matches("details.proof-box")
        ? element.open
        : !element.classList.contains("is-collapsed");
    }

    function setReasonExpanded(box, expanded) {
      const button = box.querySelector(
        ":scope > .reason-inner > .reason-prefix > .reason-toggle"
      );

      const content = box.querySelector(
        ":scope > .reason-inner > .reason-text"
      );

      box.classList.toggle("is-collapsed", !expanded);

      if (content) {
        content.hidden = !expanded;
      }

      if (button) {
        button.setAttribute("aria-expanded", String(expanded));
        button.setAttribute(
          "aria-label",
          expanded ? "理由を折り畳む" : "理由を展開"
        );
      }
    }

    function setExpanded(element, expanded) {
      if (element.matches("details.proof-box")) {
        element.open = expanded;
      } else {
        setReasonExpanded(element, expanded);
      }
    }

    function snapshot(root) {
      if (lockedStates.has(root)) {
        return new Map(lockedStates.get(root));
      }

      return new Map(
        toggleElements(root).map((element) => [
          element.dataset.toggleKey,
          isExpanded(element)
        ])
      );
    }

    function restore(root, states) {
      for (const element of toggleElements(root)) {
        const key = element.dataset.toggleKey;

        setExpanded(
          element,
          states.has(key) ? states.get(key) : true
        );
      }
    }

    function expandAll(root) {
      for (const element of toggleElements(root)) {
        setExpanded(element, true);
      }
    }

    async function typesetOpen(root, mathJax, previousStates) {
      const desiredStates = new Map(
        toggleElements(root).map((element) => {
          const key = element.dataset.toggleKey;

          return [
            key,
            previousStates.has(key) ? previousStates.get(key) : true
          ];
        })
      );

      const oldVisibility = root.style.visibility;
      const oldBusy = root.getAttribute("aria-busy");
      const wasInert = root.hasAttribute("inert");

      lockedStates.set(root, desiredStates);

      root.style.visibility = "hidden";
      root.setAttribute("aria-busy", "true");
      root.setAttribute("inert", "");

      expandAll(root);

      try {
        mathJax.texReset();
        await mathJax.typesetPromise([root]);
      } finally {
        restore(root, desiredStates);
        lockedStates.delete(root);

        root.style.visibility = oldVisibility;

        if (oldBusy === null) {
          root.removeAttribute("aria-busy");
        } else {
          root.setAttribute("aria-busy", oldBusy);
        }

        if (!wasInert) {
          root.removeAttribute("inert");
        }
      }
    }

    function render(root, html) {
      const revision = (revisions.get(root) || 0) + 1;
      revisions.set(root, revision);

      if (!window.MathJax?.typesetPromise) {
        const states = snapshot(root);
        root.innerHTML = html;
        restore(root, states);
      }

      return schedule(async (mathJax) => {
        if (revisions.get(root) !== revision) {
          return Boolean(mathJax);
        }

        const states = snapshot(root);

        if (mathJax) {
          mathJax.typesetClear([root]);
        }

        root.innerHTML = html;

        if (!mathJax) {
          restore(root, states);
          return false;
        }

        await typesetOpen(root, mathJax, states);
        return true;
      });
    }

    function typeset(root) {
      return schedule(async (mathJax) => {
        if (!root || !mathJax) {
          return false;
        }

        await typesetOpen(root, mathJax, snapshot(root));
        return true;
      });
    }

    function revealTarget(target) {
      for (
        let element = target;
        element;
        element = element.parentElement
      ) {
        if (element.matches("details")) {
          element.open = true;
        }

        if (element.matches(".reason-box")) {
          setReasonExpanded(element, true);
        }
      }
    }

    function targetFromHash(hash) {
      try {
        const id = decodeURIComponent(hash.replace(/^#/, ""));
        return id ? document.getElementById(id) : null;
      } catch {
        return null;
      }
    }

    function revealHash() {
      const target = targetFromHash(window.location.hash);

      if (target) {
        revealTarget(target);
        requestAnimationFrame(() => target.scrollIntoView());
      }
    }

    document.addEventListener("click", (event) => {
      if (!(event.target instanceof Element)) {
        return;
      }

      const button = event.target.closest(".reason-toggle");

      if (button) {
        const box = button.closest(".reason-box");

        if (box) {
          setReasonExpanded(box, !isExpanded(box));
        }

        return;
      }

      const link = event.target.closest('a[href^="#"]');

      if (!link) {
        return;
      }

      const hash = link.getAttribute("href");
      const target = targetFromHash(hash);

      if (!target) {
        return;
      }

      event.preventDefault();
      revealTarget(target);

      try {
        history.replaceState(null, "", hash);
      } catch {
        // file:で履歴操作が制限されても移動は続行する。
      }

      requestAnimationFrame(() => target.scrollIntoView());
    });

    window.addEventListener("hashchange", revealHash);

    window.addEventListener("beforeprint", () => {
      if (printState) {
        return;
      }

      printState = Array.from(
        document.querySelectorAll(".paper"),
        (root) => ({
          root,
          states: snapshot(root)
        })
      );

      for (const { root } of printState) {
        expandAll(root);
      }
    });

    window.addEventListener("afterprint", () => {
      if (!printState) {
        return;
      }

      for (const { root, states } of printState) {
        if (root.isConnected) {
          restore(root, states);
        }
      }

      printState = null;
    });

    return {
      render,
      typeset,
      snapshot,
      restore,
      revealHash,
      // エディターの差分描画用。
      whenReady: schedule,
      isExpanded,
      setExpanded,
      toggleSelector: TOGGLE_SELECTOR
    };
  }

  // ================================================================
  // 変換(DOMに依存しない。ブラウザーでもNodeでも動く)
  // ================================================================

  const ENVIRONMENTS = Object.freeze({
    reason: {
      title: "理由",
      color: "#6b7280",
      numbered: false
    },
    definition: {
      title: "定義",
      color: "#c62828",
      numbered: true
    },
    fact: {
      title: "事実",
      color: "#c62828",
      numbered: true
    },
    proposition: {
      title: "命題",
      color: "#ef8c00",
      numbered: true
    },
    lemma: {
      title: "補題",
      color: "#238636",
      numbered: true
    },
    theorem: {
      title: "定理",
      color: "#2563eb",
      numbered: true
    },
    corollary: {
      title: "系",
      color: "#4b5563",
      numbered: true
    },
    remark: {
      title: "注意",
      color: "#ef8c00",
      numbered: true
    },
    statement: {
      title: "主張",
      color: "#4b5563",
      numbered: true
    },
    proof: {
      title: "証明",
      color: "rgba(0,0,0,.28)",
      numbered: false
    }
  });

  const INLINE_TAGS = new Map([
    ["textbf", "strong"],
    ["emph", "em"],
    ["textit", "em"],
    ["texttt", "code"]
  ]);

  const LIST_NAMES = new Set([
    "itemize",
    "enumerate",
    "phase"
  ]);

  // 図の環境。番号は文書全体の通し番号（LaTeX の article と同じ）。
  const FIGURE_NAMES = new Set([
    "figure",
    "figure*"
  ]);

  // \includegraphics の幅・高さで、行幅に対する比として扱う長さ。
  const RELATIVE_LENGTHS = new Set([
    "linewidth",
    "textwidth",
    "columnwidth",
    "hsize"
  ]);

  const CSS_LENGTH = /^(\d+(?:\.\d+)?|\.\d+)\s*(cm|mm|in|pt|px|em|ex|%)$/;

  // ================================================================
  // 基本ユーティリティ
  // ================================================================

  function escapeHTML(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  const NAMED_ENTITIES = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    nbsp: "\u00a0",
    emsp: "\u2003"
  };

  // タグを除き、実体参照を戻す(DOMのtextContent相当)。
  function htmlToText(html) {
    return String(html)
      .replace(/<[^>]*>/g, "")
      .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, name) => {
        if (name[0] === "#") {
          const code = name[1].toLowerCase() === "x"
            ? parseInt(name.slice(2), 16)
            : Number(name.slice(1));

          return String.fromCodePoint(code);
        }

        const key = name.toLowerCase();

        return Object.hasOwn(NAMED_ENTITIES, key)
          ? NAMED_ENTITIES[key]
          : entity;
      });
  }

  function safeURL(value) {
    const url = String(value ?? "").trim();

    if (/[\u0000-\u001f\u007f]/.test(url)) {
      return "#";
    }

    const scheme = url
      .replace(/\s/g, "")
      .match(/^([a-z][a-z0-9+.-]*):/i);

    if (scheme && !/^(https?|mailto|tel)$/i.test(scheme[1])) {
      return "#";
    }

    return url;
  }

  function fragmentURL(id) {
    return "#" + encodeURIComponent(id);
  }

  function isEscaped(text, index) {
    let count = 0;

    for (
      let cursor = index - 1;
      cursor >= 0 && text[cursor] === "\\";
      cursor--
    ) {
      count++;
    }

    return count % 2 === 1;
  }

  function skipWhitespace(text, start) {
    let cursor = start;

    while (cursor < text.length && /\s/.test(text[cursor])) {
      cursor++;
    }

    return cursor;
  }

  function readGroup(text, start, opening = "{", closing = "}") {
    const begin = skipWhitespace(text, start);

    if (text[begin] !== opening) {
      return null;
    }

    let depth = 1;
    let braceDepth = 0;

    for (let index = begin + 1; index < text.length; index++) {
      if (isEscaped(text, index)) {
        continue;
      }

      const character = text[index];

      if (opening === "[") {
        if (character === "{") {
          braceDepth++;
          continue;
        }

        if (character === "}") {
          braceDepth = Math.max(0, braceDepth - 1);
          continue;
        }

        if (braceDepth > 0) {
          continue;
        }
      }

      if (character === opening) {
        depth++;
      } else if (character === closing) {
        depth--;

        if (depth === 0) {
          return {
            value: text.slice(begin + 1, index),
            start: begin,
            end: index + 1
          };
        }
      }
    }

    return null;
  }

  function normalizeSource(source) {
    return String(source)
      .replace(/\r\n?/g, "\n")
      .split("\n")
      .map((line) => {
        for (let index = 0; index < line.length; index++) {
          if (line[index] === "%" && !isEscaped(line, index)) {
            return line.slice(0, index);
          }
        }

        return line;
      })
      .join("\n");
  }

  function matchedValues(source, pattern, group = 1) {
    return Array.from(source.matchAll(pattern))
      .filter((match) => !isEscaped(source, match.index))
      .map((match) => match[group].trim());
  }

  function labelsIn(source) {
    return matchedValues(
      source,
      /\\label\s*\{([^{}]+)\}/g
    );
  }

  function citedKeysIn(source) {
    return matchedValues(
      source,
      /\\cite(?:\s*\[[^\]]*\])?\s*\{([^{}]*)\}/g
    ).flatMap((keys) => {
      return keys
        .split(",")
        .map((key) => key.trim())
        .filter(Boolean);
    });
  }

  function labelAnchors(labels) {
    return labels.map((key) => {
      return `<span id="${escapeHTML("label-" + key)}"></span>`;
    }).join("");
  }

  function labelIdAttribute(node) {
    return node.labels?.length
      ? ` id="${escapeHTML("label-" + node.labels[0])}"`
      : "";
  }


  // ================================================================
  // 数式トークン
  // ================================================================

  function createContext(source) {
    let prefix = "@@MYSTYLE";

    while (source.includes(prefix)) {
      prefix += "_";
    }

    return {
      prefix,
      tokens: [],
      headings: [],
      labels: new Map(),
      bibliographyLabels: new Map(),
      bibliographyLabelDepth: 0,
      citationCounts: new Map(),
      citedKeys: new Set(citedKeysIn(source)),
      issues: [],
      // \includegraphics のパス（出現順）。compile.js がファイルの有無を確かめる。
      images: [],
      // パスから画像のURLを決める関数（エディターのプレビュー専用）。
      // 公開用HTMLでは null のままにし、パスをそのまま相対URLとして使う。
      resolveImage: null,
      declared: {
        title: null,
        author: null,
        date: null
      },
      protectedSource: "",
      // ソース位置の対応（エディターのプレビュー専用）。
      // 公開用HTMLでは無効のままにし、data-src-* 属性を出力しない。
      sourceMap: false,
      sourceOffsets: null,
      lineStarts: null
    };
  }

  // ================================================================
  // ソース位置の対応（プレビュー → ソース）
  // ================================================================

  function computeLineStarts(text) {
    const starts = [0];

    for (let index = 0; index < text.length; index++) {
      if (text[index] === "\n") {
        starts.push(index + 1);
      }
    }

    return starts;
  }

  // protectedSource 上の位置を、元ソースの行番号（1始まり）に変換する。
  // normalizeSource は行内のコメントを削るだけで行構成を変えないため、
  // 正規化後の行番号は元ソースの行番号と一致する。
  function sourceLineAt(context, position) {
    if (!context.sourceMap || !Number.isFinite(position)) {
      return null;
    }

    const offsets = context.sourceOffsets;
    const clamped = Math.max(0, Math.min(position, offsets.length - 1));
    const offset = offsets.length ? offsets[clamped] : 0;
    const starts = context.lineStarts;

    let low = 0;
    let high = starts.length - 1;

    while (low < high) {
      const middle = (low + high + 1) >> 1;

      if (starts[middle] <= offset) {
        low = middle;
      } else {
        high = middle - 1;
      }
    }

    return low + 1;
  }

  function sourceAttributes(context, start, end = null) {
    const line = sourceLineAt(context, start);

    if (line === null) {
      return "";
    }

    const endLine = end === null ? null : sourceLineAt(context, end);

    return endLine !== null && endLine > line
      ? ` data-src-line="${line}" data-src-end="${endLine}"`
      : ` data-src-line="${line}"`;
  }

  function mathSourceAttributes(node, context) {
    const line = sourceLineAt(context, node.start);

    if (line === null) {
      return "";
    }

    const endLine = line + (node.tex.match(/\n/g) || []).length;

    return endLine > line
      ? ` data-src-line="${line}" data-src-end="${endLine}"`
      : ` data-src-line="${line}"`;
  }

  // 正規表現による置き換えを、各文字の元位置を保ったまま行う。
  function replaceTracked(text, positions, pattern, replacement) {
    let output = "";
    const mapped = [];
    let cursor = 0;

    pattern.lastIndex = 0;

    let match;

    while ((match = pattern.exec(text)) !== null) {
      for (let index = cursor; index < match.index; index++) {
        mapped.push(positions[index]);
      }

      output += text.slice(cursor, match.index);
      output += replacement;

      for (let index = 0; index < replacement.length; index++) {
        mapped.push(positions[match.index]);
      }

      cursor = match.index + match[0].length;

      if (match[0].length === 0) {
        pattern.lastIndex++;
      }
    }

    for (let index = cursor; index < text.length; index++) {
      mapped.push(positions[index]);
    }

    return {
      text: output + text.slice(cursor),
      positions: mapped
    };
  }

  function tokenMarker(context, index) {
    return `${context.prefix}:${index}@@`;
  }

  function tokenPattern(context) {
    return new RegExp(`${context.prefix}:(\\d+)@@`, "g");
  }

  function restoreMathTokens(text, context) {
    return text.replace(tokenPattern(context), (marker, index) => {
      return context.tokens[Number(index)]?.tex || marker;
    });
  }

  function findClosingDelimiter(source, delimiter, start) {
    let position = source.indexOf(delimiter, start);

    while (position !== -1 && isEscaped(source, position)) {
      position = source.indexOf(
        delimiter,
        position + delimiter.length
      );
    }

    return position;
  }

  function findMathEnvironmentEnd(source, start, name) {
    const pattern = /\\(begin|end)\s*\{\s*([^{}]+?)\s*\}/g;
    const stack = [name];

    pattern.lastIndex = start;

    let match;

    while ((match = pattern.exec(source)) !== null) {
      if (isEscaped(source, match.index)) {
        continue;
      }

      if (match[1] === "begin") {
        stack.push(match[2]);
        continue;
      }

      if (stack.at(-1) !== match[2]) {
        return null;
      }

      stack.pop();

      if (stack.length === 0) {
        return {
          start: match.index,
          end: pattern.lastIndex
        };
      }
    }

    return null;
  }

  function protectMath(source, context) {
    const pattern =
      /\\begin\s*\{\s*(equation\*?|align\*?|gather\*?|multline\*?|flalign\*?|alignat\*?|displaymath|math)\s*\}|\\\[|\\\(|\$\$|\$/g;

    let output = "";
    let cursor = 0;
    let match;

    // output の各文字が、正規化後ソースのどの位置に由来するか。
    const offsets = context.sourceMap ? [] : null;

    function copyOffsets(from, to) {
      if (offsets) {
        for (let index = from; index < to; index++) {
          offsets.push(index);
        }
      }
    }

    while ((match = pattern.exec(source)) !== null) {
      if (isEscaped(source, match.index)) {
        continue;
      }

      const opening = match[0];
      const environment = match[1] || "";

      let closing;

      if (environment) {
        closing = findMathEnvironmentEnd(
          source,
          pattern.lastIndex,
          environment
        );
      } else {
        const delimiter = opening === "\\["
          ? "\\]"
          : opening === "\\("
            ? "\\)"
            : opening;

        const start = findClosingDelimiter(
          source,
          delimiter,
          pattern.lastIndex
        );

        if (start !== -1) {
          closing = {
            start,
            end: start + delimiter.length
          };
        }
      }

      if (!closing) {
        context.issues.push(
          `数式の開始記号「${opening}」に対応する終端がありません。`
        );
        continue;
      }

      const display = environment
        ? environment !== "math"
        : opening === "\\[" || opening === "$$";

      const node = {
        type: display ? "math" : "inline-math",
        environment,
        body: source.slice(pattern.lastIndex, closing.start),
        tex: source.slice(match.index, closing.end),
        labels: [],
        sourceStart: match.index
      };

      const index = context.tokens.push(node) - 1;
      const marker = tokenMarker(context, index);
      const inserted = display ? `\n${marker}\n` : marker;

      output += source.slice(cursor, match.index);
      copyOffsets(cursor, match.index);

      output += inserted;

      if (offsets) {
        for (let offset = 0; offset < inserted.length; offset++) {
          offsets.push(match.index);
        }
      }

      cursor = closing.end;
      pattern.lastIndex = closing.end;
    }

    copyOffsets(cursor, source.length);

    if (offsets) {
      // 末尾位置の参照用。
      offsets.push(source.length);
      context.sourceOffsets = offsets;
    }

    return output + source.slice(cursor);
  }

  function splitMathRows(body) {
    const pattern =
      /\\(?:begin|end)\s*\{[^{}]*\}|\\\\\*?(?:\s*\[[^\]]*\])?|[{}]/g;

    const rows = [];
    let braceDepth = 0;
    let environmentDepth = 0;
    let cursor = 0;
    let match;

    while ((match = pattern.exec(body)) !== null) {
      if (isEscaped(body, match.index)) {
        continue;
      }

      const token = match[0];

      if (token.startsWith("\\begin")) {
        environmentDepth++;
      } else if (token.startsWith("\\end")) {
        environmentDepth = Math.max(0, environmentDepth - 1);
      } else if (token === "{") {
        braceDepth++;
      } else if (token === "}") {
        braceDepth = Math.max(0, braceDepth - 1);
      } else if (braceDepth === 0 && environmentDepth === 0) {
        rows.push(body.slice(cursor, match.index));
        cursor = pattern.lastIndex;
      }
    }

    rows.push(body.slice(cursor));
    return rows;
  }

  // ================================================================
  // 構文解析
  // ================================================================

  function parseDocumentTree(source, context) {
    const root = {
      type: "root",
      children: []
    };

    const stack = [{
      node: root,
      target: root.children
    }];

    const pattern = new RegExp(
      `${context.prefix}:(\\d+)@@` +
      String.raw`|\\(begin|end|section|subsection|title|author|date|tableofcontents|maketitle|item|bibitem|label|includegraphics|caption|centering)\b`,
      "g"
    );

    let cursor = 0;
    let match;

    function append(node) {
      const target = stack.at(-1).target;
      const previous = target.at(-1);

      if (node.type === "text" && previous?.type === "text") {
        previous.value += node.value;
        previous.pieces.push(...node.pieces);
      } else {
        target.push(node);
      }
    }

    function appendText(value, start) {
      if (value) {
        append({
          type: "text",
          value,
          // protectedSource 上の連続区間。段落の位置特定に使う。
          pieces: [{
            start,
            length: value.length
          }]
        });
      }
    }

    function readOptional(start, description) {
      const optional = readGroup(source, start, "[", "]");

      if (
        !optional &&
        source[skipWhitespace(source, start)] === "["
      ) {
        context.issues.push(
          `${description}を閉じる ] がありません。`
        );
      }

      return optional;
    }

    function nearestFigure() {
      for (let index = stack.length - 1; index > 0; index--) {
        if (FIGURE_NAMES.has(stack[index].node.name)) {
          return stack[index].node;
        }
      }

      return null;
    }

    while ((match = pattern.exec(source)) !== null) {
      if (match[1] !== undefined) {
        const node = context.tokens[Number(match[1])];

        if (node.type === "inline-math") {
          continue;
        }

        appendText(source.slice(cursor, match.index), cursor);
        node.start = match.index;
        append(node);

        cursor = pattern.lastIndex;
        continue;
      }

      if (isEscaped(source, match.index)) {
        continue;
      }

      appendText(source.slice(cursor, match.index), cursor);

      const command = match[2];
      let end = pattern.lastIndex;

      if (command === "begin" || command === "end") {
        const group = readGroup(source, end);

        if (!group) {
          context.issues.push(
            `\\${command} の環境名を確認してください。`
          );

          appendText(match[0], match.index);
        } else {
          const name = group.value.trim();
          end = group.end;

          if (command === "begin") {
            const node = {
              type: "environment",
              name,
              children: [],
              items: [],
              labels: [],
              headingNote: "",
              start: match.index,
              end: source.length
            };

            if (ENVIRONMENTS[name] && name !== "reason") {
              const note = readOptional(
                end,
                `環境「${name}」の補足表題`
              );

              if (note) {
                node.headingNote = note.value.trim();
                end = note.end;
              }
            } else if (name === "thebibliography") {
              const width = readGroup(source, end);

              if (width) {
                end = width.end;
              }
            } else if (FIGURE_NAMES.has(name)) {
              // 配置指定 [htbp] は読み飛ばす。
              const placement = readOptional(
                end,
                `環境「${name}」の配置指定`
              );

              if (placement) {
                end = placement.end;
              }

              node.caption = null;
            }

            if (
              !ENVIRONMENTS[name] &&
              !LIST_NAMES.has(name) &&
              !FIGURE_NAMES.has(name) &&
              name !== "thebibliography" &&
              name !== "document"
            ) {
              context.issues.push(
                `環境「${name}」はHTML変換の対象外です。開始・終了記号を本文に残します。`
              );
            }

            append(node);

            stack.push({
              node,
              target: node.children
            });
          } else {
            let index = stack.length - 1;

            while (
              index > 0 &&
              stack[index].node.name !== name
            ) {
              index--;
            }

            if (index === 0) {
              context.issues.push(
                `環境「${name}」の終了に対応する開始がありません。`
              );

              appendText(source.slice(match.index, end), match.index);
            } else {
              for (
                let unclosed = stack.length - 1;
                unclosed > index;
                unclosed--
              ) {
                const node = stack[unclosed].node;
                node.end = match.index;

                context.issues.push(
                  `環境「${node.name}」を閉じる前に「${name}」が終了しています。`
                );
              }

              stack[index].node.end = end;
              stack.length = index;
            }
          }
        }
      } else if (
        command === "section" ||
        command === "subsection" ||
        command in context.declared
      ) {
        const starred = source[end] === "*";

        if (starred) {
          end++;
        }

        const group = readGroup(source, end);

        if (!group) {
          context.issues.push(
            `\\${command} の引数を確認してください。`
          );

          appendText(source.slice(match.index, end), match.index);
        } else {
          end = group.end;

          if (command in context.declared) {
            context.declared[command] = group.value;
          } else {
            append({
              type: "heading",
              level: command === "section" ? 1 : 2,
              title: group.value,
              starred,
              labels: [],
              start: match.index
            });
          }
        }
      } else if (command === "label") {
        const group = readGroup(source, end);

        if (!group) {
          context.issues.push(
            "\\label の引数を確認してください。"
          );

          appendText(match[0], match.index);
        } else {
          end = group.end;

          append({
            type: "label",
            key: group.value.trim(),
            labels: [],
            standalone: false
          });
        }
      } else if (
        command === "item" ||
        command === "bibitem"
      ) {
        const note = readOptional(
          end,
          `\\${command} のラベル`
        );

        if (note) {
          end = note.end;
        }

        let key = "";

        if (command === "bibitem") {
          const group = readGroup(source, end);

          if (group) {
            key = group.value.trim();
            end = group.end;
          }
        }

        const frame = stack.at(-1);

        const valid = command === "item"
          ? LIST_NAMES.has(frame.node.name)
          : (
            frame.node.name === "thebibliography" &&
            Boolean(key)
          );

        if (!valid) {
          context.issues.push(
            `\\${command} の配置または引数を確認してください。`
          );

          appendText(source.slice(match.index, end), match.index);
        } else {
          const item = {
            type: command === "item" ? "item" : "bibitem",
            key,
            headingNote: note?.value.trim() || "",
            children: [],
            labels: [],
            start: match.index
          };

          frame.node.items.push(item);
          frame.target = item.children;
        }
      } else if (command === "tableofcontents") {
        append({
          type: "toc"
        });
      } else if (command === "centering") {
        // HTML では図を常に中央に置くため、何もしない。
      } else if (command === "includegraphics") {
        const starred = source[end] === "*";

        if (starred) {
          end++;
        }

        const options = readOptional(
          end,
          "\\includegraphics のオプション"
        );

        if (options) {
          end = options.end;
        }

        const group = readGroup(source, end);

        if (!group || !group.value.trim()) {
          context.issues.push(
            "\\includegraphics の引数（画像のパス）を確認してください。"
          );

          appendText(source.slice(match.index, end), match.index);
        } else {
          end = group.end;

          append({
            type: "image",
            path: group.value.trim(),
            options: options ? options.value : "",
            figure: nearestFigure(),
            start: match.index,
            end
          });
        }
      } else if (command === "caption") {
        // 目次用の短い表題 [..] は読み飛ばす。
        const short = readOptional(end, "\\caption の短い表題");

        if (short) {
          end = short.end;
        }

        const group = readGroup(source, end);
        const figure = nearestFigure();

        if (!group) {
          context.issues.push(
            "\\caption の引数を確認してください。"
          );

          appendText(source.slice(match.index, end), match.index);
        } else if (!figure) {
          end = group.end;

          context.issues.push(
            "\\caption は figure 環境の中で使ってください。"
          );

          appendText(group.value, group.start + 1);
        } else if (figure.caption) {
          end = group.end;

          context.issues.push(
            "1つの figure 環境に \\caption が複数あります。2つ目以降は本文として表示します。"
          );

          appendText(group.value, group.start + 1);
        } else {
          end = group.end;

          const caption = {
            type: "caption",
            value: group.value,
            figure,
            start: match.index
          };

          figure.caption = caption;
          append(caption);
        }
      }

      cursor = end;
      pattern.lastIndex = end;
    }

    appendText(source.slice(cursor), cursor);

    for (let index = 1; index < stack.length; index++) {
      context.issues.push(
        `環境「${stack[index].node.name}」が閉じられていません。`
      );
    }

    return root;
  }

  // ================================================================
  // 番号・ラベル・文献ラベル
  // ================================================================

  function decorateTree(root, context) {
    let section = 0;
    let subsection = 0;
    let theorem = 0;
    let equation = 0;
    let bibliography = 0;
    let figure = 0;

    const bibliographyLabelOwners = new Map();

    function registerLabel(key, target, number) {
      if (!key || context.labels.has(key)) {
        return;
      }

      target.labels ??= [];
      target.labels.push(key);

      context.labels.set(key, {
        number: String(number ?? "?"),
        node: target
      });
    }

    function decorateMath(node) {
      const multipleRows =
        /^(?:align|alignat|flalign|gather)\*?$/.test(
          node.environment
        );

      const rows = multipleRows
        ? splitMathRows(node.body)
        : [node.body];

      const automatic =
        /^(?:equation|align|alignat|flalign|gather|multline)$/.test(
          node.environment
        );

      // この数式より前の自動番号の個数。差分描画で MathJax の式番号を合わせる。
      node.equationStart = equation;

      for (const row of rows) {
        if (!row.trim()) {
          continue;
        }

        const tagCommand = /\\tag\*?\s*/.exec(row);

        const tag = tagCommand
          ? readGroup(
            row,
            tagCommand.index + tagCommand[0].length
          )
          : null;

        const suppressed = /\\(?:notag|nonumber)\b/.test(row);
        let number = "?";

        if (tag) {
          number = tag.value;
        } else if (automatic && !suppressed) {
          number = String(++equation);
        }

        node.number ??= number;

        for (const label of labelsIn(row)) {
          registerLabel(label, node, number);
        }
      }
    }

    function hasVisibleContent(nodes) {
      return nodes.some((node) => {
        if (node.type === "text") {
          return Boolean(node.value.trim());
        }

        return node.type !== "label";
      });
    }

    function visit(nodes, owner = null, initialTarget = owner) {
      let currentTarget = initialTarget;

      for (const node of nodes) {
        if (node.type === "heading") {
          if (!node.starred) {
            if (node.level === 1) {
              section++;
              subsection = 0;
              theorem = 0;
              node.number = String(section);
            } else {
              subsection++;
              node.number = `${section || 1}.${subsection}`;
            }
          } else {
            node.number = "";
          }

          node.id = node.starred
            ? `heading-${context.headings.length + 1}`
            : node.level === 1
              ? `section-${node.number}`
              : `subsection-${node.number.replace(/\./g, "-")}`;

          context.headings.push(node);
          currentTarget = node;
          continue;
        }

        if (node.type === "label") {
          const target = owner || currentTarget || node;

          node.standalone = target === node;
          registerLabel(node.key, target, target.number || "?");
          continue;
        }

        if (node.type === "math") {
          decorateMath(node);
          currentTarget = node;
          continue;
        }

        if (node.type !== "environment") {
          continue;
        }

        const environment = ENVIRONMENTS[node.name];

        if (environment) {
          node.number = environment.numbered
            ? `${section || 1}.${++theorem}`
            : (
              (owner || currentTarget)?.number ||
              environment.title
            );

          visit(node.children, node, node);
          currentTarget = node;
          continue;
        }

        if (FIGURE_NAMES.has(node.name)) {
          // LaTeX と同じく、\caption のある図だけに番号を振る。
          node.number = node.caption
            ? String(++figure)
            : null;

          if (!node.caption) {
            context.issues.push(
              `環境「${node.name}」に \\caption がないため、図番号を付けません。`
            );
          }

          visit(node.children, node, node);
          currentTarget = node;
          continue;
        }

        if (LIST_NAMES.has(node.name)) {
          if (hasVisibleContent(node.children)) {
            context.issues.push(
              `環境「${node.name}」の最初の \\item より前に本文があります。`
            );
          }

          visit(node.children, owner, currentTarget);

          for (const item of node.items) {
            visit(item.children, owner, currentTarget);
          }

          continue;
        }

        if (node.name === "thebibliography") {
          visit(node.children, owner, currentTarget);

          for (const item of node.items) {
            bibliography++;

            // 自由記述の文献から著者・年を推測しない。
            // ラベル未指定時も数値連番ではなく文献キーを使用する。
            item.displayLabel = item.headingNote || item.key;
            item.number = restoreMathTokens(
              item.displayLabel,
              context
            );

            if (!item.headingNote) {
              context.issues.push(
                `文献「${item.key}」は表示ラベルが未指定のため、文献キーを表示します。` +
                "AMSalpha型のラベルは \\bibitem[Kun80]{key} のように指定してください。"
              );
            }

            const duplicate = context.bibliographyLabels.has(
              item.key
            );

            item.bibId = duplicate
              ? `bib-duplicate-${bibliography}`
              : `bib-${item.key}`;

            if (!duplicate) {
              context.bibliographyLabels.set(
                item.key,
                item.displayLabel
              );
            }

            const labelIdentity = item.number;

            const previousOwner = bibliographyLabelOwners.get(
              labelIdentity
            );

            if (previousOwner && previousOwner !== item.key) {
              context.issues.push(
                `文献「${previousOwner}」と「${item.key}」の表示ラベルが重複しています。` +
                "必要に応じて Kun80a、Kun80b のように区別してください。"
              );
            } else {
              bibliographyLabelOwners.set(
                labelIdentity,
                item.key
              );
            }

            visit(item.children, item, item);
          }

          continue;
        }

        visit(node.children, owner, currentTarget);
      }
    }

    visit(root.children);
  }

  // ================================================================
  // 証明・理由の開閉状態の対応付け
  // ================================================================

  function collectToggles(root, context) {
    const descriptors = [];

    function visit(nodes, parentPath) {
      let environmentIndex = 0;

      for (const node of nodes) {
        if (node.type !== "environment") {
          continue;
        }

        const path =
          `${parentPath}/${node.name}:${environmentIndex++}`;

        if (node.name === "proof" || node.name === "reason") {
          const signature = restoreMathTokens(
            context.protectedSource.slice(node.start, node.end),
            context
          )
            .replace(/\s+/g, " ")
            .trim();

          descriptors.push({
            node,
            name: node.name,
            label: node.labels[0] || "",
            signature,
            path,
            key: ""
          });
        }

        visit(node.children, path);

        node.items.forEach((item, index) => {
          visit(item.children, `${path}/item:${index}`);
        });
      }
    }

    visit(root.children, "root");
    return descriptors;
  }

  function reconcileToggles(current, previous) {
    const used = new Set();

    // 以前のキー(fold-N)と衝突しない連番を、文書ごとに振る。
    let lastId = previous.reduce((max, old) => {
      const match = /^fold-(\d+)$/.exec(old.key);
      return match ? Math.max(max, Number(match[1])) : max;
    }, 0);

    function matchBy(selector) {
      for (const descriptor of current) {
        if (descriptor.key) {
          continue;
        }

        const identity = selector(descriptor);

        if (!identity) {
          continue;
        }

        const candidates = previous.filter((old) => {
          return !used.has(old) && selector(old) === identity;
        });

        const selected =
          candidates.find((old) => old.path === descriptor.path) ||
          candidates[0];

        if (selected) {
          descriptor.key = selected.key;
          used.add(selected);
        }
      }
    }

    matchBy((item) => {
      return item.label ? `${item.name}\0${item.label}` : "";
    });

    matchBy((item) => {
      return `${item.name}\0${item.signature}`;
    });

    matchBy((item) => {
      return item.label ? "" : `${item.name}\0${item.path}`;
    });

    for (const descriptor of current) {
      descriptor.key ||= `fold-${++lastId}`;
      descriptor.node.toggleKey = descriptor.key;
    }

    return current;
  }

  // ================================================================
  // インライン変換・引用
  // ================================================================

  function renderReference(command, key, context, interactive) {
    const trimmedKey = key.trim();
    const number = context.labels.get(trimmedKey)?.number ?? "?";
    const text = command === "eqref" ? `(${number})` : number;

    if (!interactive) {
      return escapeHTML(text);
    }

    const href = fragmentURL("label-" + trimmedKey);

    return `
      <a class="reference" href="${escapeHTML(href)}">${escapeHTML(text)}</a>
    `.trim();
  }

  function renderBibliographyLabel(label, context) {
    if (context.bibliographyLabelDepth >= 4) {
      return escapeHTML(restoreMathTokens(label, context));
    }

    context.bibliographyLabelDepth++;

    try {
      return renderInline(label, context, false);
    } finally {
      context.bibliographyLabelDepth--;
    }
  }

  function renderCitation(note, keys, context, interactive) {
    const entries = keys
      .split(",")
      .map((key) => key.trim())
      .filter(Boolean);

    if (entries.length === 0) {
      return "[?]";
    }

    const citations = entries.map((key) => {
      const label = context.bibliographyLabels.get(key) ?? "?";
      const text = renderBibliographyLabel(label, context);

      if (!interactive) {
        return text;
      }

      const count = (context.citationCounts.get(key) || 0) + 1;
      context.citationCounts.set(key, count);

      const id = count === 1
        ? `cite-${key}`
        : `cite-${key}-${count}`;

      return `
        <a
          class="citation"
          id="${escapeHTML(id)}"
          href="${escapeHTML(fragmentURL("bib-" + key))}"
        >${text}</a>
      `.trim();
    }).join(", ");

    const annotation = note.trim()
      ? ", " + renderInline(note, context, false)
      : "";

    return `
      <span class="citation-group">[${citations}${annotation}]</span>
    `.trim();
  }

  function renderInline(text, context, interactive = true) {
    const markerPattern = new RegExp(
      `^${context.prefix}:(\\d+)@@`
    );

    let output = "";
    let plain = "";
    let position = 0;

    function flushPlain() {
      output += escapeHTML(plain);
      plain = "";
    }

    while (position < text.length) {
      if (text.startsWith(context.prefix + ":", position)) {
        const marker = markerPattern.exec(text.slice(position));

        if (marker) {
          flushPlain();

          const node = context.tokens[Number(marker[1])];
          output += escapeHTML(node?.tex || marker[0]);

          position += marker[0].length;
          continue;
        }
      }

      if (text[position] !== "\\") {
        if (text[position] === "~") {
          flushPlain();
          output += "&nbsp;";
        } else {
          plain += text[position];
        }

        position++;
        continue;
      }

      const match = /^\\([A-Za-z]+|[\s\S])/.exec(
        text.slice(position)
      );

      if (!match) {
        plain += text[position++];
        continue;
      }

      const command = match[1];
      const commandEnd = position + match[0].length;

      let end = commandEnd;
      let replacement = null;

      if (command === "\\") {
        replacement = "<br>";

        const spacing = readGroup(text, end, "[", "]");

        if (spacing) {
          end = spacing.end;
        }
      } else if (
        INLINE_TAGS.has(command) ||
        ["url", "href", "ref", "eqref"].includes(command)
      ) {
        const first = readGroup(text, end);

        if (first) {
          end = first.end;

          if (INLINE_TAGS.has(command)) {
            const tag = INLINE_TAGS.get(command);

            replacement =
              `<${tag}>` +
              renderInline(first.value, context, interactive) +
              `</${tag}>`;
          } else if (command === "ref" || command === "eqref") {
            replacement = renderReference(
              command,
              first.value,
              context,
              interactive
            );
          } else {
            const url = first.value.replace(
              /\\([%&#_$])/g,
              "$1"
            );

            let label = escapeHTML(url);

            if (command === "href") {
              const second = readGroup(text, end);

              if (!second) {
                plain += text.slice(position, commandEnd);
                position = commandEnd;
                continue;
              }

              end = second.end;

              label = renderInline(
                second.value,
                context,
                interactive
              );
            }

            replacement = interactive
              ? (
                `<a href="${escapeHTML(safeURL(url))}">` +
                label +
                "</a>"
              )
              : label;
          }
        }
      } else if (command === "cite") {
        const note = readGroup(text, end, "[", "]");

        if (note) {
          end = note.end;
        }

        const keys = readGroup(text, end);

        if (keys) {
          end = keys.end;

          replacement = renderCitation(
            note?.value || "",
            keys.value,
            context,
            interactive
          );
        }
      } else if (command === "etalchar") {
        const group = readGroup(text, end);

        if (group) {
          end = group.end;

          replacement =
            "<sup>" +
            renderInline(group.value, context, false) +
            "</sup>";
        }
      } else if (
        ["protect", "relax", "ignorespaces"].includes(command)
      ) {
        replacement = "";
      } else if (command === "newblock") {
        replacement = " ";
      } else if (command === "bysame") {
        replacement = "——";
      } else if (/^[%&#_${}]$/.test(command)) {
        replacement = escapeHTML(command);
      } else if (command === "textbackslash") {
        replacement = "\\";
      } else if (command === "quad") {
        replacement = "&emsp;";
      } else if (command === "qquad") {
        replacement = "&emsp;&emsp;";
      } else if (command === "," || command === ";") {
        replacement = "&#8201;";
      } else if (command === " ") {
        replacement = " ";
      }

      if (replacement === null) {
        plain += text.slice(position, commandEnd);
        position = commandEnd;
      } else {
        flushPlain();
        output += replacement;
        position = end;
      }
    }

    flushPlain();
    return output;
  }

  // ================================================================
  // ブロック変換
  // ================================================================

  function renderParagraphs(text, context, positions = null) {
    if (context.sourceMap && positions) {
      return renderMappedParagraphs(text, context, positions);
    }

    const cleaned = text
      .replace(/\\(?:smallskip|medskip|bigskip|par)\b/g, "\n\n")
      .replace(/\\noindent\b/g, "")
      .trim();

    if (!cleaned) {
      return "";
    }

    return cleaned
      .split(/\n\s*\n+/)
      .map((paragraph) => paragraph.trim())
      .filter(Boolean)
      .map((paragraph) => {
        const content = renderInline(
          paragraph.replace(/\s*\n\s*/g, " "),
          context
        );

        return `<p>${content}</p>`;
      })
      .join("\n");
  }

  // renderParagraphs と同じ分割を行い、各段落に元ソースの行範囲を付ける。
  function renderMappedParagraphs(text, context, positions) {
    let tracked = replaceTracked(
      text,
      positions,
      /\\(?:smallskip|medskip|bigskip|par)\b/g,
      "\n\n"
    );

    tracked = replaceTracked(
      tracked.text,
      tracked.positions,
      /\\noindent\b/g,
      ""
    );

    const output = [];
    const separator = /\n\s*\n+/g;
    const source = tracked.text;
    let cursor = 0;

    function emit(from, to) {
      const raw = source.slice(from, to);
      const paragraph = raw.trim();

      if (!paragraph) {
        return;
      }

      const first = from + (raw.length - raw.trimStart().length);
      const last = from + raw.trimEnd().length - 1;

      const content = renderInline(
        paragraph.replace(/\s*\n\s*/g, " "),
        context
      );

      const attributes = sourceAttributes(
        context,
        tracked.positions[first],
        tracked.positions[last]
      );

      output.push(`<p${attributes}>${content}</p>`);
    }

    let match;

    while ((match = separator.exec(source)) !== null) {
      emit(cursor, match.index);
      cursor = match.index + match[0].length;
    }

    emit(cursor, source.length);
    return output.join("\n");
  }

  function renderHeading(node, context) {
    const tag = node.level === 1 ? "h1" : "h2";

    const number = node.number
      ? `
        <span class="section-number">${escapeHTML(
          node.level === 1 ? node.number + "." : node.number
        )}</span>
      `.trim()
      : "";

    return `
      <${tag} id="${escapeHTML(node.id)}"${sourceAttributes(context, node.start)}>
        ${labelAnchors(node.labels)}
        ${number}
        ${renderInline(node.title, context)}
      </${tag}>
    `;
  }

  function renderTableOfContents(context) {
    const groups = [];

    for (const heading of context.headings) {
      if (heading.starred) {
        continue;
      }

      if (heading.level === 1) {
        groups.push({
          heading,
          children: []
        });
      } else if (groups.length > 0) {
        groups.at(-1).children.push(heading);
      } else {
        groups.push({
          heading,
          children: []
        });
      }
    }

    if (groups.length === 0) {
      return `
        <nav class="table-of-contents" aria-label="目次">
          <h2>目次</h2>
          <p>番号付きの見出しがありません。</p>
        </nav>
      `;
    }

    function headingLink(heading) {
      return `
        <a href="${escapeHTML(fragmentURL(heading.id))}">
          ${escapeHTML(heading.number)}
          ${renderInline(heading.title, context, false)}
        </a>
      `.trim();
    }

    const items = groups.map(({ heading, children }) => {
      const nested = children.length
        ? `
          <ol role="list">
            ${children.map((child) => {
              return `<li>${headingLink(child)}</li>`;
            }).join("\n")}
          </ol>
        `
        : "";

      return `
        <li>
          ${headingLink(heading)}
          ${nested}
        </li>
      `;
    }).join("\n");

    return `
      <nav class="table-of-contents" aria-label="目次">
        <h2>目次</h2>
        <ol role="list">
          ${items}
        </ol>
      </nav>
    `;
  }

  function renderParenthesis(side) {
    const path = side === "left"
      ? "M 13 2 C 2 20 2 80 13 98"
      : "M 3 2 C 14 20 14 80 3 98";

    return `
      <svg
        class="reason-paren reason-paren--${side}"
        viewBox="0 0 16 100"
        preserveAspectRatio="none"
        aria-hidden="true"
        focusable="false"
      >
        <path
          d="${path}"
          fill="none"
          stroke="currentColor"
          stroke-width="1.2"
          stroke-linecap="round"
          vector-effect="non-scaling-stroke"
        ></path>
      </svg>
    `;
  }

  function renderBox(node, context) {
    const environment = ENVIRONMENTS[node.name];

    const note = node.headingNote
      ? `
        <span class="theorem-note">(${renderInline(
          node.headingNote,
          context
        )})</span>
      `.trim()
      : "";

    const content = renderFlow(node.children, context);
    const anchors = labelAnchors(node.labels.slice(1));

    if (node.name === "proof") {
      return `
        <details
          class="theorem-box proof-box"${labelIdAttribute(node)}${sourceAttributes(context, node.start, node.end - 1)}
          data-toggle-key="${escapeHTML(node.toggleKey)}"
          style="--bar:${environment.color}"
          open
        >
          <summary class="box-title">
            ${anchors}
            <span>${environment.title}${note ? " " + note : ""}</span>
          </summary>
          <div class="proof-content">
            ${content}
            <div class="proof-end">⊣</div>
          </div>
        </details>
      `;
    }

    if (node.name === "reason") {
      const contentId = `${node.toggleKey}-content`;

      return `
        <div
          class="reason-box"${labelIdAttribute(node)}${sourceAttributes(context, node.start, node.end - 1)}
          data-toggle-key="${escapeHTML(node.toggleKey)}"
        >
          ${renderParenthesis("left")}
          <div class="reason-inner">
            <div class="reason-prefix">
              ${anchors}
              <button
                type="button"
                class="reason-toggle"
                aria-expanded="true"
                aria-controls="${escapeHTML(contentId)}"
                aria-label="理由を折り畳む"
              >▸</button>
              <span class="reason-because" aria-label="理由">∵</span>
            </div>
            <div
              class="reason-text"
              id="${escapeHTML(contentId)}"
            >
              ${content}
            </div>
          </div>
          ${renderParenthesis("right")}
        </div>
      `;
    }

    return `
      <div
        class="theorem-box"${labelIdAttribute(node)}${sourceAttributes(context, node.start, node.end - 1)}
        style="--bar:${environment.color}"
      >
        <div class="box-title">
          ${anchors}${environment.title}
          <span class="number">${escapeHTML(node.number)}</span>
          ${note}
        </div>
        <div class="theorem-content">
          ${content}
        </div>
      </div>
    `;
  }

  function renderList(node, context) {
    const tag = node.name === "itemize" ? "ul" : "ol";

    const className = node.name === "phase"
      ? ' class="phase"'
      : "";

    const preamble = renderFlow(node.children, context);

    const items = node.items.map((item) => {
      const itemLabel = item.headingNote
        ? renderInline(item.headingNote, context)
        : "";

      const content = renderFlow(item.children, context);

      const itemSource = sourceAttributes(context, item.start);

      if (!item.headingNote) {
        return `<li${itemSource}>${content}</li>`;
      }

      return `
        <li class="custom-item"${itemSource}>
          <span class="item-label">${itemLabel}</span>
          <div class="item-body">${content}</div>
        </li>
      `;
    }).join("\n");

    return `
      ${preamble}
      <${tag}${className}${sourceAttributes(context, node.start, node.end - 1)}>
        ${items}
      </${tag}>
    `;
  }

  function renderBibliography(node, context) {
    const preamble = renderFlow(node.children, context);
    let labelWidth = 5;

    const items = node.items.map((item) => {
      const label = renderBibliographyLabel(
        item.displayLabel,
        context
      );

      labelWidth = Math.max(
        labelWidth,
        Array.from(htmlToText(label)).length + 2
      );

      const backref = context.citedKeys.has(item.key)
        ? `
          <a
            class="backref"
            href="${escapeHTML(fragmentURL("cite-" + item.key))}"
            aria-label="本文の引用へ戻る"
          >↩</a>
        `
        : "";

      return `
        <li
          class="bibliography-entry"
          id="${escapeHTML(item.bibId)}"${sourceAttributes(context, item.start)}
        >
          <span class="bib-label">[${label}]</span>
          <div class="bib-content">
            ${labelAnchors(item.labels)}
            ${renderFlow(item.children, context)}
            ${backref}
          </div>
        </li>
      `;
    }).join("\n");

    labelWidth = Math.min(labelWidth, 18);

    return `
      <section class="bibliography"${sourceAttributes(context, node.start, node.end - 1)}>
        <h2>参考文献</h2>
        ${preamble}
        <ol
          class="bibliography-list"
          role="list"
          style="--bib-label-width:${labelWidth}ch"
        >
          ${items}
        </ol>
      </section>
    `;
  }

  // ================================================================
  // 図（\includegraphics・figure 環境）
  // ================================================================

  // \includegraphics のパスから、公開ページでの URL を作る。
  // http(s) の URL と / で始まるパスはそのまま、それ以外は .txt からの相対パス。
  function defaultImageURL(path) {
    const url = safeURL(path);

    if (url === "#") {
      return null;
    }

    if (/^[a-z][a-z0-9+.-]*:/i.test(url)) {
      return url;
    }

    // 空白や日本語のファイル名に備えて符号化する。既存の %XX は保つ。
    return encodeURI(url).replace(/%25([0-9A-Fa-f]{2})/g, "%$1");
  }

  function lengthToCSS(value, key, context) {
    const text = value.trim();

    const relative = text.match(
      /^(\d+(?:\.\d+)?|\.\d+)?\s*\\([a-z]+)$/
    );

    if (relative && RELATIVE_LENGTHS.has(relative[2])) {
      const ratio = relative[1] === undefined ? 1 : Number(relative[1]);
      return `${Math.round(ratio * 10000) / 100}%`;
    }

    const absolute = text.match(CSS_LENGTH);

    if (absolute) {
      return `${absolute[1]}${absolute[2]}`;
    }

    context.issues.push(
      `\\includegraphics の ${key}=${text} は解釈できないため無視します。` +
      "0.6\\linewidth、8cm、300px、50% のように指定してください。"
    );

    return null;
  }

  // "width=0.6\linewidth, alt={...}" を分解する。値の中の { } と , を考慮する。
  function splitKeyValues(text) {
    const entries = [];
    let depth = 0;
    let current = "";

    for (const character of text) {
      if (character === "{") {
        depth++;
      } else if (character === "}") {
        depth = Math.max(0, depth - 1);
      }

      if (character === "," && depth === 0) {
        entries.push(current);
        current = "";
      } else {
        current += character;
      }
    }

    entries.push(current);

    return entries
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => {
        const separator = entry.indexOf("=");

        const key = separator < 0
          ? entry
          : entry.slice(0, separator).trim();

        let value = separator < 0
          ? ""
          : entry.slice(separator + 1).trim();

        if (value.startsWith("{") && value.endsWith("}")) {
          value = value.slice(1, -1).trim();
        }

        return { key, value };
      });
  }

  function captionText(figure, context) {
    if (!figure?.caption) {
      return "";
    }

    return htmlToText(
      renderInline(figure.caption.value, context, false)
    ).replace(/\s+/g, " ").trim();
  }

  // 画像1枚を、横並びの行に入る要素として描画する。
  // 幅の指定は行（本文の幅）に対する flex-basis にし、行に収まらない分は
  // 各画像を幅の比のまま縮める（flex-shrink）。
  function renderImage(node, context) {
    let width = null;
    let height = null;
    let alt = null;

    for (const { key, value } of splitKeyValues(node.options)) {
      if (key === "width" || key === "height") {
        const css = lengthToCSS(value, key, context);

        if (css && key === "width") {
          width = css;
        } else if (css) {
          height = css;
        }
      } else if (key === "alt") {
        alt = htmlToText(renderInline(value, context, false)).trim();
      } else if (key === "keepaspectratio") {
        // 縦横比は常に保つ。
      } else {
        context.issues.push(
          `\\includegraphics のオプション「${key}」には対応していません（width・height・alt のみ）。`
        );
      }
    }

    const path = restoreMathTokens(node.path, context);
    context.images.push(path);

    if (alt === null) {
      alt = captionText(node.figure, context) ||
        path.split("/").pop();
    }

    const attributes = sourceAttributes(context, node.start);

    function missing(message) {
      return `
        <span class="graphic graphic-missing"${attributes}>${escapeHTML(message)}</span>
      `.trim();
    }

    if (defaultImageURL(path) === null) {
      context.issues.push(
        `画像のパス「${path}」は使えません。相対パス、/ で始まるパス、http(s) の URL のいずれかにしてください。`
      );

      return missing(`画像「${path}」を表示できません。`);
    }

    const url = context.resolveImage
      ? context.resolveImage(path)
      : defaultImageURL(path);

    if (!url) {
      // resolveImage を渡すのはエディターだけなので、文言はエディター向け。
      return missing(
        `画像「${path}」はプレビューに読み込まれていません（「図を読み込む」で選んでください）。`
      );
    }

    const itemStyle = width
      ? ` style="${escapeHTML(`flex-basis:${width}`)}"`
      : "";

    const imageStyles = [];

    if (width) {
      imageStyles.push("width:100%");
    }

    if (height) {
      imageStyles.push(`height:${height}`);

      if (!width) {
        imageStyles.push("width:auto");
      }

      // 縮めたときに縦横比を崩さない。
      imageStyles.push("object-fit:contain", "object-position:50% 100%");
    }

    const imageStyle = imageStyles.length
      ? ` style="${escapeHTML(imageStyles.join(";"))}"`
      : "";

    return `
      <span class="graphic${width ? " graphic-sized" : ""}"${itemStyle}${attributes}><img
          src="${escapeHTML(url)}"
          alt="${escapeHTML(alt)}"${imageStyle}
          loading="lazy"
          decoding="async"
        ></span>
    `.trim();
  }

  // 続けて書いた \includegraphics をまとめて描画する。
  // rows は画像ノードの配列の配列（空行か \\ で行を改める）。
  function renderGraphics(rows, context) {
    const body = rows.map((row) => {
      const first = row[0];
      const last = row.at(-1);

      const attributes = sourceAttributes(
        context,
        first.start,
        last === first ? null : last.start
      );

      return `
        <div class="graphic-row"${attributes}>
          ${row.map((node) => renderImage(node, context)).join("\n")}
        </div>
      `;
    }).join("\n");

    return `
      <div class="graphics">
        ${body}
      </div>
    `;
  }

  function renderCaption(node, context) {
    const figure = node.figure;
    const content = renderInline(node.value, context).trim();

    return `
      <figcaption${sourceAttributes(context, node.start)}>
        <span class="figure-number">図 ${escapeHTML(figure.number ?? "")}</span>${
          content ? `<span class="caption-text">${content}</span>` : ""
        }
      </figcaption>
    `;
  }

  function renderFigure(node, context) {
    const content = renderFlow(node.children, context);
    const anchors = labelAnchors(node.labels.slice(1));

    return `
      <figure class="figure"${labelIdAttribute(node)}${sourceAttributes(context, node.start, node.end - 1)}>
        ${anchors}
        ${content}
      </figure>
    `;
  }

  function renderEnvironment(node, context) {
    if (ENVIRONMENTS[node.name]) {
      return renderBox(node, context);
    }

    if (LIST_NAMES.has(node.name)) {
      return renderList(node, context);
    }

    if (node.name === "thebibliography") {
      return renderBibliography(node, context);
    }

    if (FIGURE_NAMES.has(node.name)) {
      return renderFigure(node, context);
    }

    const content = renderFlow(node.children, context);

    if (node.name === "document") {
      return content;
    }

    return `
      <div class="unsupported-environment">
        <p>${escapeHTML("\\begin{" + node.name + "}")}</p>
        ${content}
        <p>${escapeHTML("\\end{" + node.name + "}")}</p>
      </div>
    `;
  }

  function renderFlow(nodes, context) {
    const output = [];
    let text = "";
    let positions = context.sourceMap ? [] : null;

    function flushText() {
      const rendered = renderParagraphs(text, context, positions);

      if (rendered) {
        output.push(rendered);
      }

      text = "";
      positions = context.sourceMap ? [] : null;
    }

    // 画像と画像の間にあってよい文字列（空白・空行・\\）。
    const GRAPHIC_SEPARATOR = /^(?:\s|\\\\)*$/;
    const ROW_BREAK = /\n[^\S\n]*\n|\\\\/;

    for (let index = 0; index < nodes.length; index++) {
      const node = nodes[index];

      if (node.type === "image") {
        flushText();

        const rows = [[node]];
        let breakRow = false;
        let next = index + 1;

        while (next < nodes.length) {
          const candidate = nodes[next];

          if (
            (candidate.type === "label" && !candidate.standalone) ||
            (
              candidate.type === "text" &&
              GRAPHIC_SEPARATOR.test(candidate.value)
            )
          ) {
            if (candidate.type === "text" && ROW_BREAK.test(candidate.value)) {
              breakRow = true;
            }

            next++;
            continue;
          }

          if (candidate.type !== "image") {
            break;
          }

          if (breakRow) {
            rows.push([candidate]);
          } else {
            rows.at(-1).push(candidate);
          }

          breakRow = false;
          index = next;
          next++;
        }

        output.push(renderGraphics(rows, context));
        continue;
      }

      if (node.type === "text") {
        text += node.value;

        if (positions) {
          for (const piece of node.pieces || []) {
            for (let index = 0; index < piece.length; index++) {
              positions.push(piece.start + index);
            }
          }
        }

        continue;
      }

      if (node.type === "label") {
        if (node.standalone) {
          flushText();
          output.push(labelAnchors(node.labels));
        }

        continue;
      }

      flushText();

      if (node.type === "heading") {
        output.push(renderHeading(node, context));
      } else if (node.type === "math") {
        output.push(`
          <div class="math-display"${mathSourceAttributes(node, context)}${
            context.sourceMap
              ? ` data-eq-start="${node.equationStart ?? 0}"`
              : ""
          }>
            ${labelAnchors(node.labels)}
            ${escapeHTML(node.tex)}
          </div>
        `);
      } else if (node.type === "toc") {
        output.push(renderTableOfContents(context));
      } else if (node.type === "caption") {
        output.push(renderCaption(node, context));
      } else if (node.type === "environment") {
        output.push(renderEnvironment(node, context));
      }
    }

    flushText();
    return output.join("\n");
  }

  // ================================================================
  // 診断・変換の入口
  // ================================================================

  function inspectReferences(source) {
    const labels = labelsIn(source);

    const references = matchedValues(
      source,
      /\\(?:ref|eqref)\s*\{([^{}]+)\}/g
    );

    const bibliographyKeys = matchedValues(
      source,
      /\\bibitem(?:\s*\[[^\]]*\])?\s*\{([^{}]+)\}/g
    );

    const citations = citedKeysIn(source);
    const issues = [];

    function inspectDuplicates(values, description) {
      const counts = new Map();

      for (const value of values) {
        counts.set(value, (counts.get(value) || 0) + 1);
      }

      for (const [value, count] of counts) {
        if (count > 1) {
          issues.push(
            `${description}「${value}」が重複しています。`
          );
        }
      }
    }

    inspectDuplicates(labels, "ラベル");
    inspectDuplicates(bibliographyKeys, "文献キー");

    const definedLabels = new Set(labels);
    const definedBibliography = new Set(bibliographyKeys);

    for (const key of new Set(references)) {
      if (!definedLabels.has(key)) {
        issues.push(
          `参照「${key}」のラベルが定義されていません。`
        );
      }
    }

    for (const key of new Set(citations)) {
      if (!definedBibliography.has(key)) {
        issues.push(
          `引用キー「${key}」に対応する \\bibitem がありません。`
        );
      }
    }

    return issues;
  }
  function compileDocument(source, previous = [], options = {}) {
    const clean = normalizeSource(source);
    const context = createContext(clean);

    if (options.sourceMap) {
      context.sourceMap = true;
      context.lineStarts = computeLineStarts(clean);
    }

    if (typeof options.resolveImage === "function") {
      context.resolveImage = options.resolveImage;
    }

    context.protectedSource = protectMath(clean, context);

    const root = parseDocumentTree(context.protectedSource, context);

    decorateTree(root, context);

    const toggles = reconcileToggles(
      collectToggles(root, context),
      previous
    );

    const html = renderFlow(root.children, context);

    // \title・\author・\date。宣言がなければnull。
    // 最初のsectionを文書の表題に流用しない。
    const meta = {};

    for (const [name, value] of Object.entries(context.declared)) {
      if (value === null) {
        meta[name] = null;
        continue;
      }

      const rendered = value.trim()
        ? renderInline(value, context, false)
        : "";

      meta[name] = {
        html: rendered,
        text: htmlToText(rendered).trim()
      };
    }

    return {
      html,
      meta,
      toggles,
      images: Array.from(new Set(context.images)),
      issues: Array.from(new Set([
        ...inspectReferences(clean),
        ...context.issues
      ]))
    };
  }

  // ================================================================
  // 公開用HTML
  // ================================================================

  function plainField(text) {
    const value = text.trim();

    return {
      html: escapeHTML(value),
      text: value
    };
  }

  function buildPage(source) {
    const result = compileDocument(source);
    const site = DEFAULT_SITE;

    const titleText = result.meta.title?.text || "無題";
    const headingHTML = result.meta.title?.html || "無題";

    const title = escapeHTML(titleText);
    const siteName = escapeHTML(site.siteName.trim());

    const pageTitle = siteName
      ? `${title} | ${siteName}`
      : title;

    const urls = Object.fromEntries(
      URL_KEYS.map((key) => [key, escapeHTML(safeURL(site[key]))])
    );

    const author = result.meta.author ?? plainField(site.author);
    const date = result.meta.date ?? plainField(site.updatedDate);
    const metadata = [];

    if (author.text) {
      metadata.push(`<span>著者：${author.html}</span>`);
    }

    if (date.text) {
      const datetime = /^\d{4}-\d{2}-\d{2}$/.test(date.text)
        ? ` datetime="${escapeHTML(date.text)}"`
        : "";

      metadata.push(
        `<span>更新日：<time${datetime}>${date.html}</time></span>`
      );
    }

    const metadataHTML = metadata.length
      ? `
        <div class="document-meta">
          ${metadata.join('\n<span class="meta-separator">·</span>\n')}
        </div>
      `
      : "";

    const brandHTML = site.headerImageUrl.trim()
      ? `
        <img
          src="${urls.headerImageUrl}"
          alt="${siteName || "ホーム"}"
        >
      `
      : `
        <span class="site-brand-text">
          ${siteName || "ホーム"}
        </span>
      `;

    const html = `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${pageTitle}</title>
  <link
    rel="stylesheet"
    href="${urls.stylesheetUrl || "../style.css"}"
  >

  <script id="mathjax-config">
window.MathJax = ${JSON.stringify(MATHJAX_CONFIG, null, 2)};
  </script>

  <script
    id="mathjax-loader"
    defer
    src="${escapeHTML(MATHJAX_URL)}"
  ></script>
</head>

<body class="public-page" id="top">
  <header class="site-header">
    <a class="site-brand" href="${urls.homeUrl}">
      ${brandHTML}
    </a>

    <nav class="site-nav" aria-label="メインナビゲーション">
      <a href="${urls.homeUrl}">ホーム</a>
      <a href="${urls.materialsUrl}">資料</a>
      <a href="${urls.updatesUrl}">更新履歴</a>
      <a href="${urls.aboutUrl}">このサイトについて</a>
      <a href="${urls.linksUrl}">リンク</a>
    </nav>
  </header>

  <div class="public-document" id="public-document">
    <header class="document-heading">
      <h1>${headingHTML}</h1>
      ${metadataHTML}
    </header>

    <main class="paper">
      ${result.html}

      <p class="back-to-top">
        <a href="#top">ページ先頭に戻る</a>
      </p>

      <p>
        <a href="${urls.materialsUrl}">資料一覧に戻る</a>
      </p>
    </main>
  </div>

  <footer class="site-footer">
    © ${escapeHTML(site.copyrightYear)} ${escapeHTML(site.copyrightHolder)}
  </footer>

  <script id="document-runtime">
const MystyleRuntime = (${createRuntime.toString()})();
  </script>

  <script>
    MystyleRuntime
      .typeset(document.getElementById("public-document"))
      .then(() => MystyleRuntime.revealHash())
      .catch((error) => {
        console.error(error);
        MystyleRuntime.revealHash();
      });
  </script>
</body>
</html>
`;

    return {
      html,
      images: result.images,
      issues: result.issues
    };
  }

  return Object.freeze({
    DEFAULT_SITE,
    MATHJAX_URL,
    createMathJaxConfig,
    createRuntime,
    compileDocument,
    buildPage,
    escapeHTML
  });
});
