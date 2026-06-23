import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  serverExternalPackages: [
    'instagram-private-api',
    'request-promise',
    'request',
    'tough-cookie',
    'bluebird',
  ],
};

export default nextConfig;
