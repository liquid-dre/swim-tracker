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
