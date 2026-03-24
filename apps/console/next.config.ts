import type { NextConfig } from 'next';

const backendOrigin = process.env.NEXT_PUBLIC_API_ORIGIN ?? 'http://127.0.0.1:8888';
const projectRoot = new URL('.', import.meta.url).pathname.replace(/\/$/, '');

const nextConfig: NextConfig = {
  reactStrictMode: true,
  turbopack: {
    root: projectRoot,
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${backendOrigin}/api/:path*`,
      },
      {
        source: '/uploads/knowledge/:path*',
        destination: `${backendOrigin}/uploads/knowledge/:path*`,
      },
    ];
  },
};

export default nextConfig;
