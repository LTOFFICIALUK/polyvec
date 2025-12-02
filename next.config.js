/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  
  // Ensure environment variables are properly exposed
  env: {
    // These will be replaced at build time with the actual values
  },
  
  // Performance optimizations for production
  poweredByHeader: false,
  
  // Configure external packages that should be bundled
  transpilePackages: ['@polymarket/clob-client'],
  
  // Webpack configuration for production builds
  webpack: (config, { isServer }) => {
    // Handle node: protocol imports for server-side
    if (isServer) {
      config.externals = config.externals || []
    }
    return config
  },
}

module.exports = nextConfig

