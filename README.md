# Groundplane

Know what you are standing on.
groundplanes.com

Two products, one codebase, one data model.

- **Operator mode** — an MSP manages many client environments.
- **Tenant mode** — a company subscribes and manages its own.

Which you get is decided at signup by the database, not the browser.

## Setup

1. Supabase → SQL Editor → run `sql/001_groundplane.sql`, then `sql/002_scale.sql`
2. Supabase → Authentication → URL Configuration → set **Site URL** to
   your live URL, and add `<url>/reset` and `<url>/dashboard` to
   **Redirect URLs**
3. Deploy the contents of `out/`
4. Sign up

`t6ckmedia@gmail.com` and any `@noira.us` address join the operator org.
Anything else creates its own tenant org, on a 14 day trial, with one
environment already scaffolded.

Adding another operator firm later is one insert, no code change:

    insert into operator_domains(domain, org_slug) values ('acme.com','acme');

## Build

    npm install
    npm run dev          # http://localhost:3000
    npm run build        # static export to ./out

`out/` is plain files. Upload its contents to Cloudflare (index.html at
top level), or `npx wrangler deploy --name groundplane --assets ./out
--compatibility-date 2026-08-01`.

## Collector

    python3 groundplane_agent.py enroll --code A1B2C3D4E5F6
    python3 groundplane_agent.py run --daemon --interval 3600

Issue the code from Operations → Collectors. It expires in 24 hours and
works once. The collector exchanges it for a 64 character token stored
at 0600, so the long secret never touches a command line.

The token carries the environment id and there is no flag to change it.
A copied collector cannot write into another customer's data, enforced
by row level security rather than by the agent behaving.

The collector never reads or transmits a password, key, PSK, community
string or door code. Every payload passes `scrub()` before leaving.

## Retention

`orgs.retention_days` defaults to 90. Raw agent payloads and audit rows
older than that are removed by `prune_agent_reports()` and
`prune_audit_log()`. Without pruning, agent reports were projected at
2.6 million rows and about 5 GB per year at 150 clients.

Schedule them daily. If `pg_cron` is enabled on your project:

    select cron.schedule('prune-reports','0 3 * * *','select prune_agent_reports()');
    select cron.schedule('prune-audit',  '0 3 * * *','select prune_audit_log()');

If it is not, call both from any daily scheduler. They are safe to run
repeatedly and return the number of rows removed.

## Tests

    psql -d gp -f sql/test/stub.sql
    psql -d gp -f sql/001_groundplane.sql
    psql -d gp -f sql/test/isolation_test.sql     # 37 assertions
    node audit.js                                  # 36 checks
    python3 agent/test_agent.py                    # 10 checks

The isolation suite proves a tenant sees zero of another org's
environments, assets, findings and orgs, cannot write into an
environment it does not own even knowing the id, and cannot mint a
collector for one.

`audit.js` cross-checks every UI field against the live schema, so an
editor field can never reference a column that does not exist.

## Billing

`orgs` carries `plan`, `plan_status`, `stripe_customer_id` and
`stripe_subscription_id`. The pricing page ids match the plan values the
schema accepts. Attaching Stripe is wiring, not a migration.

## Scale

`SCALE_AUDIT.md` records what was measured against 350 environments,
9,000 assets and 30,000 agent reports, and what changed:

- `env_summary` went from eight correlated subqueries per environment
  (54 ms) to a single pass with lateral joins (6.9 ms, no SubPlan).
- Eight tables gained the `environment_id` index they were missing, so
  a tenant's page speed no longer depends on other tenants' row counts.
- Every list paginates server side at 50 with a true total, instead of
  fetching everything and truncating silently at the platform cap.
- Report snapshots are built by the database in one statement.
- The agent jitters, backs off, spools failed reports and stops on a
  revoked token instead of retrying forever.

## Not built

Stripe checkout. Scheduled report delivery. Email notification when a
finding is raised. Worker-side public surface checks (TLS expiry, SPF,
DKIM, DMARC) — the schema has `monitors.kind = 'worker'` reserved for it.
