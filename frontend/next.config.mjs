/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  /** Set to true only when building for Azure SWA static deploy (npm run build:static). */
  output: process.env.NEXT_STATIC_EXPORT === "1" ? "export" : undefined,
  transpilePackages: [],
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.resolve.extensionAlias = {
        ".js": [".ts", ".js"],
      };
    }
    return config;
  },
};

export default nextConfig;
