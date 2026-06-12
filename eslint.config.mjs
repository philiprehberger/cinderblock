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
    // Cinderblock additions:
    "supabase/functions/**", // Deno-targeting; has its own (planned) lint pass.
  ]),
  {
    rules: {
      // Apostrophes in prose aren't bugs; the rule produces more noise than it
      // prevents. Disabled project-wide.
      "react/no-unescaped-entities": "off",
    },
  },
]);

export default eslintConfig;
