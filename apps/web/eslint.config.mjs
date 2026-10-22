import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // The app fetches data with `useEffect(() => { ...; setState() })` across many
      // pages. React 19's new rule flags that pattern as an error; treat it as a
      // warning until/if we move to a data-fetching library.
      "react-hooks/set-state-in-effect": "warn",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    // Static Claude Design prototype runtime — generated, not our code.
    "public/design-system/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
