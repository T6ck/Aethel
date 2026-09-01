# aethel-dashboard — deploy repo

This repo contains the built site. There is no build step.

Cloudflare settings:

    Build command     (leave empty)
    Deploy command    npx wrangler deploy

`wrangler.jsonc` points at `./out`, which is committed. That is the whole
configuration.

## Why the previous builds failed

    Could not detect a directory containing static files

That is the error wrangler gives when there is no `wrangler.jsonc` with an
`assets.directory`. It is not a build failure. Nothing was misconfigured in
Next.js. The config file simply was not in the repo.

A different error, "The directory specified by the assets.directory field
does not exist", would mean the config was found but the build had not run.
You did not see that one.

## Updating the site

Rebuild from the source repo, then copy the new `out/` over this one and
commit. Or move to the source repo and set the build command there.
