# 資料サイト自動ビルド仕様（LLM向け）

Nov 3, 2026 · @Ud.afhal

## 目的・前提・ユーザー制約

個人サイト ud-afhal.github.io（GitHub Pages）の資料を、LaTeX風 `.txt` から自動で HTML 化して公開し、資料一覧も自動更新する。本書は、別の LLM セッションへこの作業を引き継ぐための仕様である。

- ユーザー: 公理的集合論専攻の大学院生。回答は数学者・大学院生として厳密に、日本語で行う。
- 目的 1: `.txt` から HTML への変換を、`editor.html` と同一のロジックで行う。
- 目的 2: `.txt` の `\title`・`\date` から、資料一覧のデータを更新する。
- 目的 3: GitHub Actions で、ビルドから Pages 公開までを自動化する。

ユーザーが明示した制約は次のとおり。

- `editor.html` の外見と仕様は変えない。不要になった入力欄だけを削除する。
- サイト設定の入力欄の値は既定値とし、表題・著者・日付はソースの `\title`・`\author`・`\date` から読む。
- 変換ライブラリ `mystyle.js` に、コマンドライン機能を統合しない（`editor.html` の挙動を保つため）。資料一覧の更新と HTML の生成は、別の JS ファイルにする。
- 生成した HTML は `_site` にだけ出力する。ファイル構成に変更があれば、自動で更新して公開する。
- 資料一覧のソース `materials-auto.js` を先に書き換え、その後で `_site` に反映する。
- GitHub Pages の公開方法は「Actions でデプロイ」とする。
- 変換と一覧化の対象は `materials/notes`、`materials/presentations`、`materials/drafts` の 3 フォルダだけとする。
- ユーザーは CLI や `_site` の概念に不慣れである（説明済み）。専門用語には説明を添える。
- 実装前に仕様確認を求められた場合は、実装せず確認から始める。

## リポジトリ構成（確認済み／未確認）

対象は `ud-afhal/ud-afhal.github.io` の `main` ブランチ。ルート直下は公開リポジトリのページで確認し、`materials/` の中身はユーザーの申告による。

```text
ud-afhal.github.io/
├─ .github/workflows/deploy.yml      新規（旧 compile-txt.yml は削除する）
├─ .gitignore                        新規（_site/ と node_modules/）
├─ scripts/                          新規
│   ├─ common.js
│   ├─ update-materials.js
│   └─ compile.js
├─ materials/
│   ├─ editor.html                   編集用ページ（公開側にも含まれる）
│   ├─ mystyle.js                    変換ライブラリ
│   ├─ notes/*.txt
│   ├─ presentations/*.txt
│   └─ drafts/*.txt
├─ materials-auto.js                 資料一覧（データ行のみ自動更新）
├─ index.html  about.html  links.html  materials.html  updates.html
├─ site.js  style.css  robots.txt  README.md
├─ images/
└─ MathJax-4.1.3/
```

- 確認済み: ルート直下のファイル一覧。`materials/` には `editor.html`・`mystyle.js` と 3 フォルダがあり、`.txt` 以外のファイルはない（ユーザーの申告）。
- 未確認: `materials/` と `.github/workflows/` の中身。GitHub の該当ページは自動アクセスが拒否され、取得できなかった。
- 未確認: 既存の各 HTML・`site.js`・`style.css` の内容。`generate.py` はルートに見当たらない。

## 設計決定事項と理由

| 決定 | 理由 |
| --- | --- |
| 公開用フォルダは `_site` | Actions デプロイで慣習的に使われる名前（Jekyll の出力先と同じ）。ユーザーは `.site` と認識していたが、`upload-pages-artifact` v4 以降はドット始まりのファイルを既定で含めないため避けた。 |
| `mystyle.js` は DOM に依存しない変換ライブラリのみ | `editor.html` と共有するため。CLI の統合はユーザーが拒否した。 |
| 一覧の更新（`update-materials.js`）と HTML の生成（`compile.js`）を別ファイルにする | ユーザーの指定。 |
| 生成物は `_site` にだけ出力し、リポジトリにはコミットしない | ユーザーの指定。例外は `materials-auto.js` のデータ行のみ。 |
| 全 push で `_site` を再構築して再デプロイする | 公開物が `_site` に変わったため、`style.css` などの変更でも再公開が必要。 |
| `editor.html` の「公開ページの表題」入力欄を廃止し、`\title` に一本化する | エディタと CI の出力を一致させるため。 |
| 変換に 1 件でも失敗したら、ビルド全体を異常終了する | 壊れたサイトを公開しないため。 |
| `txt` のソースは `_site` にコピーしない | 公開する必要がないため。`robots.txt` は対象外でコピーする。 |

## materials/mystyle.js の仕様

`mystyle.js` は UMD 形式の単一ファイルである。ブラウザでは `window.Mystyle`、Node では `module.exports` として公開される。変換部は DOM に依存せず、`document` を使うのはブラウザ専用の `createRuntime` と、出力テンプレートの文字列内だけである。

| 公開名 | 内容 |
| --- | --- |
| `compileDocument(source, previous = [])` | `{ html, meta, toggles, issues }` を返す。`meta.title`・`meta.author`・`meta.date` は、未宣言なら `null`、宣言済みなら `{ html, text }`。`previous` は証明・理由の開閉状態の引き継ぎ用で、`editor.html` だけが渡す。 |
| `buildPage(source)` | 公開用ページ全体を `{ html, issues }` で返す。 |
| `createMathJaxConfig()` | MathJax 設定（独自マクロ 34 個を含む）の複製を返す。 |
| `createRuntime()` | 証明・理由の開閉、MathJax 組版、ハッシュ移動を行うブラウザ用ランタイムを返す。公開ページには、この関数の本文をそのまま埋め込む。 |
| `escapeHTML`、`DEFAULT_SITE`、`MATHJAX_URL` | 補助関数と既定値。 |

表題・著者・更新日の規則は次のとおり。

- `\title`・`\author`・`\date` を本文から取り除いて読み取る。後に書いたものが優先される。
- `\title` がなければ「無題」にする。
- `\author` がなければ `DEFAULT_SITE.author` を使う。`\author{}` と空で書いた場合は、著者を表示しない。
- `\date` がなければ `DEFAULT_SITE.updatedDate`（空）を使い、空なら更新日を表示しない。値が `YYYY-MM-DD` なら `<time datetime>` を付ける。

`DEFAULT_SITE` の値は次のとおり。

| 項目 | 値 |
| --- | --- |
| `siteName` | 空 |
| `headerImageUrl` | `/images/header.png` |
| `stylesheetUrl` | `/style.css` |
| `homeUrl`・`materialsUrl`・`updatesUrl`・`aboutUrl`・`linksUrl` | `/index.html`・`/materials.html`・`/updates.html`・`/about.html`・`/links.html` |
| `copyrightHolder`・`copyrightYear` | `Ud.afhal`・`2026` |
| `author`・`updatedDate` | `Ud.afhal`・空 |

公開ページの構成は次のとおり。

- スタイルは埋め込まず、外部の `/style.css` を参照する。MathJax 設定とランタイムはインラインで埋め込む。
- `MATHJAX_URL` は `/MathJax-4.1.3/tex-chtml.js`。`editor.html` の `<script id="mathjax-loader">` の `src` と同じ値に保つ。
- 対応記法は、定理系環境（definition・theorem・proposition・lemma・corollary・fact・remark・statement・proof・reason）、箇条書き（itemize・enumerate・phase）、`\label`・`\ref`・`\eqref`、`\cite` と `thebibliography`（AMSalpha 型の表示）、数式環境、文字装飾、リンクである。TikZ、bussproofs、任意のマクロ定義には対応しない。
- 元の `editor.html` から変えた挙動は 2 点ある。証明・理由の開閉キー `fold-N` は、前回の最大値から文書ごとに採番する。インライン装飾タグの表は `Map` にした（`\constructor{..}` のような入力での誤動作を避けるため）。

## materials/editor.html の仕様

`editor.html` は `materials/` に置き、同じフォルダの `mystyle.js` を `<script src="mystyle.js">` で読み込む。MathJax のローダーは静的な `<script id="mathjax-loader" defer>` のまま残す。MathJax 設定は `Mystyle.createMathJaxConfig()` で、ランタイムは `Mystyle.createRuntime()` で得る。

削除したもの:

- サイト設定の入力欄 12 項目と、その保存処理（`localStorage` の `mystyleHtmlSiteSettings`）。
- 「公開ページの表題」入力欄。下書きに保存していた `title` 項目も廃止した。旧版の下書きは読めるが、`title` は無視される。
- 上記に対応する CSS。

書き換えたもの:

- 注記の文言を、「表題・著者・更新日はソースの `\title`・`\author`・`\date` から読み取る」という説明に差し替えた。
- 対応記法の一覧に `\author`・`\date` を追加した。

変えていないもの:

- 見た目、ツールバー、自動プレビュー（入力停止の約 800 ms 後に更新、IME 変換中は更新しない）、証明・理由の開閉状態の保持。
- 下書きの自動保存（`localStorage`、別タブとの競合検出、復元の選択）、ソースを開く・保存・コピー、`Ctrl+S`。
- 「公開用HTMLを生成」は `buildPage(source).html` を、ソースのファイル名の拡張子を `.html` に替えて保存する。「共通CSSを保存」は、`public-styles` と `publication-styles` の 2 つの `<style>` を結合して `style.css` として保存する。
- 初期表示のサンプルソース。

## scripts/ の仕様（common, update-materials, compile）

いずれも Node.js 22 で動く CommonJS で、外部ライブラリには依存しない。`package.json` は置かない。

### common.js

- `CATEGORIES`: `notes`＝勉強ノート、`presentations`＝発表ノート、`drafts`＝執筆中（正確性を保証しません）。
- `collectSources()`: 上の 3 フォルダ以下の `*.txt` を再帰的に集め、パス順で返す。
- `readUtf8()`: UTF-8 として厳密に読む。不正なバイトがあればエラーにする。
- `report()`: GitHub Actions 上では `::warning file=…::` などの注釈を、それ以外では通常の行を出力する。

### update-materials.js

入力は 3 フォルダの `*.txt`。出力は `materials-auto.js` の `^const MATERIALS_AUTO_DATA = .*;$` に一致する 1 行だけで、他の部分は変更しない。内容が同じなら書き込まない。

| 項目 | 規則 |
| --- | --- |
| 形式 | `{title, date, categoryKey, category, url}` の配列を `JSON.stringify` で 1 行にする（キー順固定） |
| `title` | `\title` をレンダリングしたテキスト（TeX は `$2$-huge …` のまま）。なければ拡張子なしのファイル名にして警告 |
| `date` | `\date` の値。`YYYY-MM-DD` 以外は `null` にして警告。未指定も `null` |
| `url` | `txt` の相対パスの拡張子を `.html` に替えたもの。各区間を `encodeURIComponent` する |
| 並び順 | `date` の降順、`null` は末尾、同日は `url` の昇順 |
| 失敗時 | 読めない `txt` があれば、その `txt` を指すエラー注釈を出し、一覧は書き換えずに終了コード 1 |

### compile.js

1. `_site` を削除して作り直す。
2. ルート直下の各項目を `_site` にコピーする。除外は、名前が `.` で始まるもの、`_site`、`node_modules`、`scripts`、`README.md`。3 フォルダ内の `*.txt` もコピーしない（`robots.txt` はコピーする）。
3. 各 `txt` を `buildPage` で変換し、`_site` の同じパスに拡張子 `.html` で書き出す。診断は警告注釈にする。
4. 1 件でも変換に失敗したら、終了コード 1 にする。

`materials/editor.html` と `materials/mystyle.js` は、そのまま公開側に含まれる。表示側の `materials-auto.js`（表示処理の部分）はこの作業では変更していない。トップページの最新 5 件（drafts を除く）、カテゴリ別 3 件、一覧ページの五十音順は、データ配列を読む既存の処理が担う。

## deploy.yml の仕様

`main` への push と、手動実行（`workflow_dispatch`）で起動する。権限は `contents: write`（`materials-auto.js` のコミット用）、`pages: write`、`id-token: write`。`concurrency` は `group: pages`、`cancel-in-progress: false` で、同時に複数回デプロイしない。ジョブは 1 つで、`environment` は `github-pages`。

1. `actions/checkout@v4`
2. `actions/setup-node@v4`（Node 22）
3. `node scripts/update-materials.js`
4. `materials-auto.js` に差分があれば、`github-actions[bot]` としてコミットして push する。`GITHUB_TOKEN` による push では、ワークフローは再起動しない。
5. `node scripts/compile.js`
6. `actions/upload-pages-artifact@v4`（`path: _site`）
7. `actions/deploy-pages@v4`

手動で必要な作業は 2 つ。GitHub の Settings → Pages → Source を「GitHub Actions」に変更すること。旧 `.github/workflows/compile-txt.yml` を削除すること（残すと、`txt` の push で起動して失敗する）。

注意点は次のとおり。

- Action のバージョンは、互換性を確認できる v4 系にした。新しい版（`upload-pages-artifact` v5 など）も存在し、v5 にはドット始まりのファイルを含める `include-hidden-files` の入力がある。更新するときは、`upload-pages-artifact` と `deploy-pages` を同じ世代にそろえる。
- ステップ 4 の push と同時にユーザーが `main` へ push すると、push が競合する可能性がある。`concurrency` は Actions の実行同士しか直列化しない。

## 検証状況

検証は、Node 22.22 と、Playwright のヘッドレス Chromium で行った。

検証済み:

- `compileDocument` の HTML 出力は、元の `editor.html` のコンパイラと一致した（空白を正規化し、`\author`・`\date` の行を除いた入力で比較）。診断メッセージも一致した。
- `editor.html`: 表示、自動プレビュー、証明の開閉状態の保持、公開用 HTML の生成（表題・著者・日付）、共通 CSS の保存を確認した。JS エラーはなかった。
- 生成した公開ページ: ブラウザで読み込み、MathJax マクロ 34 個の定義とランタイムの存在を確認した。エラーはなかった。
- `update-materials.js`: 元の 5 件のデータ（日付なしの 1 件を含む）と完全に一致した。2 回目の実行は「変更なし」となり、データ行以外は変化しなかった。
- `compile.js`: `_site` の構成、再実行、UTF-8 でない `txt` があるときの異常終了（終了コード 1）を確認した。

未検証:

- 実際の GitHub Actions の実行、Pages へのデプロイ、リポジトリの設定。
- MathJax 本体による数式の組版（検証環境に MathJax がない）。
- 実際の `materials-auto.js` の全文と `txt` 群、既存 HTML が読み込むスクリプト。検証には、データ行と表示処理を省いた模擬ファイルを使った。
- GitHub 上の `materials/` と `.github/workflows/` の中身。

未実装（途中で述べた想定との差）:

- 「`drafts` 以外で `\date` がない資料を、トップの最新欄から除外する」処理は入れていない。表示側のコードは変更していないため、日付つきの資料が 5 件に満たないと、日付なしの資料が最新欄の末尾に出る。除外するなら、表示処理の `renderRecentUpdates` に `date !== null` の条件を足す。ユーザーには伝達済みで、要否は未確認。

## 検索エンジン向けの処理（Nov 9, 2026 追加）

`scripts/compile.js` の最後に、`_site` の中だけを書き換える処理を追加した。リポジトリ側のファイルは変更しない。`mystyle.js` と `editor.html` は変更していない。そのため、`editor.html` の「公開用HTMLを生成」で作った HTML には、以下の canonical と description は付かない。

- 資料一覧の静的化: `index.html` の `#auto-recent-updates`・`#auto-home-materials`、`materials.html` の `#auto-materials-list` について、空の要素の中に、`materials-auto.js` と同じ内容の HTML を書き込む。JavaScript を実行しないクローラーにも資料へのリンクが見えるようにするため。ブラウザでは `materials-auto.js` が同じ内容で描画し直す。表示処理を変えたときは、`compile.js` の `recentUpdatesHTML`・`homeMaterialsHTML`・`materialsListHTML` も合わせて直す。
- canonical: `ROOT_PAGES`（index・materials・updates・about・links）と各資料ページに、`<link rel="canonical">` を付ける。起点は `SITE_URL`（`https://ud-afhal.github.io`）。`index.html` の canonical はルート（`/`）とする。
- description: 資料ページに「カテゴリ名：本文の冒頭 120 文字」を付ける。数式は TeX のまま入る。`index.html`・`materials.html` の description は、ソースの HTML に直接書いた。
- noindex: `NOINDEX_PAGES`（`materials/editor.html`）と、`NOINDEX_CATEGORIES`（drafts）の資料ページに `<meta name="robots" content="noindex">` を付ける。drafts は公開とサイト内リンクを続けるが、検索結果には出さない。
- `sitemap.xml`: `ROOT_PAGES` と、drafts 以外の資料を載せる（除外するカテゴリは `SITEMAP_EXCLUDED_CATEGORIES`）。drafts には noindex も付ける（下記）。資料の `lastmod` は `\date`。トップと資料一覧の `lastmod` は、最も新しい資料の日付。`\date` のない資料と、他の手書きページには `lastmod` を付けない。`robots.txt` に `Sitemap:` 行を追加した。
- `materials.html` の `<title>` を「資料 | Chicken-generic over Rice」に変えた。

手動で必要な作業: Search Console で `https://ud-afhal.github.io/sitemap.xml` を送信する。

## 今後の変更時の規約

- `mystyle.js` に、コマンドライン機能やファイル入出力を追加しない。変換部に DOM 依存を持ち込まない（Node で動かすため）。
- サイトの既定値は `DEFAULT_SITE` だけで管理する。`editor.html` に設定欄を復活させない（出力を CI と一致させるため）。
- `MATHJAX_URL` と、`editor.html` のローダーの `src` は、同じ値に保つ。
- ソース書式を追加するときは `mystyle.js` だけを直し、`editor.html` と CI の出力が一致することを、比較テストで確認する。
- `materials-auto.js` の自動更新は、先頭が `const MATERIALS_AUTO_DATA =` で始まる 1 行だけを対象とする。この行を複数行にしたり、書式を崩したりしない。表示処理は手で編集してよい。
- カテゴリを追加するときは、`common.js` の `CATEGORIES` と、`materials-auto.js` の `categoryOrder`・`categoryNames` の両方を更新する。
- ルートに公開したくないファイルを追加するときは、`compile.js` の `EXCLUDED` に加える。それ以外は自動で `_site` にコピーされる。
- 公開はするが検索結果に出したくないページは `NOINDEX_PAGES` に、sitemap に載せたいルート直下の手書きページは `ROOT_PAGES` に加える。
- 回答は日本語で、数学者・大学院生に向けて精密に書く。確認できていないことは「未確認」と明記する。ユーザーが仕様確認を求めている間は、実装しない。
