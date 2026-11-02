import {
  readFile,
  writeFile,
  mkdir,
  rm,
  copyFile,
  readdir,
  lstat
} from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  compileDocument,
  buildPublicHTML
} from "../materials/compiler/compiler.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = path.join(root, ".site");
const materials = path.join(root, "materials");
const decoder = new TextDecoder("utf-8", { fatal: true });

async function* sources(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name, "en"));

  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const fullPath = path.join(directory, entry.name);

    if (entry.isSymbolicLink()) {
      throw new Error(`シンボリックリンクは対象外です: ${fullPath}`);
    }
    if (entry.isDirectory()) {
      if (directory === materials && entry.name === "compiler") continue;
      yield* sources(fullPath);
    } else if (entry.isFile() && /\.txt$/i.test(entry.name)) {
      yield fullPath;
    }
  }
}

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

// Git管理下の公開ファイルをコピーする。
// ソースコードの設定・テスト・CI関連ファイルは公開対象から除外する。
const trackedFiles = execFileSync("git", ["ls-files", "-z"], {
  cwd: root,
  encoding: "utf8"
}).split("\0").filter(Boolean);

for (const relative of trackedFiles) {
  const parts = relative.split("/");
  if (
    parts.some((part) => part.startsWith(".")) ||
    ["scripts", "tests", "node_modules"].includes(parts[0]) ||
    /^(?:package(?:-lock)?\.json|README(?:\.[^.]+)?)$/i.test(relative)
  ) continue;

  const from = path.join(root, relative);
  const info = await lstat(from);
  if (!info.isFile()) {
    throw new Error(`通常ファイルではありません: ${relative}`);
  }

  const to = path.join(output, relative);
  await mkdir(path.dirname(to), { recursive: true });
  await copyFile(from, to);
}

const targets = new Set();
const failures = [];
let count = 0;

for await (const sourcePath of sources(materials)) {
  const relative = path.relative(root, sourcePath);
  const target = relative.replace(/\.txt$/i, ".html");
  const targetKey = target.split(path.sep).join("/").toLowerCase();

  try {
    if (targetKey === "materials/editor.html") {
      throw new Error("editor.txt はエディターと出力先が衝突します。");
    }
    if (targets.has(targetKey)) {
      throw new Error("別のソースとHTML出力先が重複しています。");
    }
    targets.add(targetKey);

    const source = decoder.decode(await readFile(sourcePath));
    const result = compileDocument(source);
    const destination = path.join(output, target);

    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, buildPublicHTML(result), "utf8");

    for (const issue of result.issues) {
      console.warn(`${relative}: ${issue}`);
    }

    console.log(`${relative} -> ${target}`);
    count++;
  } catch (error) {
    failures.push(`${relative}: ${error.message}`);
  }
}

if (failures.length) {
  throw new Error("コンパイルに失敗しました。\n" + failures.join("\n"));
}

await writeFile(path.join(output, ".nojekyll"), "", "utf8");
console.log(`${count}件のソースをコンパイルしました。`);