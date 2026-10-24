import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["pg"],
  poweredByHeader: false,
};

export default config;
