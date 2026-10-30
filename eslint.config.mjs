import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

/**
 * ESLint 9 flat config.
 *
 * Next 16 removed `next lint`, so the `lint` script runs `eslint .` against this
 * file. The presets are shipped as flat-config arrays by `eslint-config-next`.
 */
const config = [
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
    ],
  },
  ...nextVitals,
  ...nextTypeScript,
  {
    // `eslint-config-next` 16 enables the React Compiler hooks rules. The app's
    // data-fetching effects call setState from inside useEffect, which the new
    // `set-state-in-effect` rule flags. Keep the finding visible as a warning
    // rather than failing lint until those components are migrated.
    rules: {
      "react-hooks/set-state-in-effect": "warn",
    },
  },
];

export default config;
