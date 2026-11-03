import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  typescript:{
    ignoreBuildErrors: true,
  },
  images:{
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'res.cloudinary.com'
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com'
      }
    ]
  },
  experimental: {
    agentFeedback: true,
    // How long the browser reuses a static page it already loaded (default 5 minutes). Event
    // lists change when an admin publishes or an event ends, so keep it to the 30s minimum.
    staleTimes: {
      static: 30,
    },
    serverActions: {
      // The default is 1 MB. Admin forms upload up to 5 images of 5 MB each, and the AI
      // import takes several form files on top of that.
      bodySizeLimit: "40mb",
    },
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
