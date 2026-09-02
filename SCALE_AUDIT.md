# Groundplane — scale audit and remediation prompt

Measured against a seeded database of 201 orgs, 350 environments,
9,000 assets, 6,000 findings, 30,000 agent reports and 45,650 audit
rows. Nothing below is a guess; every number came from `EXPLAIN
ANALYZE` or a grep of the shipped source.

---

## FINDINGS

### S1 — `env_summary` is the scaling bomb  ·  severity: high

The operator roster view runs **eight correlated subqueries per
environment**. At 350 environments the planner reports cost 154,688 and
it executes in **54 ms**. It is loaded on every dashboard mount and
again after every write, because `reload()` calls it.

    Seq Scan on environments v  (cost=0.00..154688.41)
      SubPlan 1 → Aggregate (loops=350)
      SubPlan 2 → Aggregate (loops=350)
      ... eight of these

Growth is linear in environments times tables. At 1,000 environments
this is roughly 150 ms on every navigation.

**Fix.** Rewrite as a single pass: one `LEFT JOIN LATERAL` per source
table, or grouped aggregates joined once. Target under 10 ms at 1,000
environments. Add a covering index on each aggregated column pair.

### S2 — eight tables have no index on `environment_id`  ·  severity: high

Indexed: `assets`, `findings`, `agents`, `agent_reports`, `audit_log`.

Missing: **`sites`, `subnets`, `circuits`, `incidents`, `monitors`,
`changes`, `tickets`, `reports`.**

Every one of those is loaded by `Records.jsx` with
`.eq('environment_id', …)`, so each is a sequential scan that grows
with total rows across all customers, not with the customer's own data.
This is the difference between a tenant's page load being independent
of other tenants and being coupled to them.

**Fix.** `create index concurrently` on `environment_id` for all eight.
Composite where there is an obvious second filter, for example
`findings(environment_id, status)` and `tickets(environment_id, status)`.

### S3 — `agent_reports` grows without bound  ·  severity: high

No retention, no pruning, no aggregation. Measured projection:

    1 collector, hourly, 1 year                     8,760 rows
    150 clients x 2 collectors                  2,628,000 rows/year
    at ~2 KB per payload                              ~5.0 GB/year

The table is append-only from the agent and nothing ever removes a row.
Supabase storage cost aside, the index degrades and the reports query
slows for every customer.

**Fix.** Retention policy with a stated default (90 days of raw
payloads). Roll older reports into a daily summary row per collector
before deleting. Expose the retention window on the workspace so it is
a visible product decision rather than silent data loss. Add a
`pg_cron` job or a documented scheduled function.

### S4 — no pagination anywhere  ·  severity: high

`Records.jsx`, `Agents.jsx` and the dashboard contain **zero** calls to
`.range()` or `.limit()`. Every section fetches every row for the
environment and renders every row into the DOM.

A client with 5,000 assets downloads and renders 5,000 rows on click.
Supabase's default cap will silently truncate at 1,000, which is worse
than slow: the operator sees a number that looks complete and is not.

**Fix.** Server-side pagination on every list, page size 50, with an
explicit total from `count: 'exact'` so the UI can say "50 of 5,000"
rather than implying it has everything. Search and sort must go to the
server too, not filter a partial page.

### S5 — the org is picked arbitrarily  ·  severity: medium

    supabase.from('orgs').select('*').limit(1).maybeSingle()

RLS limits the result to orgs the user belongs to, so this is not a
security hole. But a user who belongs to two orgs — an operator who
also has a personal tenant workspace, which the schema permits — gets
whichever row the planner returns first, and it can change between
loads. The entire dashboard, including `mode`, hangs off this value.

**Fix.** Load all memberships, persist the chosen org, and expose an
org switcher when there is more than one. Mode follows the selected
org, not an arbitrary one.

### S6 — report generation loads seven full tables into the browser  ·  severity: medium

    const tables = ['sites','assets','findings','incidents',
                    'monitors','changes','tickets'];

Every row of all seven is fetched client-side, assembled into a
`snapshot` jsonb and posted back. For a large environment that is
megabytes through the browser, and it silently truncates at Supabase's
row cap, producing an incomplete snapshot that is stamped as evidence.

**Fix.** Move snapshot assembly into a `SECURITY DEFINER` function that
builds the jsonb server-side in one statement. The browser sends an
environment id and gets back a report id.

### S7 — no realtime, no refresh strategy  ·  severity: low

The dashboard reads once on mount. Two operators working the same
client see divergent state until one reloads. `agent_reports` arriving
never surfaces without a manual refresh.

**Fix.** Subscribe to `findings` and `agent_reports` for the selected
environment. Keep it to those two: subscribing to everything is its own
scaling problem.

### S8 — agent has no backoff and no batching  ·  severity: medium

`groundplane_agent.py` posts one report per interval with no retry, no
jitter and no queue. Consequences at scale:

- Every collector deployed the same day reports on the same second.
  150 collectors become a thundering herd on the hour.
- A failed POST loses that interval's data permanently.
- A revoked token logs a message and keeps trying forever.

**Fix.** Jittered interval, exponential backoff on failure, a small
on-disk spool that replays missed reports, and a hard stop after a
401/403 with a clear message rather than an infinite retry.

### S9 — audit_log grows without bound and has one index  ·  severity: medium

45,650 rows from seeding alone, one row per write across twelve tables.
Only `(environment_id, at desc)` is indexed. No retention.

**Fix.** Same retention treatment as S3, plus an index on `actor` for
"what did this person change" queries.

---

## WHAT IS ALREADY CORRECT — do not change

Verified by the isolation suite (37 assertions) and `audit.js` (20
checks), all passing:

- Tenant isolation. A tenant sees zero of another org's environments,
  assets, findings or orgs, and cannot write into one it does not own
  even knowing the id.
- Every table is `force row level security`, zero gaps.
- Every editor field maps to a real column; every dropdown value
  satisfies its CHECK constraint.
- Agent tokens stored as digest only, column-revoked from the browser.
  No flag can repoint a collector at another environment.
- Signup routing decided by the database, not the browser.
- Palette clean, no em dashes, reduced motion respected, focus visible.

---

## BUILD PROMPT

Implement S1 through S9 in one pass, in this order, and stop only when
every item is verified rather than asserted.

**Migration `002_scale.sql`, idempotent and safe to re-run.**

1. Rewrite `env_summary` as a single-pass query. Prove with `EXPLAIN
   ANALYZE` on the seeded 350-environment database that execution time
   drops below 10 ms and the plan contains no `SubPlan`.
2. Add `environment_id` indexes to the eight tables missing them.
   Composite `(environment_id, status)` where a status filter exists.
   Add `audit_log(actor)`.
3. Add `retention_days` to `orgs`, default 90. Add
   `prune_agent_reports()` and `prune_audit_log()` as SECURITY DEFINER
   functions that delete beyond the window and return the row count.
   Document the `pg_cron` invocation in the README rather than assuming
   the extension is enabled.
4. Add `build_report_snapshot(p_env uuid)` returning jsonb, assembling
   all seven tables server-side. Add `issue_report(p_env, p_period…)`
   that calls it and inserts the row, returning the report id.

**Front end.**

5. Paginate every list: page size 50, `count: 'exact'`, server-side
   search and sort. The UI must state the total, never imply a partial
   page is the whole set.
6. Replace the arbitrary org pick with a full membership load, a
   persisted selection and a switcher shown only when there is more
   than one org.
7. Point report generation at `issue_report`. The browser sends an id.
8. Subscribe to `findings` and `agent_reports` for the selected
   environment only, and tear the channel down on switch.

**Agent.**

9. Jittered interval (±10%), exponential backoff to a 30 minute cap, an
   on-disk spool capped at 500 reports that replays oldest first, and a
   hard exit on 401/403 with the reason printed.

**Verification, all of which must pass before this is done.**

- The isolation suite still returns 37/37. Pagination and the new
  functions must not weaken any policy.
- `audit.js` still returns 20/20, extended with: no list without a
  limit, no unbounded table without a prune function, `env_summary`
  plan free of `SubPlan`.
- A new `scale_test.sql` that seeds the volume above and asserts
  measured ceilings: `env_summary` under 10 ms, every environment-scoped
  read using an index scan, prune functions actually reducing row count.
- Agent: a test that simulates a failed POST and proves the report is
  spooled and replayed rather than lost.
