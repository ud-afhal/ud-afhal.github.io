// 元のeditor.htmlから抽出した共通コンパイラー。


let nextToggleId = 0;

// コンパイラーが生成するHTMLを、DOMなしでプレーンテキスト化する。
// エンティティは一度だけ復号し、文字列化したタグを再解釈しない。
function htmlText(html) {
  const named = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: "\u00a0",
    emsp: "\u2003"
  };

  return String(html)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(
      /&(#x[0-9a-f]+|#[0-9]+|amp|lt|gt|quot|apos|nbsp|emsp);/gi,
      (whole, entity) => {
        if (entity[0] !== "#") {
          return named[entity.toLowerCase()] ?? whole;
        }
        const hex = entity[1].toLowerCase() === "x";
        const value = Number.parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10);
        return value > 0 && value <= 0x10ffff &&
          !(value >= 0xd800 && value <= 0xdfff)
          ? String.fromCodePoint(value)
          : "\ufffd";
      }
    );
}

function validateDate(value) {
  const date = String(value).trim();
  if (!date) return "";

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) {
    throw new Error("\\date は YYYY-MM-DD 形式で指定してください。");
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

  if (year < 1 || month < 1 || month > 12 ||
      day < 1 || day > days[month - 1]) {
    throw new Error("\\date に実在しない日付が指定されています。");
  }
  return date;
}


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

      const LIST_NAMES = new Set([
        "itemize",
        "enumerate",
        "phase"
      ]);

      

function escapeHTML(value) {
        return String(value ?? "")
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")
          .replace(/'/g, "&#39;");
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
          declaredTitle: "", declaredAuthor: "", declaredDate: "",
          protectedSource: ""
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
            labels: []
          };

          const index = context.tokens.push(node) - 1;
          const marker = tokenMarker(context, index);

          output += source.slice(cursor, match.index);
          output += display ? `\n${marker}\n` : marker;

          cursor = closing.end;
          pattern.lastIndex = closing.end;
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
          String.raw`|\\(begin|end|section|subsection|title|author|date|tableofcontents|maketitle|item|bibitem|label)\b`,
          "g"
        );

        let cursor = 0;
        let match;

        function append(node) {
          const target = stack.at(-1).target;
          const previous = target.at(-1);

          if (node.type === "text" && previous?.type === "text") {
            previous.value += node.value;
          } else {
            target.push(node);
          }
        }

        function appendText(value) {
          if (value) {
            append({
              type: "text",
              value
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

        while ((match = pattern.exec(source)) !== null) {
          if (match[1] !== undefined) {
            const node = context.tokens[Number(match[1])];

            if (node.type === "inline-math") {
              continue;
            }

            appendText(source.slice(cursor, match.index));
            append(node);

            cursor = pattern.lastIndex;
            continue;
          }

          if (isEscaped(source, match.index)) {
            continue;
          }

          appendText(source.slice(cursor, match.index));

          const command = match[2];
          let end = pattern.lastIndex;

          if (command === "begin" || command === "end") {
            const group = readGroup(source, end);

            if (!group) {
              context.issues.push(
                `\\${command} の環境名を確認してください。`
              );

              appendText(match[0]);
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
                }

                if (
                  !ENVIRONMENTS[name] &&
                  !LIST_NAMES.has(name) &&
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

                  appendText(source.slice(match.index, end));
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
            command === "title" ||
            command === "author" ||
            command === "date"
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

              appendText(source.slice(match.index, end));
            } else {
              end = group.end;

              if (["title", "author", "date"].includes(command)) {
                const property = {
                  title: "declaredTitle",
                  author: "declaredAuthor",
                  date: "declaredDate"
                }[command];
                context[property] = group.value;
              } else {
                append({
                  type: "heading",
                  level: command === "section" ? 1 : 2,
                  title: group.value,
                  starred,
                  labels: []
                });
              }
            }
          } else if (command === "label") {
            const group = readGroup(source, end);

            if (!group) {
              context.issues.push(
                "\\label の引数を確認してください。"
              );

              appendText(match[0]);
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

              appendText(source.slice(match.index, end));
            } else {
              const item = {
                type: command === "item" ? "item" : "bibitem",
                key,
                headingNote: note?.value.trim() || "",
                children: [],
                labels: []
              };

              frame.node.items.push(item);
              frame.target = item.children;
            }
          } else if (command === "tableofcontents") {
            append({
              type: "toc"
            });
          }

          cursor = end;
          pattern.lastIndex = end;
        }

        appendText(source.slice(cursor));

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

                const labelIdentity = restoreMathTokens(
                  item.displayLabel,
                  context
                );

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
          descriptor.key ||= `fold-${++nextToggleId}`;
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

        const tags = {
          textbf: "strong",
          emph: "em",
          textit: "em",
          texttt: "code"
        };

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
            tags[command] ||
            ["url", "href", "ref", "eqref"].includes(command)
          ) {
            const first = readGroup(text, end);

            if (first) {
              end = first.end;

              if (tags[command]) {
                const tag = tags[command];

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

      function renderParagraphs(text, context) {
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
          <${tag} id="${escapeHTML(node.id)}">
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
              class="theorem-box proof-box"${labelIdAttribute(node)}
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
              class="reason-box"${labelIdAttribute(node)}
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
            class="theorem-box"${labelIdAttribute(node)}
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

          if (!item.headingNote) {
            return `<li>${content}</li>`;
          }

          return `
            <li class="custom-item">
              <span class="item-label">${itemLabel}</span>
              <div class="item-body">${content}</div>
            </li>
          `;
        }).join("\n");

        return `
          ${preamble}
          <${tag}${className}>
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

          const labelText = htmlText(label);

          labelWidth = Math.max(
            labelWidth,
            Array.from(labelText).length + 2
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
              id="${escapeHTML(item.bibId)}"
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
          <section class="bibliography">
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

        function flushText() {
          const rendered = renderParagraphs(text, context);

          if (rendered) {
            output.push(rendered);
          }

          text = "";
        }

        for (const node of nodes) {
          if (node.type === "text") {
            text += node.value;
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
              <div class="math-display">
                ${labelAnchors(node.labels)}
                ${escapeHTML(node.tex)}
              </div>
            `);
          } else if (node.type === "toc") {
            output.push(renderTableOfContents(context));
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

      function compileDocument(source, previous = []) {
        nextToggleId = previous.reduce((maximum, item) => {
          const match = /^fold-(\d+)$/.exec(item.key || "");
          return Math.max(maximum, match ? Number(match[1]) : 0);
        }, 0);
        const clean = normalizeSource(source);
        const context = createContext(clean);

        context.protectedSource = protectMath(clean, context);

        const root = parseDocumentTree(
          context.protectedSource,
          context
        );

        decorateTree(root, context);

        const toggles = reconcileToggles(
          collectToggles(root, context),
          previous
        );

        const html = renderFlow(root.children, context);

        // 最初のsectionを文書の表題に流用しない。
        const titleHTML = context.declaredTitle.trim()
          ? renderInline(context.declaredTitle, context, false)
          : "";

        const authorHTML = context.declaredAuthor.trim()
          ? renderInline(context.declaredAuthor, context, false)
          : "";
        const date = validateDate(
          restoreMathTokens(context.declaredDate, context)
        );

        return {
          html,
          title: htmlText(titleHTML).trim(),
          titleHTML,
          author: htmlText(authorHTML).trim(),
          authorHTML,
          date,
          toggles,
          issues: Array.from(new Set([
            ...inspectReferences(clean),
            ...context.issues
          ]))
        };
      }

      


// 旧エディターのサイト設定初期値。
// 著者と更新日はサイト設定ではなく、ソースのメタデータを使用する。
const SITE = Object.freeze({
  siteName: "",
  headerImageUrl: "/images/header.png",
  stylesheetUrl: "/style.css",
  homeUrl: "/index.html",
  materialsUrl: "/materials.html",
  updatesUrl: "/updates.html",
  aboutUrl: "/about.html",
  linksUrl: "/links.html",
  copyrightHolder: "Ud.afhal",
  copyrightYear: "2026"
});

function renderDocument(result) {
  const title = result.titleHTML || "無題";
  const metadata = [];

  if (result.authorHTML) {
    metadata.push(`<span class="document-author">${result.authorHTML}</span>`);
  }
  if (result.date) {
    metadata.push(
      `<time datetime="${result.date}">${result.date}</time>`
    );
  }

  return `
<header class="document-heading">
  <h1>${title}</h1>
  ${metadata.length ? `<div class="document-meta">${
    metadata.join('<span class="meta-separator" aria-hidden="true">／</span>')
  }</div>` : ""}
</header>
<article class="paper">
${result.html}
</article>`;
}

function buildPublicHTML(result) {
  const title = result.title || "無題";
  const navigation = [
    [SITE.homeUrl, "ホーム"],
    [SITE.materialsUrl, "資料"],
    [SITE.updatesUrl, "更新履歴"],
    [SITE.aboutUrl, "サイト紹介"],
    [SITE.linksUrl, "リンク集"]
  ].map(([url, label]) =>
    `<a href="${escapeHTML(url)}">${label}</a>`
  ).join("\n");

  return `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHTML(title)}</title>
  ${result.author ? `<meta name="author" content="${escapeHTML(result.author)}">` : ""}
  <link rel="stylesheet" href="${escapeHTML(SITE.stylesheetUrl)}">
  <link rel="stylesheet" href="/materials/compiler/document.css">
  <script defer src="/materials/compiler/mathjax-config.js"></script>
  <script id="mathjax-loader" defer src="/MathJax-4.1.3/tex-chtml.js"></script>
  <script defer src="/materials/compiler/document-runtime.js"></script>
  <script defer src="/materials/compiler/publication-init.js"></script>
</head>
<body class="public-page" id="top">
  <header class="site-header">
    <a class="site-brand" href="${escapeHTML(SITE.homeUrl)}">
      <img src="${escapeHTML(SITE.headerImageUrl)}" alt="ホーム">
    </a>
    <nav class="site-nav" aria-label="サイト内ナビゲーション">
      ${navigation}
    </nav>
  </header>
  <main class="public-document" id="public-document">
    ${renderDocument(result)}
    <p class="back-to-top">
    <a href="#top">ページ先頭に戻る</a>
    </p>
    <p><a href="/materials.html">資料一覧に戻る</a></p>
  </main>
  <footer class="site-footer">
    <p>© ${escapeHTML(SITE.copyrightYear)} ${escapeHTML(SITE.copyrightHolder)}</p>
  </footer>
</body>
</html>
`;
}

export {
  compileDocument,
  renderDocument,
  buildPublicHTML
};
