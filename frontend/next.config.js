/** @type {import('next').NextConfig} */
const API_PROXY = process.env.API_INTERNAL_URL || 'http://127.0.0.1:8080';

const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  async rewrites() {
    // 本地开发（3000 端口）没有 Nginx，客户端 /api 请求同源代理到后端；
    // Docker 部署时 Nginx 直接接管 /api，不会走到这里。
    return [{ source: '/api/:path*', destination: `${API_PROXY}/api/:path*` }];
  },
};

module.exports = nextConfig;
