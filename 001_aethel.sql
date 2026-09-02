-- ═══════════════════════════════════════════════════════════════
-- AETHEL  ·  schema
-- Run once in the Supabase SQL editor. Safe to re-run.
--
-- Access model, deliberately simple because this is Noira's internal
-- console, not a client-facing portal:
--
--   Only an operator may read or write anything. An operator is an
--   account whose verified email is t6ckmedia@gmail.com or ends in
--   @noira.us. Everyone else sees zero rows, not an error screen.
--
--   Clients are how DATA is separated, not how PEOPLE are separated.
--   Every operator sees every client. If you later hire a tech who
--   should only see two clients, section 7 has the opt-in restriction
--   already written; it is inert until you insert a row.
--
-- Nothing here stores a password, key, PSK or door code. Reference
-- labels only, pointing at whatever vault you already use.
-- ═══════════════════════════════════════════════════════════════

-- ── 1. WHO IS AN OPERATOR ──────────────────────────────────────
-- SECURITY DEFINER with a pinned search_path. It reads the JWT rather
-- than a table, so there is no row to spoof and no recursion risk.

create or replace function public.is_operator()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce(
    lower(auth.jwt() ->> 'email') = 't6ckmedia@gmail.com'
    or lower(auth.jwt() ->> 'email') like '%@noira.us',
  false);
$$;

revoke execute on function public.is_operator() from public;
grant execute on function public.is_operator() to authenticated;

-- ── 2. CLIENTS ─────────────────────────────────────────────────

create table if not exists public.clients (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  slug          text not null unique,
  status        text not null default 'active'
                check (status in ('active','onboarding','archived')),
  contact_name  text,
  contact_email text,
  phone         text,
  address       text,
  tier          text default 'Standard',
  sla_response_mins int default 240,
  sla_resolve_mins  int default 2880,
  business_hours text default 'Mon to Fri, 08:00 to 17:00',
  renewal_date  date,
  notes         text,
  -- blocks export and outbound calls for a sensitive engagement
  restricted    boolean not null default false,
  archived_at   timestamptz,
  retention_until date,
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now()
);
create index if not exists clients_active_idx on public.clients(status) where status <> 'archived';

-- ── 3. CLIENT SCOPED RECORDS ───────────────────────────────────
-- Every table carries client_id. That single column is the whole
-- separation guarantee, and section 6 enforces it in policy.

create table if not exists public.sites (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  name text not null, address text, state text default 'Online',
  contact text, access_notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.assets (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  site_id uuid references public.sites(id) on delete set null,
  name text not null, ident text, kind text, vendor text, model text,
  serial text, firmware text, ip inet, mac macaddr,
  status text default 'up' check (status in ('up','degraded','down','unknown')),
  purchase_date date, warranty_end date, eos_date date,
  location text, rack_unit int,
  vault_ref text,                 -- label only, never a credential
  created_at timestamptz not null default now()
);
create index if not exists assets_client_idx on public.assets(client_id);

create table if not exists public.subnets (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  site_id uuid references public.sites(id) on delete set null,
  cidr cidr not null, purpose text, gateway inet,
  vlan_id int check (vlan_id between 1 and 4094), vlan_name text,
  dhcp_start inet, dhcp_end inet,
  created_at timestamptz not null default now()
);

create table if not exists public.circuits (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  site_id uuid references public.sites(id) on delete set null,
  carrier text, service_id text, bandwidth text,
  contract_end date, support_phone text,
  created_at timestamptz not null default now()
);

create table if not exists public.findings (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  asset_id uuid references public.assets(id) on delete set null,
  title text not null,
  severity text not null default 'Low'
    check (severity in ('Critical','High','Medium','Low','Info')),
  domain text, evidence text, remediation text,
  owner text, due_date date, seen int default 1,
  status text not null default 'Open'
    check (status in ('Open','In progress','Accepted','Resolved')),
  opened date not null default current_date,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists findings_open_idx on public.findings(client_id) where status = 'Open';

create table if not exists public.incidents (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  title text not null,
  severity text not null default 'Medium'
    check (severity in ('Critical','High','Medium','Low')),
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  containment text, root_cause text, lessons text,
  created_at timestamptz not null default now()
);

create table if not exists public.monitors (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  site_id uuid references public.sites(id) on delete set null,
  name text not null,
  kind text default 'Agent' check (kind in ('Agent','Worker')),
  target text, location text,
  interval_secs int default 300,
  enabled boolean not null default true,
  checkins int default 0,
  last_seen timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.changes (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  what text not null, why text, where_at text,
  performed_by text,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.tickets (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  site_id uuid references public.sites(id) on delete set null,
  subject text not null,
  priority text default 'Normal' check (priority in ('Urgent','High','Normal','Low')),
  status text default 'Open' check (status in ('Open','Waiting','Resolved','Closed')),
  minutes int default 0,
  billing text default 'Contract' check (billing in ('Contract','Billable','Internal')),
  opened_at timestamptz not null default now(),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

-- added after the first cut: the ticket editor needs somewhere to put
-- who asked, who owns it, and what happened. Idempotent so this file
-- stays safe to re-run over an existing database.
alter table public.tickets add column if not exists requester text;
alter table public.tickets add column if not exists assignee  text;
alter table public.tickets add column if not exists detail    text;

-- A report is evidence. It stores the snapshot it was built from, so a
-- number can still be explained months later. No update policy exists.
create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  title text, period text,
  period_from date, period_to date,
  sections jsonb not null default '{}'::jsonb,
  snapshot jsonb not null default '{}'::jsonb,
  devices int, availability numeric, alerts int, traffic text,
  generated_by uuid references auth.users(id) on delete set null,
  generated_at timestamptz not null default now()
);
create index if not exists reports_client_idx on public.reports(client_id, generated_at desc);

-- ── 4. AUDIT ───────────────────────────────────────────────────
-- Append only. No update or delete policy, and the privilege is
-- revoked, so history cannot be rewritten through the API.

create table if not exists public.audit_log (
  id bigserial primary key,
  client_id uuid,
  actor uuid,
  actor_email text,
  action text not null,
  table_name text not null,
  row_id uuid,
  at timestamptz not null default now()
);
create index if not exists audit_client_idx on public.audit_log(client_id, at desc);

create or replace function public.audit_write()
returns trigger language plpgsql security definer
set search_path = public as $$
declare r record;
begin
  r := coalesce(new, old);
  insert into public.audit_log(client_id, actor, actor_email, action, table_name, row_id)
  values (r.client_id, auth.uid(), auth.jwt() ->> 'email', lower(tg_op), tg_table_name, r.id);
  return coalesce(new, old);
end $$;

-- ── 5. OPTIONAL PER OPERATOR CLIENT RESTRICTION ────────────────
-- Empty table means every operator sees every client. Insert rows only
-- when you want to narrow someone. Opt-in, so it is never a lockout.

create table if not exists public.operator_scope (
  user_id   uuid not null references auth.users(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  primary key (user_id, client_id)
);

create or replace function public.can_see_client(c uuid)
returns boolean
language sql stable security definer
set search_path = public as $$
  select public.is_operator() and (
    not exists (select 1 from public.operator_scope s where s.user_id = auth.uid())
    or exists (select 1 from public.operator_scope s
                where s.user_id = auth.uid() and s.client_id = c)
  );
$$;
grant execute on function public.can_see_client(uuid) to authenticated;

create or replace function public.can_write_client(c uuid)
returns boolean
language sql stable security definer
set search_path = public as $$
  select public.can_see_client(c)
     and coalesce((select status from public.clients where id = c), '') <> 'archived';
$$;
grant execute on function public.can_write_client(uuid) to authenticated;

-- ── 6. RLS ─────────────────────────────────────────────────────


-- ── column reconciliation ───────────────────────────────────
-- The record editor exposes these fields. Adding them idempotently so
-- this file stays safe to re-run over an existing database, and so no
-- editor field can fail to save against a missing column.
alter table public.sites     add column if not exists hours   text;
alter table public.sites     add column if not exists notes   text;
alter table public.findings  add column if not exists due     date;
alter table public.findings  add column if not exists detail  text;
alter table public.incidents add column if not exists summary text;

alter table public.clients enable row level security;
alter table public.clients force row level security;

drop policy if exists clients_select on public.clients;
create policy clients_select on public.clients for select to authenticated
  using (public.can_see_client(id));

drop policy if exists clients_insert on public.clients;
create policy clients_insert on public.clients for insert to authenticated
  with check (public.is_operator());

drop policy if exists clients_update on public.clients;
create policy clients_update on public.clients for update to authenticated
  using (public.can_see_client(id)) with check (public.can_see_client(id));
-- no delete policy: offboarding archives, it never drops.

do $$
declare t text;
  scoped text[] := array['sites','assets','subnets','circuits','findings',
                         'incidents','monitors','changes','tickets','reports'];
begin
  foreach t in array scoped loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);

    execute format($f$
      drop policy if exists %1$s_sel on public.%1$I;
      create policy %1$s_sel on public.%1$I for select to authenticated
        using (public.can_see_client(client_id));
    $f$, t);

    execute format($f$
      drop policy if exists %1$s_ins on public.%1$I;
      create policy %1$s_ins on public.%1$I for insert to authenticated
        with check (public.can_write_client(client_id));
    $f$, t);

    -- a report is evidence, so it gets no update or delete path
    if t <> 'reports' then
      execute format($f$
        drop policy if exists %1$s_upd on public.%1$I;
        create policy %1$s_upd on public.%1$I for update to authenticated
          using (public.can_write_client(client_id))
          with check (public.can_write_client(client_id));
      $f$, t);
      execute format($f$
        drop policy if exists %1$s_del on public.%1$I;
        create policy %1$s_del on public.%1$I for delete to authenticated
          using (public.can_write_client(client_id));
      $f$, t);
    end if;

    execute format('drop trigger if exists %1$s_audit on public.%1$I', t);
    execute format($f$
      create trigger %1$s_audit after insert or update or delete on public.%1$I
      for each row execute function public.audit_write();
    $f$, t);
  end loop;
end $$;

revoke update, delete on public.reports from authenticated;

alter table public.audit_log enable row level security;
alter table public.audit_log force row level security;
drop policy if exists audit_sel on public.audit_log;
create policy audit_sel on public.audit_log for select to authenticated
  using (public.is_operator());
revoke insert, update, delete, truncate on public.audit_log from authenticated;
grant select on public.audit_log to authenticated;

alter table public.operator_scope enable row level security;
alter table public.operator_scope force row level security;
drop policy if exists scope_all on public.operator_scope;
create policy scope_all on public.operator_scope for all to authenticated
  using (public.is_operator()) with check (public.is_operator());

-- ── 7. NON OPERATOR SIGNUPS ────────────────────────────────────
-- Supabase will happily create an account for any email. The policies
-- above already return zero rows for one, but rejecting at signup is
-- clearer than letting someone in to an empty console.

create or replace function public.reject_non_operator()
returns trigger language plpgsql security definer
set search_path = public as $$
begin
  if not (lower(new.email) = 't6ckmedia@gmail.com'
          or lower(new.email) like '%@noira.us') then
    raise exception 'This console is restricted to Noira operators.';
  end if;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  before insert on auth.users
  for each row execute function public.reject_non_operator();

-- ── 8. ONE FORM CLIENT CREATION ────────────────────────────────
-- A new client comes out with a site and a default monitor already in
-- place, so it is a working space rather than an empty shell.

create or replace function public.create_client(
  p_name text,
  p_contact_email text default null,
  p_tier text default 'Standard'
) returns uuid
language plpgsql security definer
set search_path = public as $$
declare new_id uuid; s text;
begin
  if not public.is_operator() then
    raise exception 'Not permitted';
  end if;

  s := trim(both '-' from regexp_replace(lower(p_name), '[^a-z0-9]+', '-', 'g'));
  if exists (select 1 from public.clients where slug = s) then
    s := s || '-' || substr(gen_random_uuid()::text, 1, 4);
  end if;

  insert into public.clients(name, slug, status, contact_email, tier, created_by)
  values (p_name, s, 'onboarding', p_contact_email, p_tier, auth.uid())
  returning id into new_id;

  insert into public.sites(client_id, name, state)
  values (new_id, 'Main site', 'Online');

  insert into public.changes(client_id, what, why, performed_by)
  values (new_id, 'Client created', 'Onboarding', auth.jwt() ->> 'email');

  return new_id;
end $$;
grant execute on function public.create_client(text,text,text) to authenticated;

create or replace function public.archive_client(p_client uuid, p_years int default 7)
returns void language plpgsql security definer
set search_path = public as $$
begin
  if not public.is_operator() then raise exception 'Not permitted'; end if;
  update public.clients
     set status='archived', archived_at=now(),
         retention_until=(current_date + (p_years || ' years')::interval)::date
   where id = p_client;
  insert into public.changes(client_id, what, why, performed_by)
  values (p_client, 'Client archived', 'Offboarding', auth.jwt() ->> 'email');
end $$;
grant execute on function public.archive_client(uuid,int) to authenticated;

-- ── 9. DASHBOARD ROLLUP ────────────────────────────────────────
-- One round trip for the overview instead of eight.

create or replace view public.client_summary as
  select c.id, c.name, c.slug, c.status, c.tier,
    (select count(*) from public.assets   a where a.client_id = c.id) as assets,
    (select count(*) from public.assets   a where a.client_id = c.id and a.status = 'up') as assets_up,
    (select count(*) from public.sites    s where s.client_id = c.id) as sites,
    (select count(*) from public.findings f where f.client_id = c.id and f.status = 'Open') as open_findings,
    (select count(*) from public.findings f where f.client_id = c.id and f.status = 'Open'
       and f.severity in ('Critical','High')) as urgent_findings,
    (select count(*) from public.incidents i where i.client_id = c.id and i.closed_at is null) as open_incidents,
    (select count(*) from public.monitors  m where m.client_id = c.id and m.enabled) as monitors,
    (select count(*) from public.assets a where a.client_id = c.id
       and a.eos_date is not null and a.eos_date < current_date + interval '12 months') as eos_soon
  from public.clients c;

grant select on public.client_summary to authenticated;

-- ── table privileges ────────────────────────────────────────
-- RLS decides which ROWS a caller may see. It does not grant access to
-- the table in the first place. Supabase sets default privileges that
-- usually cover this, but relying on that is fragile: if the defaults
-- are ever changed the whole console returns "permission denied" with
-- policies that look correct. Granting explicitly removes the guess.
-- RLS still filters every row; these grants only open the door.
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- the audit trail stays append only regardless of the blanket grant above
revoke insert, update, delete, truncate on public.audit_log from authenticated;
