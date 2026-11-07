import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // React Three Fiber maps three.js properties to lowercase JSX intrinsics
  // (e.g. <mesh position={…}>, <icosahedronGeometry args={…}>). The react
  // plugin's no-unknown-property rule flags these as invalid DOM attributes,
  // so it is disabled project-wide — standard practice in R3F codebases.
  {
    rules: {
      "react/no-unknown-property": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
