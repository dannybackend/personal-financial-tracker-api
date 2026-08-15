import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ["dist/"],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { "argsIgnorePattern": "^_" }]
    }
  },
  {
    // Claude Code hooks are standalone CommonJS scripts run by the tool, not
    // part of the ESM application bundle. They are linted rather than ignored:
    // if a hook breaks, the documentation reminders stop firing silently.
    files: [".claude/hooks/**/*.cjs"],
    languageOptions: {
      sourceType: "commonjs",
      globals: {
        require: "readonly",
        module: "readonly",
        process: "readonly",
        console: "readonly",
        __dirname: "readonly",
      },
    },
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  {
    // Tests for those hooks are ESM, because Vitest runs them as ESM. Without
    // this block they inherit a config that declares no globals at all, so
    // `URL`, `process` and `console` each error as undefined - and the fix
    // reached for first is an import or a disable comment in every new file,
    // which hides a config gap instead of closing it.
    files: [".claude/hooks/**/*.mjs"],
    languageOptions: {
      sourceType: "module",
      globals: {
        URL: "readonly",
        process: "readonly",
        console: "readonly",
      },
    },
  }
);
