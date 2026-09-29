/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Standalone output bundles only the files needed to run `node server.js`,
  // which keeps the production Docker image small (important for EasyPanel builds).
  output: 'standalone',
};

module.exports = nextConfig;
