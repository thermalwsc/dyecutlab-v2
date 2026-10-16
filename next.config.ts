import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      /* The old "Start your project" quote form is retired in favour of the AI
         chat. Temporary (not permanent) so it can be switched back; see
         START_PROJECT_HREF in lib/contact.ts. */
      { source: "/start", destination: "/app", permanent: false },
    ];
  },
};

export default nextConfig;
