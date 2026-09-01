# Aethel

Technology Intelligence. Managed by Noira.

Next.js 14 (App Router) with React Three Fiber, Framer Motion and Recharts.
Built as a **static export**, so the output is plain files with no server.

## Run

    npm install
    npm run dev        # http://localhost:3000

## Build and deploy

    npm run build      # produces ./out

`./out` is static. Two ways to ship it:

1. **Drag and drop.** Upload the contents of `out/` to Cloudflare Pages.
   Static export is why this works: there is no build step on their side.
2. **CLI.** `npx wrangler pages deploy out`

`out/_headers` sets noindex, frame deny, no referrer and nosniff.

## Routes

    /            marketing hero, 3D globe with bloom
    /dashboard   the client environment

## Structure

    app/layout.jsx        fonts, metadata
    app/page.jsx          marketing hero
    app/dashboard/page.jsx  dashboard, nav, views, explain drawer
    components/Globe.jsx  R3F sphere, bloom, instanced packets
    components/Charts.jsx recharts traffic area + severity donut
    components/ui.jsx     Reveal, Count, Chip, Panel
    lib/data.js           single data model, seeded from the Noira report

## Notes

Fonts are linked from Google rather than `next/font/google`, so the project
builds without outbound network access. If your build machine can reach
fonts.googleapis.com, switching to `next/font` self hosts them and removes
the render blocking request.

Palette is CORE section 9 verbatim. The three functional colours mean
condition only: they never appear on a button, a link or a heading.
