const path = require("path");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@dsbot/db", "@dsbot/shared"],
  output: "standalone",
  experimental: {
    externalDir: true,
    // Trace workspace deps from the monorepo root (packages/web -> ../..)
    outputFileTracingRoot: path.join(__dirname, "../.."),
  },
};

module.exports = nextConfig;
