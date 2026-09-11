import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  {
    // .next-*/ are the per-session dist dirs next.config.ts allows (NEXT_DIST_DIR);
    // without this every build in one made `npm run lint` report ~350 errors.
    ignores: [".next/**", ".next-*/**", ".scratch-*/**", "node_modules/**", "next-env.d.ts"],
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
];

export default eslintConfig;
