/** @type {import('next').NextConfig} */
const path = require("path");

const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["framer-motion"],
  webpack: (config) => {
    config.resolve.alias["@/db"] = path.resolve(__dirname, "src/db");
    config.resolve.alias["@/lib"] = path.resolve(__dirname, "src/lib");
    config.resolve.alias["@/components"] = path.resolve(__dirname, "src/components");
    config.resolve.alias["@"] = path.resolve(__dirname, "src");
    return config;
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
      {
        source: "/api/:path*",
        headers: [
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
          {
            key: "Content-Security-Policy",
            value: "default-src 'self'; connect-src 'self' https://api.stripe.com https://api.paypal.com https://discord.com; img-src 'self' data:;",
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
