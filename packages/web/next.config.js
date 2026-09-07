/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@dsbot/db", "@dsbot/shared"],
  experimental: {
    // Needed to let Next resolve workspace symlinks cleanly
    externalDir: true,
  },
};

module.exports = nextConfig;
