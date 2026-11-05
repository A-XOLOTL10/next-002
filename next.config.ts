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
      // The default is 1 MB. Event forms upload up to 5 images of 5 MB each plus a signed
      // letter, verification uploads carry ID and company documents, and the AI import takes
      // several form files.
      bodySizeLimit: "40mb",
    },
  },
  async redirects() {
    return [
      // Tickets emailed before the move to /t/... carry /admin/check-in?ticket=DEV-...; keep them working at the door.
      {
        source: "/admin/check-in",
        has: [{ type: "query", key: "ticket", value: "(?<ticket>DEV-[A-Za-z0-9]{10})" }],
        destination: "/t/:ticket",
        permanent: true,
      },
      // The old admin area now lives behind the host sign-in.
      { source: "/admin", destination: "/host", permanent: false },
      { source: "/admin/:path*", destination: "/host", permanent: false },
    ];
  },
  async headers() {
    const security = [
      // Nobody can show our pages inside their own site (stops clickjacking on sign-in and approvals).
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
      // Browsers remember to use HTTPS only (ignored on http://localhost).
      { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
    ];
    return [{ source: "/:path*", headers: security }];
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
