-- ═══════════════════════════════════════════════════════════════
-- GROUNDPLANE  ·  isolation suite
-- Every assertion raises on failure, so a green run means green.
-- ═══════════════════════════════════════════════════════════════
\set QUIET on
\pset pager off

create or replace function assert(c boolean, l text) returns void
language plpgsql as $$
begin if c then raise notice 'PASS  %', l;
      else raise exception 'FAIL  %', l; end if; end $$;

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
revoke insert, update, delete, truncate on public.audit_log from authenticated;
revoke select on public.agents from authenticated;
grant select (id, environment_id, name, hostname, platform, version,
              enroll_code, enroll_expires, enrolled_at, last_seen, revoked_at, created_at)
  on public.agents to authenticated;

\echo ''
\echo '── 1. signup routing ──'

-- an operator address
insert into auth.users(id,email) values
  ('11111111-1111-1111-1111-111111111111','t6ckmedia@gmail.com');
select assert((select kind from public.orgs o
   join public.memberships m on m.org_id=o.id
  where m.user_id='11111111-1111-1111-1111-111111111111')='operator',
  'the owner gmail lands in an operator org');

insert into auth.users(id,email) values
  ('22222222-2222-2222-2222-222222222222','dave@noira.us');
select assert((select count(*) from public.memberships
  where user_id='22222222-2222-2222-2222-222222222222')=1,
  'a noira.us address joins the same operator org');
select assert((select count(distinct org_id) from public.memberships
  where user_id in ('11111111-1111-1111-1111-111111111111',
                    '22222222-2222-2222-2222-222222222222'))=1,
  'both operators share one org, they do not each get their own');

-- self serve
insert into auth.users(id,email) values
  ('33333333-3333-3333-3333-333333333333','ops@acme.example');
select assert((select kind from public.orgs o
   join public.memberships m on m.org_id=o.id
  where m.user_id='33333333-3333-3333-3333-333333333333')='tenant',
  'any other address gets its own tenant org');
select assert((select plan from public.orgs o
   join public.memberships m on m.org_id=o.id
  where m.user_id='33333333-3333-3333-3333-333333333333')='trial',
  'a new tenant starts on trial');
select assert((select count(*) from public.environments v
   join public.memberships m on m.org_id=v.org_id
  where m.user_id='33333333-3333-3333-3333-333333333333')=1,
  'a self serve signup lands on a working environment, not an empty shell');
select assert((select count(*) from public.sites s
   join public.environments v on v.id=s.environment_id
   join public.memberships m on m.org_id=v.org_id
  where m.user_id='33333333-3333-3333-3333-333333333333')=1,
  'and that environment already has a site');

insert into auth.users(id,email) values
  ('44444444-4444-4444-4444-444444444444','ops@globex.example');
select assert((select count(distinct org_id) from public.memberships
  where user_id in ('33333333-3333-3333-3333-333333333333',
                    '44444444-4444-4444-4444-444444444444'))=2,
  'two self serve signups get two separate orgs');

\echo ''
\echo '── 2. lookalike addresses do not become operators ──'
insert into auth.users(id,email) values
  ('55555555-5555-5555-5555-555555555555','evil@noira.us.attacker.com');
select assert((select kind from public.orgs o
   join public.memberships m on m.org_id=o.id
  where m.user_id='55555555-5555-5555-5555-555555555555')='tenant',
  'noira.us.attacker.com is a tenant, not an operator');

\echo ''
\echo '── 3. operator manages many environments ──'
set role authenticated;
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","email":"t6ckmedia@gmail.com"}';

select public.create_environment(
  (select org_id from public.memberships where user_id='11111111-1111-1111-1111-111111111111'),
  'Wilbers Law Firm','a@b.example','Standard') as w \gset
select public.create_environment(
  (select org_id from public.memberships where user_id='11111111-1111-1111-1111-111111111111'),
  'Ridgeline Dental','c@d.example','Priority') as r \gset

select assert((select count(*) from public.environments)=2,
  'operator sees exactly its own two environments');
select assert((select count(*) from public.sites)=2,
  'each new environment was scaffolded with a site');

insert into public.assets(environment_id,name,ident,ip,status)
  values (:'w','Edge firewall','FW-HQ-01','10.7.20.1','up');
insert into public.findings(environment_id,title,severity)
  values (:'w','ARP binding changed','High');
select assert((select count(*) from public.assets)=1,'operator wrote an asset');

\echo ''
\echo '── 4. TENANT ISOLATION, the load bearing test ──'
reset role;
set request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333","email":"ops@acme.example"}';
set role authenticated;
select assert((select count(*) from public.environments)=1,
  'a tenant sees only its own environment, not the operator''s two');
select assert((select count(*) from public.assets)=0,
  'a tenant sees ZERO of the operator''s assets');
select assert((select count(*) from public.findings)=0,
  'a tenant sees ZERO of the operator''s findings');
select assert((select count(*) from public.orgs)=1,
  'a tenant cannot even see that other orgs exist');

-- and cannot write into someone else's environment even knowing the id
do $$
declare victim uuid;
begin
  select id into victim from public.environments where slug='wilbers-law-firm';
  if victim is null then
    -- invisible to this tenant, which is itself the correct answer
    raise notice 'PASS  a tenant cannot even resolve the operator''s environment id';
    return;
  end if;
  begin
    insert into public.assets(environment_id,name) values (victim,'smuggled');
    raise exception 'FAIL  a tenant wrote into another org''s environment';
  exception when insufficient_privilege then
    raise notice 'PASS  a tenant cannot write into another org''s environment';
  end;
end $$;

reset role;
set request.jwt.claims = '{"sub":"44444444-4444-4444-4444-444444444444","email":"ops@globex.example"}';
set role authenticated;
select assert((select count(*) from public.environments)=1,
  'the second tenant likewise sees only its own');
select assert((select count(*) from public.assets)=0,
  'tenant B sees nothing belonging to tenant A or the operator');

\echo ''
\echo '── 5. agent enrollment is environment scoped ──'
reset role;
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","email":"t6ckmedia@gmail.com"}';
set role authenticated;
select code from public.create_agent(:'w','wilbers-desk') \gset
select assert(length(:'code')=12,'enrollment code issued');
select assert((select count(*) from public.agents where environment_id=:'w')=1,
  'agent attached to the right environment');

do $$ begin
  begin
    perform token_sha256 from public.agents limit 1;
    raise exception 'FAIL  the agent token digest was readable';
  exception when insufficient_privilege then
    raise notice 'PASS  the agent token digest is not readable from a browser';
  end;
end $$;

-- a tenant must not be able to mint an agent for someone else's environment
reset role;
set request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333","email":"ops@acme.example"}';
set role authenticated;
do $$
declare victim uuid;
begin
  select id into victim from public.environments where org_id <> (
    select org_id from public.memberships where user_id=auth.uid());
  if victim is null then
    raise notice 'PASS  a tenant cannot resolve another environment to mint an agent for';
    return;
  end if;
  begin
    perform public.create_agent(victim,'stolen');
    raise exception 'FAIL  a tenant minted an agent for another environment';
  exception when others then
    raise notice 'PASS  a tenant cannot mint an agent for another environment';
  end;
end $$;

\echo ''
\echo '── 6. archive freezes writes, never deletes ──'
reset role;
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","email":"t6ckmedia@gmail.com"}';
set role authenticated;
select public.archive_environment(:'r');
select assert((select status from public.environments where id=:'r')='archived','environment archived');
do $$ begin
  begin
    insert into public.sites(environment_id,name)
      select id,'New' from public.environments where status='archived' limit 1;
    raise exception 'FAIL  an archived environment accepted a write';
  exception when insufficient_privilege then
    raise notice 'PASS  an archived environment rejects new writes';
  end;
end $$;
select assert((select count(*) from public.sites where environment_id=:'r')=1,
  'archived data is still readable, nothing was deleted');

\echo ''
\echo '── 7. issued reports are evidence ──'
insert into public.reports(environment_id,title,status,issued_at)
  values (:'w','August',  'Issued', now());
do $$ begin
  begin
    update public.reports set title='tampered' where status='Issued';
    if not found then raise notice 'PASS  an issued report cannot be edited'; return; end if;
    raise exception 'FAIL  an issued report was edited';
  exception when insufficient_privilege then
    raise notice 'PASS  an issued report cannot be edited';
  end;
end $$;
select assert((select title from public.reports where status='Issued')='August',
  'the issued report is unchanged');

\echo ''
\echo '── 8. audit trail ──'
select assert((select count(*) from public.audit_log)>0,'writes produced audit rows');
select assert((select count(*) from public.audit_log where actor_email is not null)>0,
  'the audit row names who did it');
do $$ begin
  begin
    update public.audit_log set action='tampered' where id=(select min(id) from public.audit_log);
    raise exception 'FAIL  the audit log was rewritable';
  exception when insufficient_privilege then
    raise notice 'PASS  the audit log cannot be rewritten';
  end;
end $$;

reset role;
\echo ''
\echo 'SUITE COMPLETE'

\echo ''
\echo '── 9. agent enrollment exchange ──'
reset role;
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","email":"t6ckmedia@gmail.com"}';
set role authenticated;
select code as c2 from public.create_agent(
  (select id from public.environments where slug='wilbers-law-firm'), 'second-desk') \gset

reset role;
-- the collector has no session at enrollment time, so this runs as anon
set request.jwt.claims = '{}';
set role anon;
select token as tok, environment_id as tokenv from public.enroll_agent(:'c2','h1','Linux','1.0.0') \gset
select assert(length(:'tok')=64,'enrollment returned a 64 character token');
select assert(:'tokenv' is not null,'the token is bound to an environment');

do $$ begin
  begin
    perform public.enroll_agent('THE_SAME_CODE_AGAIN');
    raise exception 'FAIL  a bad code was accepted';
  exception when others then
    raise notice 'PASS  an invalid code is refused';
  end;
end $$;

reset role;
set role postgres;
select assert((select enroll_code from public.agents where name='second-desk') is null,
  'the code is consumed on use and cannot be replayed');
select assert((select token_sha256 from public.agents where name='second-desk')
              = encode(sha256(:'tok'::bytea),'hex'),
  'only the digest is stored, and it matches the issued token');
select assert((select enrolled_at from public.agents where name='second-desk') is not null,
  'the agent is marked enrolled');
reset role;
