/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  // v0 preview iframes use vusercontent.net subdomains. Allow them so HMR works
  // and edits actually reach the running preview.
  allowedDevOrigins: ["*.vusercontent.net", "*.v0.app", "*.vercel.app"],
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
