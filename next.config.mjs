/** @type {import('next').NextConfig} */
const nextConfig = {
  // Required for AWS Lambda deployment (SST / OpenNext)
  output: "standalone",
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
}

export default nextConfig
