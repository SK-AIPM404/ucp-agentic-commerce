/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  async rewrites() {
    return [
      {
        // Public UCP manifest discovery path
        source: "/.well-known/ucp",
        destination: "/api/well-known/ucp",
      },
    ]
  },
}

export default nextConfig
