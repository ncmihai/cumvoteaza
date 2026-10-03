import path from "node:path";
import { fileURLToPath } from "node:url";

import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const nextConfig: NextConfig = {
  distDir: process.env.PHASE3A_ISOLATED_TEST === "1" ? ".next-reliability" : ".next",
  outputFileTracingRoot: workspaceRoot,
  turbopack: {
    root: workspaceRoot
  },
  transpilePackages: ["@cumsevoteaza/parliament-model", "@cumsevoteaza/db", "@cumsevoteaza/ingest"],
  // The root layout lives under [locale] (D23), so "/" and unmatched URLs are handled here and in global-not-found.
  experimental: { globalNotFound: true },
  async redirects() {
    return [{ source: "/", destination: "/ro", permanent: false }];
  }
};

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

export default withNextIntl(nextConfig);
