// Maps the project's "@/..." alias to the repo root and adds the .ts
// extension the source omits, for plain node runs.
import { pathToFileURL } from "node:url";
import { existsSync } from "node:fs";
import * as path from "node:path";
const ROOT = path.resolve(import.meta.dirname, "..");
export async function resolve(specifier, context, next) {
  if (specifier.startsWith("@/")) {
    let target = path.join(ROOT, specifier.slice(2));
    if (!existsSync(target)) {
      for (const ext of [".ts", ".tsx", ".mts", "/index.ts"]) {
        if (existsSync(target + ext)) { target += ext; break; }
      }
    }
    return next(pathToFileURL(target).href, context);
  }
  return next(specifier, context);
}
