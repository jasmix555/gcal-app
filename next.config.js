/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // No ESLint deps blocking deploys; lint is enforced at commit time via husky.
  eslint: { ignoreDuringBuilds: true },
  transpilePackages: [
    "@fullcalendar/core",
    "@fullcalendar/daygrid",
    "@fullcalendar/timegrid",
    "@fullcalendar/interaction",
    "@fullcalendar/list",
    "@fullcalendar/react",
  ],
};

module.exports = nextConfig;
