import convex from "@convex-dev/eslint-plugin";

/**
 * ESLint (flat config) using the official Convex plugin to catch Convex-specific
 * issues (missing validators, floating promises, filter-vs-index, etc.).
 * The lint script targets the `convex/` directory.
 */
export default [
  { ignores: ["**/_generated/**", "**/dist/**", "**/.next/**", "node_modules/**"] },
  ...convex.configs.recommended,
];
