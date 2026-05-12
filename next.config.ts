import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  async headers() {
    return [
      {
        source: '/assets/catalogo/:path*',
        headers: [
          {
            key: 'Content-Disposition',
            value: 'attachment; filename="Catalogo-El-Regreso-2026.pdf"'
          }
        ],
      },
    ]
  },
};

export default nextConfig;
