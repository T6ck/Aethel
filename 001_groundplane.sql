-- ═══════════════════════════════════════════════════════════════
-- GROUNDPLANE  ·  schema
-- Run once in the Supabase SQL editor. Safe to re-run.
--
-- THE ONE IDEA THAT MAKES BOTH MODELS COEXIST
--
--   Everything is scoped to an ENVIRONMENT, never to a customer.
--
--   An operator org (an MSP like Noira) owns many environments, one
--   per client on its book.
--   A tenant org (a self-serve subscriber) owns exactly one: its own.
--
--   Both read and write the same tables through the same policies.
--   There is no second data model, no forked query path, and no
--   "if operator then..." branch anywhere in the database. The only
--   difference between the two products is how many environments an
--   org happens to own, and what the interface chooses to show.
--
-- ACCESS
--   Membership of the owning org is the only thing that grants sight
--   of an environment. That single predicate is enforced in one
--   SECURITY DEFINER function used by every policy, so tenant
--   isolation cannot drift table by table.
-- ═══════════════════════════════════════════════════════════════

-- ── 1. ORGS AND MEMBERSHIP ──────────────────────────────────

create table if not exists public.orgs (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null unique,
  -- 'operator' manages other companies' environments (the MSP console)
  -- 'tenant'   manages only its own (the self-serve product)
  kind        text not null default 'tenant' check (kind in ('operator','tenant')),
  plan        text not null default 'trial'
              check (plan in ('trial','watch','managed','priority','operator')),
  -- Stripe fields sit here unused until keys are added. Nothing reads
  -- them yet; they exist so billing is a wiring job, not a migration.
  stripe_customer_id     text,
  stripe_subscription_id text,
  plan_status text not null default 'active'
              check (plan_status in ('active','past_due','canceled','trialing')),
  trial_ends  date,
  created_at  timestamptz not null default now()
);
create index if not exists orgs_kind_idx on public.orgs(kind);

create table if not exists public.memberships (
  org_id  uuid not null references public.orgs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role    text not null default 'member' check (role in ('owner','admin','member','viewer')),
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);
create index if not exists memberships_user_idx on public.memberships(user_id);

-- ── 2. WHICH ADDRESSES BECOME OPERATORS ─────────────────────
-- Editable data, not a hardcoded string, so onboarding a second
-- operator firm never needs a code change.

create table if not exists public.operator_domains (
  domain text primary key,
  org_slug text not null
);
insert into public.operator_domains(domain, org_slug)
  values ('noira.us','noira') on conflict do nothing;

create table if not exists public.operator_emails (
  email text primary key,
  org_slug text not null
);
insert into public.operator_emails(email, org_slug)
  values ('t6ckmedia@gmail.com','noira') on conflict do nothing;

-- ── 3. ENVIRONMENTS ─────────────────────────────────────────
-- The universal scope. An MSP's client and a self-serve subscriber's
-- own estate are the same kind of thing here.

create table if not exists public.environments (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.orgs(id) on delete cascade,
  name        text not null,
  slug        text not null,
  status      text not null default 'active'
              check (status in ('active','onboarding','archived')),
  contact_name text, contact_email text, contact_phone text,
  tier        text default 'Standard',
  sla_response_mins int default 240,
  sla_resolve_mins  int default 2880,
  business_hours text default 'Mon to Fri, 08:00 to 17:00',
  renewal_date date,
  notes       text,
  brand_name  text,
  archived_at timestamptz,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (org_id, slug)
);
create index if not exists env_org_idx on public.environments(org_id, status);

-- ── 4. ACCESS PREDICATES ────────────────────────────────────
-- SECURITY DEFINER because a policy on memberships that queries
-- memberships recurses. search_path pinned so nothing can shadow it.

create or replace function public.my_orgs()
returns setof uuid language sql stable security definer
set search_path = public as $$
  select org_id from public.memberships where user_id = auth.uid();
$$;

create or replace function public.can_see_env(e uuid)
returns boolean language sql stable security definer
set search_path = public as $$
  select exists (
    select 1 from public.environments v
     join public.memberships m on m.org_id = v.org_id
    where v.id = e and m.user_id = auth.uid()
  );
$$;

-- writes additionally refused on an archived environment
create or replace function public.can_write_env(e uuid)
returns boolean language sql stable security definer
set search_path = public as $$
  select public.can_see_env(e)
     and coalesce((select status from public.environments where id = e),'') <> 'archived';
$$;

create or replace function public.is_operator()
returns boolean language sql stable security definer
set search_path = public as $$
  select exists (
    select 1 from public.memberships m
      join public.orgs o on o.id = m.org_id
     where m.user_id = auth.uid() and o.kind = 'operator'
  );
$$;

create or replace function public.has_org_role(o uuid, roles text[])
returns boolean language sql stable security definer
set search_path = public as $$
  select exists (
    select 1 from public.memberships m
     where m.org_id = o and m.user_id = auth.uid() and m.role = any(roles)
  );
$$;

revoke execute on function public.my_orgs(), public.can_see_env(uuid),
  public.can_write_env(uuid), public.is_operator(), public.has_org_role(uuid,text[]) from public;
grant execute on function public.my_orgs(), public.can_see_env(uuid),
  public.can_write_env(uuid), public.is_operator(), public.has_org_role(uuid,text[]) to authenticated;

-- ── 5. SIGNUP ROUTING ───────────────────────────────────────
-- An operator address joins the existing operator org. Anything else
-- gets its own tenant org and one environment, so a self-serve user
-- lands on a working product rather than an empty shell.

create or replace function public.handle_signup()
returns trigger language plpgsql security definer
set search_path = public as $$
declare
  target_slug text;
  target_org  uuid;
  new_env     uuid;
  base        text;
  n           int := 0;
begin
  select og.org_slug into target_slug
    from public.operator_emails og where lower(og.email) = lower(new.email);
  if target_slug is null then
    select od.org_slug into target_slug
      from public.operator_domains od
     where lower(od.domain) = lower(split_part(new.email,'@',2));
  end if;

  if target_slug is not null then
    -- operator: join the firm, create it on first ever signup
    select id into target_org from public.orgs where slug = target_slug;
    if target_org is null then
      insert into public.orgs(name, slug, kind, plan)
      values (initcap(target_slug), target_slug, 'operator', 'operator')
      returning id into target_org;
    end if;
    insert into public.memberships(org_id, user_id, role)
    values (target_org, new.id,
            case when exists (select 1 from public.memberships where org_id = target_org)
                 then 'member' else 'owner' end)
    on conflict do nothing;
    return new;
  end if;

  -- self serve: its own org, its own single environment
  base := regexp_replace(lower(split_part(new.email,'@',1)), '[^a-z0-9]+', '-', 'g');
  base := nullif(trim(both '-' from base), '');
  base := coalesce(base, 'workspace');
  target_slug := base;
  while exists (select 1 from public.orgs where slug = target_slug) loop
    n := n + 1; target_slug := base || '-' || n;
  end loop;

  insert into public.orgs(name, slug, kind, plan, plan_status, trial_ends)
  values (initcap(replace(base,'-',' ')), target_slug, 'tenant', 'trial', 'trialing',
          (current_date + interval '14 days')::date)
  returning id into target_org;

  insert into public.memberships(org_id, user_id, role)
  values (target_org, new.id, 'owner');

  insert into public.environments(org_id, name, slug, status, contact_email, created_by)
  values (target_org, initcap(replace(base,'-',' ')), 'primary', 'onboarding', new.email, new.id)
  returning id into new_env;

  insert into public.sites(environment_id, name, state)
  values (new_env, 'Head office', 'Online');

  return new;
end $$;

drop trigger if exists on_auth_signup on auth.users;
create trigger on_auth_signup
  after insert on auth.users
  for each row execute function public.handle_signup();

-- ── 6. ENVIRONMENT SCOPED TABLES ────────────────────────────

create table if not exists public.sites (
  id uuid primary key default gen_random_uuid(),
  environment_id uuid not null references public.environments(id) on delete cascade,
  name text not null, address text, contact text, hours text,
  state text default 'Online' check (state in ('Online','Degraded','Offline','Unknown')),
  notes text, created_at timestamptz not null default now()
);

create table if not exists public.assets (
  id uuid primary key default gen_random_uuid(),
  environment_id uuid not null references public.environments(id) on delete cascade,
  site_id uuid references public.sites(id) on delete set null,
  name text not null, ident text, kind text, vendor text, model text,
  serial text, firmware text, ip text, mac text,
  status text default 'up' check (status in ('up','degraded','down','unknown')),
  location text, rack_unit int,
  purchase_date date, warranty_end date, eos_date date,
  -- a label pointing at a password manager. Never a credential.
  vault_ref text,
  discovered_at timestamptz, last_seen timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists assets_env_idx on public.assets(environment_id);

create table if not exists public.subnets (
  id uuid primary key default gen_random_uuid(),
  environment_id uuid not null references public.environments(id) on delete cascade,
  site_id uuid references public.sites(id) on delete set null,
  cidr text not null, purpose text, gateway text, vlan_id int,
  dhcp_start text, dhcp_end text,
  created_at timestamptz not null default now()
);

create table if not exists public.circuits (
  id uuid primary key default gen_random_uuid(),
  environment_id uuid not null references public.environments(id) on delete cascade,
  site_id uuid references public.sites(id) on delete set null,
  carrier text, service_id text, bandwidth text,
  contract_end date, support_phone text,
  created_at timestamptz not null default now()
);

create table if not exists public.findings (
  id uuid primary key default gen_random_uuid(),
  environment_id uuid not null references public.environments(id) on delete cascade,
  asset_id uuid references public.assets(id) on delete set null,
  title text not null,
  severity text not null default 'Low'
    check (severity in ('Critical','High','Medium','Low','Info')),
  domain text, detail text, evidence text, remediation text,
  status text not null default 'Open'
    check (status in ('Open','In progress','Accepted','Resolved')),
  owner text, opened date not null default current_date, due date,
  seen int default 1,
  source text default 'manual' check (source in ('manual','agent','worker')),
  created_at timestamptz not null default now()
);
create index if not exists findings_env_idx on public.findings(environment_id, status);

create table if not exists public.incidents (
  id uuid primary key default gen_random_uuid(),
  environment_id uuid not null references public.environments(id) on delete cascade,
  title text not null,
  severity text not null default 'Medium'
    check (severity in ('Critical','High','Medium','Low')),
  opened_at timestamptz not null default now(), closed_at timestamptz,
  summary text, root_cause text, lessons text,
  created_at timestamptz not null default now()
);

create table if not exists public.monitors (
  id uuid primary key default gen_random_uuid(),
  environment_id uuid not null references public.environments(id) on delete cascade,
  site_id uuid references public.sites(id) on delete set null,
  name text not null, location text,
  kind text default 'Agent' check (kind in ('Agent','Worker')),
  target text, interval_secs int default 300,
  enabled boolean default true,
  checkins int default 0, last_seen timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.changes (
  id uuid primary key default gen_random_uuid(),
  environment_id uuid not null references public.environments(id) on delete cascade,
  what text not null, why text, where_at text,
  performed_by text, performed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.tickets (
  id uuid primary key default gen_random_uuid(),
  environment_id uuid not null references public.environments(id) on delete cascade,
  site_id uuid references public.sites(id) on delete set null,
  subject text not null, requester text, assignee text, detail text,
  priority text default 'Normal' check (priority in ('Urgent','High','Normal','Low')),
  status text default 'Open' check (status in ('Open','Waiting','Resolved','Closed')),
  minutes int default 0,
  billing text default 'Contract' check (billing in ('Contract','Billable','Internal')),
  opened_at timestamptz not null default now(), resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  environment_id uuid not null references public.environments(id) on delete cascade,
  title text, period text, period_from date, period_to date, tier text,
  sections jsonb not null default '{}'::jsonb,
  snapshot jsonb not null default '{}'::jsonb,
  status text not null default 'Draft' check (status in ('Draft','Issued')),
  issued_at timestamptz,
  generated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ── 7. AGENTS ───────────────────────────────────────────────
-- One row per deployed collector. The token is stored only as a
-- SHA-256 digest, so a copy of this table cannot impersonate an agent.
-- enroll_code is a short one-time string the installer exchanges for a
-- real token, so the long secret never rides in a command line.

create table if not exists public.agents (
  id            uuid primary key default gen_random_uuid(),
  environment_id uuid not null references public.environments(id) on delete cascade,
  name          text not null,
  hostname      text,
  platform      text,
  version       text,
  token_sha256  text unique,
  enroll_code   text unique,
  enroll_expires timestamptz,
  enrolled_at   timestamptz,
  last_seen     timestamptz,
  revoked_at    timestamptz,
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now()
);
create index if not exists agents_env_idx on public.agents(environment_id);

create table if not exists public.agent_reports (
  id uuid primary key default gen_random_uuid(),
  environment_id uuid not null references public.environments(id) on delete cascade,
  agent_id uuid references public.agents(id) on delete cascade,
  collected_at timestamptz not null default now(),
  payload jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists agent_reports_env_idx
  on public.agent_reports(environment_id, collected_at desc);

-- ── 8. AUDIT ────────────────────────────────────────────────

create table if not exists public.audit_log (
  id bigserial primary key,
  environment_id uuid,
  actor uuid,
  actor_email text,
  action text not null,
  table_name text not null,
  row_id uuid,
  at timestamptz not null default now()
);
create index if not exists audit_env_idx on public.audit_log(environment_id, at desc);

create or replace function public.audit_write()
returns trigger language plpgsql security definer
set search_path = public as $$
declare r record;
begin
  r := coalesce(new, old);
  insert into public.audit_log(environment_id, actor, actor_email, action, table_name, row_id)
  values (r.environment_id, auth.uid(), auth.jwt() ->> 'email',
          lower(tg_op), tg_table_name, r.id);
  return coalesce(new, old);
end $$;

-- ── 9. RLS ──────────────────────────────────────────────────

do $$
declare t text;
  env_tables text[] := array['sites','assets','subnets','circuits','findings',
    'incidents','monitors','changes','tickets','reports','agents','agent_reports'];
begin
  foreach t in array env_tables loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);

    execute format('drop policy if exists %1$s_sel on public.%1$I', t);
    execute format($f$create policy %1$s_sel on public.%1$I for select to authenticated
      using (public.can_see_env(environment_id));$f$, t);

    execute format('drop policy if exists %1$s_ins on public.%1$I', t);
    execute format($f$create policy %1$s_ins on public.%1$I for insert to authenticated
      with check (public.can_write_env(environment_id));$f$, t);

    execute format('drop policy if exists %1$s_upd on public.%1$I', t);
    execute format($f$create policy %1$s_upd on public.%1$I for update to authenticated
      using (public.can_write_env(environment_id))
      with check (public.can_write_env(environment_id));$f$, t);

    execute format('drop policy if exists %1$s_del on public.%1$I', t);
    execute format($f$create policy %1$s_del on public.%1$I for delete to authenticated
      using (public.can_write_env(environment_id));$f$, t);

    execute format('drop trigger if exists %1$s_audit on public.%1$I', t);
    execute format($f$create trigger %1$s_audit after insert or update or delete
      on public.%1$I for each row execute function public.audit_write();$f$, t);
  end loop;
end $$;

-- an issued report is evidence and does not change
drop policy if exists reports_upd on public.reports;
create policy reports_upd on public.reports for update to authenticated
  using (public.can_write_env(environment_id) and status <> 'Issued')
  with check (public.can_write_env(environment_id));
drop policy if exists reports_del on public.reports;
create policy reports_del on public.reports for delete to authenticated
  using (public.can_write_env(environment_id) and status <> 'Issued');

alter table public.orgs         enable row level security;
alter table public.orgs         force row level security;
alter table public.memberships  enable row level security;
alter table public.memberships  force row level security;
alter table public.environments enable row level security;
alter table public.environments force row level security;
alter table public.audit_log    enable row level security;
alter table public.audit_log    force row level security;

drop policy if exists orgs_sel on public.orgs;
create policy orgs_sel on public.orgs for select to authenticated
  using (id in (select public.my_orgs()));
drop policy if exists orgs_upd on public.orgs;
create policy orgs_upd on public.orgs for update to authenticated
  using (public.has_org_role(id, array['owner','admin']))
  with check (public.has_org_role(id, array['owner','admin']));

drop policy if exists mem_sel on public.memberships;
create policy mem_sel on public.memberships for select to authenticated
  using (user_id = auth.uid() or org_id in (select public.my_orgs()));
drop policy if exists mem_write on public.memberships;
create policy mem_write on public.memberships for all to authenticated
  using (public.has_org_role(org_id, array['owner','admin']))
  with check (public.has_org_role(org_id, array['owner','admin']));

drop policy if exists env_sel on public.environments;
create policy env_sel on public.environments for select to authenticated
  using (org_id in (select public.my_orgs()));
drop policy if exists env_ins on public.environments;
create policy env_ins on public.environments for insert to authenticated
  with check (public.has_org_role(org_id, array['owner','admin']));
drop policy if exists env_upd on public.environments;
create policy env_upd on public.environments for update to authenticated
  using (public.has_org_role(org_id, array['owner','admin']))
  with check (public.has_org_role(org_id, array['owner','admin']));
-- no delete policy: offboarding archives, it never drops

drop policy if exists audit_sel on public.audit_log;
create policy audit_sel on public.audit_log for select to authenticated
  using (public.can_see_env(environment_id));

alter table public.operator_domains enable row level security;
alter table public.operator_domains force row level security;
alter table public.operator_emails  enable row level security;
alter table public.operator_emails  force row level security;
drop policy if exists od_sel on public.operator_domains;
drop policy if exists oe_sel on public.operator_emails;
create policy od_sel on public.operator_domains for select to authenticated using (public.is_operator());
create policy oe_sel on public.operator_emails  for select to authenticated using (public.is_operator());

-- ── 10. OPERATIONS ──────────────────────────────────────────

create or replace function public.create_environment(
  p_org uuid, p_name text, p_email text default null, p_tier text default 'Standard')
returns uuid language plpgsql security definer set search_path = public as $$
declare v uuid; s text; base text; n int := 0;
begin
  if not public.has_org_role(p_org, array['owner','admin']) then
    raise exception 'not permitted';
  end if;
  base := nullif(trim(both '-' from regexp_replace(lower(p_name),'[^a-z0-9]+','-','g')), '');
  base := coalesce(base,'environment'); s := base;
  while exists (select 1 from public.environments where org_id=p_org and slug=s) loop
    n := n+1; s := base||'-'||n;
  end loop;
  insert into public.environments(org_id,name,slug,status,contact_email,tier,created_by)
  values (p_org,p_name,s,'onboarding',p_email,p_tier,auth.uid()) returning id into v;
  insert into public.sites(environment_id,name,state) values (v,'Head office','Online');
  insert into public.changes(environment_id,what,why,performed_by)
  values (v,'Environment created','Onboarding', auth.jwt() ->> 'email');
  return v;
end $$;
grant execute on function public.create_environment(uuid,text,text,text) to authenticated;

create or replace function public.archive_environment(p_env uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.can_see_env(p_env) then raise exception 'not permitted'; end if;
  update public.environments set status='archived', archived_at=now() where id=p_env;
end $$;
grant execute on function public.archive_environment(uuid) to authenticated;

-- Issue an enrollment code. The installer exchanges it once for a real
-- token, so the long secret never appears in a command line or shell
-- history, and the code expires whether or not it is used.
create or replace function public.create_agent(p_env uuid, p_name text)
returns table(agent_id uuid, code text)
language plpgsql security definer set search_path = public as $$
declare c text; a uuid;
begin
  if not public.can_write_env(p_env) then raise exception 'not permitted'; end if;
  -- gen_random_uuid() is core Postgres, so this needs no extension and
  -- cannot break on a search_path that omits `extensions`.
  c := upper(substr(replace(gen_random_uuid()::text,'-',''),1,12));
  insert into public.agents(environment_id, name, enroll_code, enroll_expires, created_by)
  values (p_env, p_name, c, now() + interval '24 hours', auth.uid())
  returning id into a;
  return query select a, c;
end $$;
grant execute on function public.create_agent(uuid,text) to authenticated;

create or replace function public.revoke_agent(p_agent uuid)
returns void language plpgsql security definer set search_path = public as $$
declare e uuid;
begin
  select environment_id into e from public.agents where id=p_agent;
  if not public.can_write_env(e) then raise exception 'not permitted'; end if;
  update public.agents set revoked_at=now(), token_sha256=null where id=p_agent;
end $$;
grant execute on function public.revoke_agent(uuid) to authenticated;

create or replace view public.env_summary as
  select v.id, v.org_id, v.name, v.slug, v.status, v.tier,
    (select count(*) from public.assets   a where a.environment_id=v.id) as assets,
    (select count(*) from public.assets   a where a.environment_id=v.id and a.status='up') as assets_up,
    (select count(*) from public.sites    s where s.environment_id=v.id) as sites,
    (select count(*) from public.findings f where f.environment_id=v.id and f.status='Open') as open_findings,
    (select count(*) from public.findings f where f.environment_id=v.id and f.status='Open'
       and f.severity in ('Critical','High')) as urgent_findings,
    (select count(*) from public.incidents i where i.environment_id=v.id and i.closed_at is null) as open_incidents,
    (select count(*) from public.agents   g where g.environment_id=v.id and g.revoked_at is null) as agents,
    (select count(*) from public.assets a where a.environment_id=v.id
       and a.eos_date is not null and a.eos_date < current_date + interval '12 months') as eos_soon
  from public.environments v;
grant select on public.env_summary to authenticated;

-- ── 11. PRIVILEGES ──────────────────────────────────────────
-- RLS decides which rows. It does not open the table. Granting
-- explicitly removes any dependence on platform defaults.
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
revoke insert, update, delete, truncate on public.audit_log from authenticated;
-- the token digest is never readable from a browser
revoke select on public.agents from authenticated;
grant select (id, environment_id, name, hostname, platform, version,
              enroll_code, enroll_expires, enrolled_at, last_seen, revoked_at, created_at)
  on public.agents to authenticated;

-- Exchange a one time enrollment code for a long lived token.
--
-- Runs as SECURITY DEFINER and is granted to `anon`, because the
-- collector has no session yet at this point. That is safe only because
-- the code is single use, expires, and is the sole thing the function
-- will act on: it cannot be used to read or write anything else. The
-- token is returned once and stored only as a digest, so this row can
-- never reveal it again.
create or replace function public.enroll_agent(
  p_code text, p_hostname text default null,
  p_platform text default null, p_version text default null)
returns table(agent_id uuid, environment_id uuid, token text)
language plpgsql security definer set search_path = public as $$
declare a public.agents%rowtype; tok text;
begin
  select * into a from public.agents
   where enroll_code = upper(p_code)
     and enroll_expires > now()
     and enrolled_at is null
     and revoked_at is null;
  if a.id is null then
    raise exception 'enrollment code is invalid, already used, or expired';
  end if;

  tok := replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-','');

  update public.agents
     set token_sha256 = encode(sha256(tok::bytea),'hex'),
         hostname = coalesce(p_hostname, hostname),
         platform = coalesce(p_platform, platform),
         version  = coalesce(p_version, version),
         enrolled_at = now(),
         enroll_code = null,
         enroll_expires = null
   where id = a.id;

  return query select a.id, a.environment_id, tok;
end $$;

revoke execute on function public.enroll_agent(text,text,text,text) from public;
grant execute on function public.enroll_agent(text,text,text,text) to anon, authenticated;
