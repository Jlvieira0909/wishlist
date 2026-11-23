import type { NextConfig } from "next";

const chromiumFiles = ["./node_modules/@sparticuz/chromium/bin/**/*"];

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // Na Vercel, o Chromium serverless é extraído desses arquivos na hora de rodar.
  // Isto garante que eles sejam enviados junto com as rotas que leem o CSSBUY.
  outputFileTracingIncludes: {
    "/api/items": chromiumFiles,
    "/api/items/*": chromiumFiles,
  },
};

export default nextConfig;
