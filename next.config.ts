import type { NextConfig } from "next";

// Static export: GitHub Pages serves plain files, so every route is prerendered
// at build time. `efriedla.github.io` is a user site served from the domain
// root, so no basePath or assetPrefix is needed.
const nextConfig: NextConfig = {
  output: "export",
  // GitHub Pages resolves a bare /loaders against the directory of that name.
  // Trailing slashes make every route emit its own index.html, so there is no
  // ambiguity between a route and the RSC payload folder beside it.
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;
