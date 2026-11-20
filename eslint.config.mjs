import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig([
  globalIgnores([
    "**/dist/**",
    "**/node_modules/**",
    "packages/*/.eve/**",
    "packages/eve/r/**",
    // A project of its own, with its own dependencies and tooling.
    "examples/**",
  ]),
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // The CSV reader names the byte order mark it strips; the character is deliberate.
      "no-irregular-whitespace": ["error", { skipRegExps: true, skipStrings: true, skipComments: true }],
      // Two character classes in the Thai text normaliser escape more than they must. Harmless,
      // and not worth changing a published regular expression for.
      "no-useless-escape": "off",
    },
  },
  {
    files: ["**/*.mjs"],
    languageOptions: { globals: { console: "readonly", process: "readonly" } },
  },
]);
