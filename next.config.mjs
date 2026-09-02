/** Static export so the built output is plain files.
 *  Cloudflare Pages serves ./out directly, and it can also be dragged
 *  into the dashboard uploader, which refuses anything with a build step. */
const nextConfig = {
  output: 'export',
  images: { unoptimized: true },
  transpilePackages: ['three'],
  // the Google Fonts stylesheet is not minifiable by Next's optimiser and
  // emits a CssSyntaxError warning every build. Nothing is broken; the
  // link is served as-is.
  optimizeFonts: false,
};
export default nextConfig;
