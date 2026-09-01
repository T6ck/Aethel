# Aethel

Technology Intelligence. Managed by Noira.

Next.js 14 App Router, React Three Fiber, Framer Motion, Recharts.
Built as a **static export**, so the output is plain files and no server runs.

## Local

    npm install
    npm run dev          # http://localhost:3000
    npm run build        # writes ./out

## Deploying to Cloudflare

`next build` writes `./out`. `wrangler.jsonc` points `assets.directory` at
`./out`. Both halves are required: without the build there is no `out`, and
without the assets directory `wrangler deploy` has nothing to serve.

### Connected Git repo (Workers Builds)

In the Cloudflare project settings, set BOTH:

    Build command      npm install && npm run build
    Deploy command     npx wrangler deploy

Leaving the build command empty is what produces:

    Could not detect a directory containing static files

because nothing ever created `out/`.

### From your machine

    npm run deploy       # runs next build, then wrangler deploy

### Drag and drop

    npm run build

Upload the **contents of `out/`**, not the folder itself and not the repo.
`index.html` has to be at the top level of what you upload.

## Headers

`public/_headers` is copied into `out/` by every build, so noindex, frame
deny, no referrer and nosniff survive a rebuild. Do not edit `out/_headers`
directly, it is regenerated.

## Routes

    /            marketing hero, 3D globe with bloom
    /dashboard   the client environment

## Structure

    app/layout.jsx           fonts, metadata
    app/page.jsx             marketing hero
    app/dashboard/page.jsx   dashboard, nav, views, explain drawer
    components/Globe.jsx     R3F sphere, bloom, instanced packets
    components/Charts.jsx    recharts traffic area, severity donut
    components/ui.jsx        Reveal, Count, Chip, Panel
    lib/data.js              one data model, seeded from the Noira report
    public/_headers          response headers, copied into out/
    wrangler.jsonc           assets.directory points at ./out

## Notes

Fonts are linked from Google rather than `next/font/google`, so the project
builds without outbound network access. If your build machine can reach
fonts.googleapis.com, switching to `next/font` self hosts them.

Palette is CORE section 9 verbatim. The three functional colours mean
condition only: they never appear on a button, a link or a heading.
