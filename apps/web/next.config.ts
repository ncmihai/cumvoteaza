import path from "node:path";
import { fileURLToPath } from "node:url";

import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const nextConfig: NextConfig = {
  distDir: process.env.COCKPIT_DATABASE_ROLE === "release" ? ".next-cockpit" : ".next",
  outputFileTracingRoot: workspaceRoot,
  turbopack: {
    root: workspaceRoot
  },
  transpilePackages: ["@cumsevoteaza/parliament-model", "@cumsevoteaza/db", "@cumsevoteaza/ingest"]
};

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

export default withNextIntl(nextConfig);
