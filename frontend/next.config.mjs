import createMDX from "@next/mdx";
import rehypePrettyCode from "rehype-pretty-code";

/** @type {import('rehype-pretty-code').Options} */
const options = {
  keepBackground: false,
};

const enableDebugAPIProxy = process.env.SLOGGO_DEBUG_PROXY_API === "true";
const backendOrigin = process.env.SLOGGO_BACKEND_ORIGIN?.replace(/\/$/, "");

/** @type {import('next').NextConfig} */
const nextConfig = {
  ...(enableDebugAPIProxy ? {} : { output: "export" }),
  pageExtensions: ["ts", "tsx", "js", "jsx", "md", "mdx"],
  experimental: {
    // REMINDER: new react compiler to memoize the components
    // https://react.dev/learn/react-compiler
    reactCompiler: true,
  },
  ...(enableDebugAPIProxy && backendOrigin
    ? {
        async rewrites() {
          return [
            {
              source: "/api/:path*",
              destination: `${backendOrigin}/api/:path*`,
            },
          ];
        },
      }
    : {}),
};

const withMDX = createMDX({
  extension: /\.mdx?$/,
  options: {
    remarkPlugins: [],
    rehypePlugins: [[rehypePrettyCode, options]],
  },
});

export default withMDX(nextConfig);
