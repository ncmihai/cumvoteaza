import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const nextConfig: NextConfig = {
  distDir: process.env.COCKPIT_DATABASE_ROLE === "release" ? ".next-cockpit" : ".next",
  transpilePackages: ["@cumsevoteaza/parliament-model", "@cumsevoteaza/db", "@cumsevoteaza/ingest"]
};

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

export default withNextIntl(nextConfig);
