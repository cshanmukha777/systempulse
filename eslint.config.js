"use strict";

module.exports = [
  {
    files: ["electron/**/*.js", "src/utils/**/*.js", "src/utils/**/*.mjs", "tests/**/*.js", "tests/**/*.mjs"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "commonjs",
      globals: {
        require: "readonly",
        module: "readonly",
        process: "readonly",
        __dirname: "readonly",
        Buffer: "readonly",
        console: "readonly",
        URL: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        test: "readonly",
        assert: "readonly",
        si: "readonly",
      },
    },
    rules: {
      "no-undef": "error",
      "no-unused-vars": ["error", { args: "after-used", caughtErrors: "none" }],
      "no-unreachable": "error",
      "no-constant-binary-expression": "error",
      "valid-typeof": "error",
    },
  },
  {
    files: ["src/utils/**/*.mjs", "tests/**/*.mjs"],
    languageOptions: { sourceType: "module" },
  },
];
