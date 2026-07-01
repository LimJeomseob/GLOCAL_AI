/** @type {import('next').NextConfig} */

// GitHub Pages 프로젝트 사이트(https://<user>.github.io/<repo>/)는 서브패스에서 서빙되므로
// basePath/assetPrefix가 필요하다. 커스텀 도메인을 쓰는 경우 NEXT_PUBLIC_BASE_PATH=""로 비워둔다.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const nextConfig = {
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: false,
  },
  // GitHub Pages는 정적 파일만 서빙 가능 — Node 서버가 필요한 서버 컴포넌트 fetch,
  // Route Handler, middleware는 모두 제거하고 완전 클라이언트 렌더링 + Supabase Edge
  // Function 조합으로 대체했다.
  output: "export",
  basePath,
  assetPrefix: basePath || undefined,
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
