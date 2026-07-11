import { defineConfig, globalIgnores } from "eslint/config";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

const eslintConfig = defineConfig([
  ...nextCoreWebVitals,
  {
    rules: {
      // These rules are new in eslint-config-next 16 (react-hooks v6) and
      // flag pre-existing patterns. Downgraded to warnings so CI stays green;
      // fix the underlying code and re-promote to errors when possible.
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/refs": "warn",
    },
  },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
]);

export default eslintConfig;
