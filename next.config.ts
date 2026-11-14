import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cache Components (cacheComponents + partialPrefetching) is deliberately off.
  // Every page here reads the session, so we use plain per-request dynamic
  // rendering: requireUser(), then redirect or render.

  // CLAUDE.md allows only CLAUDE.md, SPEC.md and the README as docs, so stop
  // `next dev` from generating an AGENTS.md file.
  agentRules: false,
  // Tailwind v4 is compiled by its Turbopack loader (create-next-app default).
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
