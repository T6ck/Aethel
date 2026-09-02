-- ═══════════════════════════════════════════════════════════════
-- GROUNDPLANE  ·  002 scale
-- Idempotent. Safe to run over an existing database.
--
-- Addresses the findings measured in SCALE_AUDIT.md against a seeded
-- database of 350 environments, 9k assets, 6k findings and 30k agent
-- reports.
-- ═══════════════════════════════════════════════════════════════

-- ── S2. environment_id indexes ──────────────────────────────
-- Eight tables were sequentially scanned on every section load, so a
-- tenant's page speed was coupled to every other tenant's row count.
-- Composite where a status filter always follows.
create index if not exists sites_env_idx      on public.sites(environment_id);
create index if not exists subnets_env_idx    on public.subnets(environment_id);
create index if not exists circuits_env_idx   on public.circuits(environment_id);
create index if not exists incidents_env_idx  on public.incidents(environment_id, closed_at);
create index if not exists monitors_env_idx   on public.monitors(environment_id, enabled);
create index if not exists changes_env_idx    on public.changes(environment_id, performed_at desc);
create index if not exists tickets_env_idx    on public.tickets(environment_id, status);
create index if not exists reports_env_idx2   on public.reports(environment_id, created_at desc);
create index if not exists audit_actor_idx    on public.audit_log(actor, at desc);
create index if not exists assets_env_eos_idx on public.assets(environment_id, eos_date)
  where eos_date is not null;

-- ── S1. env_summary in a single pass ────────────────────────
-- Was eight correlated subqueries per environment: 154,688 cost and
-- 54 ms at 350 rows, on every dashboard mount. Now one lateral join
-- per source table, each hitting the indexes above.
drop view if exists public.env_summary;
create view public.env_summary as
  select v.id, v.org_id, v.name, v.slug, v.status, v.tier,
         coalesce(a.assets,0)          as assets,
         coalesce(a.assets_up,0)       as assets_up,
         coalesce(a.eos_soon,0)        as eos_soon,
         coalesce(s.sites,0)           as sites,
         coalesce(f.open_findings,0)   as open_findings,
         coalesce(f.urgent_findings,0) as urgent_findings,
         coalesce(i.open_incidents,0)  as open_incidents,
         coalesce(g.agents,0)          as agents
    from public.environments v
    left join lateral (
      select count(*) as assets,
             count(*) filter (where status='up') as assets_up,
             count(*) filter (where eos_date is not null
                              and eos_date < current_date + interval '12 months') as eos_soon
        from public.assets where environment_id = v.id) a on true
    left join lateral (
      select count(*) as sites from public.sites where environment_id = v.id) s on true
    left join lateral (
      select count(*) filter (where status='Open') as open_findings,
             count(*) filter (where status='Open'
                              and severity in ('Critical','High')) as urgent_findings
        from public.findings where environment_id = v.id) f on true
    left join lateral (
      select count(*) as open_incidents from public.incidents
       where environment_id = v.id and closed_at is null) i on true
    left join lateral (
      select count(*) as agents from public.agents
       where environment_id = v.id and revoked_at is null) g on true;
grant select on public.env_summary to authenticated;

-- ── S3 / S9. retention ──────────────────────────────────────
-- agent_reports projected at 2.6M rows and 5 GB per year with no
-- pruning. Retention is a visible workspace setting rather than silent
-- data loss, and defaults to 90 days of raw payloads.
alter table public.orgs add column if not exists retention_days int not null default 90;

create or replace function public.prune_agent_reports()
returns bigint language plpgsql security definer set search_path = public as $$
declare n bigint;
begin
  with gone as (
    delete from public.agent_reports r
     using public.environments v, public.orgs o
     where r.environment_id = v.id and v.org_id = o.id
       and r.collected_at < now() - (o.retention_days || ' days')::interval
    returning 1)
  select count(*) into n from gone;
  return n;
end $$;

create or replace function public.prune_audit_log()
returns bigint language plpgsql security definer set search_path = public as $$
declare n bigint;
begin
  with gone as (
    delete from public.audit_log l
     using public.environments v, public.orgs o
     where l.environment_id = v.id and v.org_id = o.id
       and l.at < now() - (o.retention_days || ' days')::interval
    returning 1)
  select count(*) into n from gone;
  return n;
end $$;

revoke execute on function public.prune_agent_reports(), public.prune_audit_log() from public;

-- ── S6. snapshot assembled server side ──────────────────────
-- Was seven full table reads into the browser, which silently truncated
-- at the row cap and stamped an incomplete snapshot as evidence.
create or replace function public.build_report_snapshot(p_env uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'sites',     coalesce((select jsonb_agg(to_jsonb(t)) from public.sites     t where t.environment_id=p_env),'[]'::jsonb),
    'assets',    coalesce((select jsonb_agg(to_jsonb(t)) from public.assets    t where t.environment_id=p_env),'[]'::jsonb),
    'findings',  coalesce((select jsonb_agg(to_jsonb(t)) from public.findings  t where t.environment_id=p_env),'[]'::jsonb),
    'incidents', coalesce((select jsonb_agg(to_jsonb(t)) from public.incidents t where t.environment_id=p_env),'[]'::jsonb),
    'monitors',  coalesce((select jsonb_agg(to_jsonb(t)) from public.monitors  t where t.environment_id=p_env),'[]'::jsonb),
    'changes',   coalesce((select jsonb_agg(to_jsonb(t)) from public.changes   t where t.environment_id=p_env),'[]'::jsonb),
    'tickets',   coalesce((select jsonb_agg(to_jsonb(t)) from public.tickets   t where t.environment_id=p_env),'[]'::jsonb))
  where public.can_see_env(p_env);
$$;

create or replace function public.issue_report(
  p_env uuid, p_period text default 'Last 30 days', p_days int default 30)
returns uuid language plpgsql security definer set search_path = public as $$
declare r uuid; snap jsonb; v public.environments%rowtype;
begin
  if not public.can_write_env(p_env) then raise exception 'not permitted'; end if;
  select * into v from public.environments where id = p_env;
  snap := public.build_report_snapshot(p_env);
  insert into public.reports(environment_id, title, period, period_from, period_to,
                             tier, status, issued_at, snapshot, generated_by)
  values (p_env, v.name, p_period, (current_date - p_days), current_date,
          v.tier, 'Issued', now(), snap, auth.uid())
  returning id into r;
  return r;
end $$;

revoke execute on function public.build_report_snapshot(uuid), public.issue_report(uuid,text,int) from public;
grant execute on function public.build_report_snapshot(uuid), public.issue_report(uuid,text,int) to authenticated;

-- realtime for the two tables the dashboard subscribes to
do $$ begin
  alter publication supabase_realtime add table public.findings;
exception when others then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.agent_reports;
exception when others then null; end $$;

grant select, insert, update, delete on all tables in schema public to authenticated;
revoke insert, update, delete, truncate on public.audit_log from authenticated;
