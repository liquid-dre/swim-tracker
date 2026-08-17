import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // components/charts/ is VENDORED from the bklit shadcn registry — third-party
    // source we re-pull rather than author. It trips react-hooks/refs 45 times
    // (its axes read containerRef.current during render), and rewriting that
    // would guarantee a conflict on every future `shadcn add`. Our own chart code
    // in components/charts/swim/ is NOT excluded and is linted normally.
    "components/charts/*.ts",
    "components/charts/*.tsx",
    "components/charts/tooltip/**",
  ]),
]);

export default eslintConfig;
