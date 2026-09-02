\set QUIET on
\pset pager off
create or replace function assert(c boolean, l text) returns void language plpgsql as $$
begin if c then raise notice 'PASS  %',l; else raise exception 'FAIL  %',l; end if; end $$;

-- The signup trigger rejects non operator emails, which is the point of
-- it. Disable it only to seed the negative test fixture, then restore.
alter table auth.users disable trigger on_auth_user_created;
insert into auth.users(id,email) values
 ('11111111-1111-1111-1111-111111111111','t6ckmedia@gmail.com'),
 ('22222222-2222-2222-2222-222222222222','tech@noira.us'),
 ('33333333-3333-3333-3333-333333333333','randomer@gmail.com'),
 ('44444444-4444-4444-4444-444444444444','scoped@noira.us')
on conflict do nothing;
alter table auth.users enable trigger on_auth_user_created;

-- and prove the trigger itself rejects a non operator signup
do $$ begin
  begin
    insert into auth.users(id,email)
    values (gen_random_uuid(),'outsider@example.com');
    raise exception 'FAIL  signup trigger let a non operator through';
  exception when others then
    if sqlerrm like '%restricted to Noira operators%'
      then raise notice 'PASS  signup is rejected for a non operator email';
      else raise; end if;
  end;
end $$;

grant usage on schema public to authenticated;
grant all on all tables in schema public to authenticated;
grant all on all sequences in schema public to authenticated;
revoke insert, update, delete, truncate on public.audit_log from authenticated;
revoke update, delete on public.reports from authenticated;

\echo ''
\echo '── 1. operator identity ──'
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","email":"t6ckmedia@gmail.com"}';
set role authenticated;
select assert(public.is_operator(), 'the owner gmail is an operator');
reset role;
set request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","email":"tech@noira.us"}';
set role authenticated;
select assert(public.is_operator(), 'a noira.us address is an operator');
reset role;
set request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333","email":"randomer@gmail.com"}';
set role authenticated;
select assert(not public.is_operator(), 'any other address is NOT an operator');
reset role;
-- near misses that must not pass
set request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333","email":"evil@noira.us.attacker.com"}';
set role authenticated;
select assert(not public.is_operator(), 'a lookalike domain does not pass');
reset role;
set request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333","email":"t6ckmedia@gmail.com.evil.com"}';
set role authenticated;
select assert(not public.is_operator(), 'a lookalike owner address does not pass');
reset role;

\echo ''
\echo '── 2. one form client creation scaffolds a working space ──'
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","email":"t6ckmedia@gmail.com"}';
set role authenticated;
select public.create_client('The Wilbers Law Firm','ops@wilberslaw.example','Standard') as c1 \gset
select public.create_client('Ridgeline Dental','ops@ridgeline.example','Priority') as c2 \gset
select assert((select count(*) from public.sites where client_id=:'c1')=1,'new client comes with a site');
select assert((select count(*) from public.changes where client_id=:'c1')=1,'creation written to the change log');
select assert((select status from public.clients where id=:'c1')='onboarding','new client starts as onboarding');
select assert((select slug from public.clients where id=:'c1')='the-wilbers-law-firm','slug generated from the name');

\echo ''
\echo '── 3. client separation ──'
insert into public.assets(client_id,name,ident,ip,status,eos_date) values
 (:'c1','Edge firewall','FW-HQ-01','10.7.20.1','up','2029-06-30'),
 (:'c1','Core switch','SW-HQ-CORE','10.7.20.10','up','2027-03-31'),
 (:'c2','Reception PC','WS-01','10.9.1.20','up','2028-01-31');
insert into public.findings(client_id,title,severity,status) values
 (:'c1','ARP binding changed for 10.7.20.1','High','Open'),
 (:'c2','Backup not verified','Medium','Open');

select assert((select count(*) from public.assets where client_id=:'c1')=2,'client 1 has its own assets');
select assert((select count(*) from public.assets)=3,'an operator sees every client');
select assert((select count(*) from public.assets a join public.clients c on c.id=a.client_id
               where c.slug='ridgeline-dental')=1,'rows stay attached to the right client');

\echo ''
\echo '── 4. a non operator sees nothing at all ──'
reset role;
set request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333","email":"randomer@gmail.com"}';
set role authenticated;
select assert((select count(*) from public.clients)=0,'non operator sees zero clients');
select assert((select count(*) from public.assets)=0,'non operator sees zero assets');
select assert((select count(*) from public.findings)=0,'non operator sees zero findings');
select assert((select count(*) from public.reports)=0,'non operator sees zero reports');
do $$ begin
  begin
    insert into public.clients(name,slug) values ('Smuggled','smuggled');
    raise exception 'FAIL  a non operator created a client';
  exception when insufficient_privilege then
    raise notice 'PASS  a non operator cannot create a client';
  end;
end $$;

\echo ''
\echo '── 5. per operator client restriction is opt in ──'
reset role;
set request.jwt.claims = '{"sub":"44444444-4444-4444-4444-444444444444","email":"scoped@noira.us"}';
set role authenticated;
select assert((select count(*) from public.clients)=2,'with no scope rows, an operator sees all clients');
reset role;
insert into public.operator_scope(user_id,client_id)
values ('44444444-4444-4444-4444-444444444444',:'c2');
set request.jwt.claims = '{"sub":"44444444-4444-4444-4444-444444444444","email":"scoped@noira.us"}';
set role authenticated;
select assert((select count(*) from public.clients)=1,'once scoped, the operator sees only their client');
select assert((select count(*) from public.assets)=1,'and only that client''s assets');
select assert((select name from public.clients)='Ridgeline Dental','and it is the right one');

\echo ''
\echo '── 6. archive freezes writes, never deletes ──'
reset role;
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","email":"t6ckmedia@gmail.com"}';
set role authenticated;
select public.archive_client(:'c2', 7);
select assert((select status from public.clients where id=:'c2')='archived','client archived');
select assert((select retention_until from public.clients where id=:'c2') is not null,'retention stamped');
select assert((select count(*) from public.assets where client_id=:'c2')=1,'archived data still readable');
do $$
declare aid uuid;
begin
  select id into aid from public.clients where status='archived' limit 1;
  begin
    insert into public.assets(client_id,name) values (aid,'Post archive');
    raise exception 'FAIL  an archived client accepted a write';
  exception when insufficient_privilege then
    raise notice 'PASS  an archived client rejects new writes';
  end;
end $$;

\echo ''
\echo '── 7. reports are evidence ──'
insert into public.reports(client_id,title,period,devices,alerts)
values (:'c1','Monthly report','Last 30 days',2,1);
select assert((select count(*) from public.reports where client_id=:'c1')=1,'report filed');
do $$ begin
  begin
    update public.reports set devices=999;
    raise exception 'FAIL  a report was editable after issue';
  exception when insufficient_privilege then
    raise notice 'PASS  an issued report cannot be edited';
  end;
end $$;
do $$ begin
  begin
    delete from public.reports;
    raise exception 'FAIL  a report was deletable';
  exception when insufficient_privilege then
    raise notice 'PASS  an issued report cannot be deleted';
  end;
end $$;

\echo ''
\echo '── 8. audit trail is append only ──'
select assert((select count(*) from public.audit_log)>0,'writes produced audit rows');
select assert((select count(*) from public.audit_log where actor_email='t6ckmedia@gmail.com')>0,
  'the audit row names who did it');
do $$ begin
  begin
    update public.audit_log set action='tampered';
    raise exception 'FAIL  audit log was rewritable';
  exception when insufficient_privilege then
    raise notice 'PASS  audit log cannot be rewritten';
  end;
end $$;

\echo ''
\echo '── 9. rollup view ──'
select assert((select assets from public.client_summary where id=:'c1')=2,'summary counts assets');
select assert((select urgent_findings from public.client_summary where id=:'c1')=1,'summary counts urgent findings');
select assert((select eos_soon from public.client_summary where id=:'c1')=1,'summary counts end of support inside 12 months');

reset role;
\echo ''
\echo 'ALL ASSERTIONS PASSED'
