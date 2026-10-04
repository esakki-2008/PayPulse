import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [".next/**", "coverage/**", "dist/**", "node_modules/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["scripts/**/*.{ts,tsx}", "src/**/*.{ts,tsx}", "tests/**/*.{ts,tsx}"],
    rules: {
      "no-console": "error",
    },
  },
);
