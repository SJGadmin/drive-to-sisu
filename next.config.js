/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Increase API route timeout for long-running uploads (default is 10 seconds)
  api: {
    bodyParser: {
      sizeLimit: '50mb',
    },
    responseLimit: false,
  },
  // Increase function execution time for Vercel deployment
  experimental: {
    // Set to 300 seconds (5 minutes) for Pro plan, 10 seconds for Hobby
    // Adjust based on your Vercel plan
    proxyTimeout: 300000,
  },
};

module.exports = nextConfig;
