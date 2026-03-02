/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  reactStrictMode: true,
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
