import type { NextConfig } from "next";

// The desktop (Electron) build is a fully static export served over a custom
// protocol, so it runs offline with no Node server. The normal web build
// (dev / Vercel) is unchanged.
const isDesktop = process.env.BUILD_TARGET === "desktop";

const nextConfig: NextConfig = isDesktop
  ? {
      output: "export",
      trailingSlash: true,
      images: { unoptimized: true },
    }
  : {};

export default nextConfig;
