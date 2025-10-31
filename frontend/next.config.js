/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow cross-origin requests from server IP for development
  allowedDevOrigins: [
    '10.5.216.11',
    'localhost',
    '127.0.0.1',
    '0.0.0.0'
  ],
  images: {
    domains: ['localhost', '*'],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
      {
        protocol: 'http',
        hostname: '**',
        pathname: '/**',
      },
    ],
  },
  env: {
    NEXT_PUBLIC_BACKEND_URL: process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4700',
    NEXT_PUBLIC_WS_URL: process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:4700',
    NEXT_PUBLIC_FRONTEND_URL: process.env.NEXT_PUBLIC_FRONTEND_URL || 'http://localhost:4800',
  },
  
  // Add rewrites for API proxying with proper header forwarding
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4700'}/api/:path*`,
        basePath: false,
      },
    ]
  },
}

module.exports = nextConfig
