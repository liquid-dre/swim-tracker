import { defineConfig } from "vitest/config";

// Two projects: the pure-TS domain tests run on node; the convex/ function
// tests run convex-test, which needs the edge-runtime environment to match
// the Convex runtime. `npm test` runs both.
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "lib",
          environment: "node",
          include: ["lib/**/*.test.ts"],
        },
      },
      {
        // Chart geometry and data-shaping. Pure TS (no JSX, no DOM) on purpose:
        // the components keep only scale lookups and rendering, so the parts
        // that could be wrong in a visible way are testable on node.
        test: {
          name: "components",
          environment: "node",
          include: ["components/**/*.test.ts"],
        },
        resolve: {
          alias: { "@": new URL(".", import.meta.url).pathname },
        },
      },
      {
        test: {
          name: "convex",
          environment: "edge-runtime",
          include: ["convex/**/*.test.ts"],
          server: { deps: { inline: ["convex-test"] } },
        },
      },
    ],
  },
});
