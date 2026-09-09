/**
 * Node loader hooks so a plain `node` run can import the site's TypeScript.
 *
 *   import { register } from "node:module";
 *   register("./ts-hooks.mjs", import.meta.url);
 *   const mod = await import("../components/BareThreeCanvas.tsx");
 *
 * Two things stand between Node and those files. The source uses the "@/"
 * alias from tsconfig, which Node knows nothing about, and it omits file
 * extensions (on "@/" and on "./" imports alike). And BareThreeCanvas.tsx
 * contains JSX, which Node's own --experimental-strip-types cannot handle
 * (it strips types only; it does not rewrite JSX). So `resolve` maps the
 * alias to the repo root and adds the missing extension to alias and
 * relative imports, and `load` runs .ts/.tsx sources through the TypeScript
 * compiler that is already a devDependency, one file at a time, with no
 * type checking. That is the same output `next build` would produce for the
 * module, minus bundling.
 */

import { statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve as resolvePath } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const ROOT = resolvePath(dirname(fileURLToPath(import.meta.url)), "..");

/** Extensions the source leaves off, in the order tsconfig tries them. */
const OMITTED_EXTENSIONS = [".ts", ".tsx", "/index.ts", "/index.tsx"];

function isFile(path) {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

/** The file `target` names once the omitted extension is put back, or null.
 *  A directory is never a match: tsconfig tries foo.ts before foo/index.ts,
 *  and Node cannot import a directory at all. */
function completeFile(target) {
  for (const candidate of [target, ...OMITTED_EXTENSIONS.map((ext) => target + ext)]) {
    if (isFile(candidate)) return candidate;
  }
  return null;
}

export async function resolve(specifier, context, next) {
  let target;
  if (specifier.startsWith("@/")) {
    target = join(ROOT, specifier.slice(2));
  } else if (/^\.\.?\//.test(specifier) && context.parentURL?.startsWith("file:")) {
    target = fileURLToPath(new URL(specifier, context.parentURL));
  } else {
    return next(specifier, context);
  }
  const file = completeFile(target);
  if (file) return next(pathToFileURL(file).href, context);
  // Nothing there: let Node resolve (and report) the original specifier.
  return next(specifier.startsWith("@/") ? pathToFileURL(target).href : specifier, context);
}

export async function load(url, context, next) {
  if (!url.startsWith("file:") || !/\.tsx?$/.test(url)) {
    return next(url, context);
  }
  const source = await readFile(new URL(url), "utf8");
  const { outputText } = ts.transpileModule(source, {
    fileName: fileURLToPath(url),
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
      isolatedModules: true,
    },
  });
  return { format: "module", source: outputText, shortCircuit: true };
}
