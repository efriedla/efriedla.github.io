import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  globalIgnores([".next/**", "out/**", "node_modules/**", "public/**"]),
  nextVitals,
  nextTs,
  {
    // The loaders are copied verbatim into other people's projects, so they
    // stay plain dependency-free JSX rather than being held to this project's
    // TypeScript rules.
    files: ["src/loaders/**/*.jsx"],
    // These files carry their own eslint-disable comments for the projects they
    // get pasted into; an unused one here is not a defect in this repo.
    linterOptions: { reportUnusedDisableDirectives: "off" },
    rules: {
      "@typescript-eslint/no-unused-vars": "off",
      "react-hooks/exhaustive-deps": "off",
      // Pill Sort builds its first board in an effect on purpose: generating
      // it during render would disagree with the prerendered markup.
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/refs": "off",
      // Each game keeps its world in a ref and mutates it from the animation
      // loop. That is the point of the design, not an oversight.
      "react-hooks/immutability": "off",
      "@typescript-eslint/no-unused-expressions": "off",
    },
  },
]);
