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
    // Repository tooling: standalone ESM scripts run by npm and by CI, outside
    // the application bundle. Linted for the same reason as the hooks above —
    // a broken guard script fails quietly, and this one exists precisely to
    // stop a document from going quietly wrong.
    files: ["scripts/**/*.mjs"],
    languageOptions: {
      globals: {
        process: "readonly",
        console: "readonly",
        fetch: "readonly",
      },
    },
  }
);
