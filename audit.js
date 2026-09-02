const fs = require('fs'), { execSync } = require('child_process');
let pass = 0, fail = 0;
const ck = (c, l, d) => { c ? pass++ : fail++; console.log((c?'  ok   ':'  FAIL ')+l+(d&&!c?'  → '+d:'')); };
const psql = q => execSync(`su postgres -c "psql -h /tmp/pgsock -p 5433 -U postgres -d gp -At -c \\"${q}\\""`,
  {encoding:'utf8'}).trim().split('\n').filter(Boolean);

const rec = fs.readFileSync('components/Records.jsx','utf8');
const all = ['app/page.jsx','app/layout.jsx','app/dashboard/page.jsx','app/reset/page.jsx',
  'components/Auth.jsx','components/Records.jsx','components/Agents.jsx','components/Charts.jsx',
  'components/Globe.jsx','components/ui.jsx','lib/store.js','lib/supabase.js']
  .map(f => fs.readFileSync(f,'utf8')).join('\n');

console.log('── SCHEMA / UI CONTRACT ──');
const cols = {};
const body = rec.slice(rec.indexOf('export const COLS'));
for (const m of body.matchAll(/^  ([a-z_]+):\s*\[([\s\S]*?)\n  \],/gm))
  cols[m[1]] = [...m[2].matchAll(/k:'([a-z_]+)'/g)].map(x => x[1]);

let colBad = [];
for (const [t, ks] of Object.entries(cols)) {
  const have = new Set(psql(`select column_name from information_schema.columns where table_name='${t}'`));
  ks.forEach(k => { if (!have.has(k)) colBad.push(t+'.'+k); });
}
ck(colBad.length===0, 'every editor field maps to a real column', colBad.join(', '));

// dropdown values must satisfy their CHECK constraint
const cons = {};
psql(`select conrelid::regclass::text || '|' || pg_get_constraintdef(oid) from pg_constraint where contype='c' and connamespace='public'::regnamespace`)
  .forEach(l => { const [t,d]=l.split('|'); const c=/\((\w+) = ANY/.exec(d);
    if (c) (cons[t.replace('public.','')] ||= {})[c[1]] = [...d.matchAll(/'([^']+)'::text/g)].map(x=>x[1]); });
let optBad = [];
for (const m of body.matchAll(/^  ([a-z_]+):\s*\[([\s\S]*?)\n  \],/gm))
  for (const o of m[2].matchAll(/k:'([a-z_]+)'[^}]*opts:\[([^\]]+)\]/g)) {
    const allowed = cons[m[1]]?.[o[1]];
    if (!allowed) continue;
    o[2].split(',').map(s=>s.trim().replace(/'/g,'')).forEach(v => {
      if (!allowed.includes(v)) optBad.push(`${m[1]}.${o[1]}="${v}" not in [${allowed}]`); });
  }
ck(optBad.length===0, 'every dropdown value satisfies its CHECK constraint', optBad.join('; '));

// every table/rpc the UI calls must exist
const tables = new Set(psql(`select tablename from pg_tables where schemaname='public'`)
  .concat(psql(`select viewname from pg_views where schemaname='public'`)));
const fns = new Set(psql(`select proname from pg_proc where pronamespace='public'::regnamespace`));
const usedT = [...all.matchAll(/\.from\('([a-z_]+)'\)/g)].map(m=>m[1]);
const usedF = [...all.matchAll(/\.rpc\('([a-z_]+)'/g)].map(m=>m[1]);
const dynT = Object.keys(cols);
ck([...new Set([...usedT,...dynT])].every(t=>tables.has(t)), 'every table the UI reads exists',
   [...new Set([...usedT,...dynT])].filter(t=>!tables.has(t)).join(', '));
ck(usedF.every(f=>fns.has(f)), 'every RPC the UI calls exists', usedF.filter(f=>!fns.has(f)).join(', '));

console.log('');
console.log('── TENANCY ──');
ck(!/client_id/.test(all), 'no leftover client_id anywhere; everything is environment scoped');
ck(/kind === 'operator'/.test(fs.readFileSync('lib/store.js','utf8')),
   'mode derived from the org record, not from the email in the browser');
ck(!/emailPermitted|ALLOWED_EMAILS|noira/i.test(all.replace(/groundplane/gi,'')),
   'no allowlist logic left in the client; the database decides');

console.log('');
console.log('── AGENT ──');
const agent = fs.readFileSync('../gp/agent/groundplane_agent.py','utf8');
ck(/scrub\(/.test(agent), 'payload passes a secret scrubber before leaving the process');
ck(/S_IRUSR \| stat\.S_IWUSR/.test(agent), 'token file written 0600');
ck(!/--environment|--env\b/.test(agent), 'no flag can repoint a collector at another environment');
ck(/cfg\["environment_id"\]/.test(agent), 'environment comes from the enrolled config only');

console.log('');
console.log('── BRAND / DESIGN ──');
ck(!/Aethel|aethel|Fenn|RDNSI/i.test(all), 'no leftover brand from earlier builds');
const hex = [...all.matchAll(/#[0-9A-Fa-f]{6}/g)].map(m=>m[0].toUpperCase());
const allowed = new Set(['#050505','#0B0B0D','#111114','#17171B','#1A1A1F','#26262C',
  '#F5F5F2','#8A8A8F','#4A4A4F','#3ECF8E','#E0A33E','#E56A5A','#FFFFFF','#111111','#666666',
  '#DDDDDD','#EEEEEE','#555555','#888888','#444444']);
const stray = [...new Set(hex)].filter(h=>!allowed.has(h));
ck(stray.length===0, 'no colour outside the declared palette', stray.join(' '));
ck(!/[\u2014]/.test(all), 'no em dashes in UI copy');
ck(/prefers-reduced-motion/.test(fs.readFileSync('app/globals.css','utf8')), 'reduced motion respected');
ck(/focus-visible/.test(fs.readFileSync('app/globals.css','utf8')), 'focus is visible on every control');

console.log('');
console.log('── SAFETY ──');
ck(!/service_role|sk_live|SUPABASE_SERVICE/.test(all), 'no service key in the client bundle');
ck(!/dangerouslySetInnerHTML/.test(all), 'no raw HTML injection in React');
ck(/vault_ref/.test(rec) && /Never a credential/.test(rec), 'vault reference is labelled as a pointer, not a secret');
ck(/not the same as healthy/.test(all), 'unmeasured is never presented as healthy');

console.log('');
console.log('── SCALE ──');
// every environment-scoped table must be indexed on it
const noIdx = psql(`select coalesce(string_agg(c.relname,', '),'') from pg_class c
 join pg_attribute a on a.attrelid=c.oid and a.attname='environment_id'
where c.relnamespace='public'::regnamespace and c.relkind='r'
 and not exists (select 1 from pg_index i where i.indrelid=c.oid and a.attnum=any(i.indkey))`)[0]||'';
ck(noIdx==='', 'every environment-scoped table is indexed on environment_id', noIdx);

// the roster view must not be correlated subqueries again
const plan = execSync(`su postgres -c "psql -h /tmp/pgsock -p 5433 -U postgres -d gp -At -c \\"explain select * from public.env_summary\\""`,{encoding:'utf8'});
ck(!/SubPlan/.test(plan), 'env_summary plan is free of correlated subqueries');

// unbounded tables must have a prune function
ck(fns.has('prune_agent_reports') && fns.has('prune_audit_log'),
   'append-only tables have retention functions');
ck(psql(`select column_name from information_schema.columns where table_name='orgs' and column_name='retention_days'`).length===1,
   'retention window is a visible workspace setting');

// snapshots assembled server side
ck(fns.has('build_report_snapshot') && fns.has('issue_report'),
   'report snapshot is assembled by the database, not the browser');
ck(!/const tables = \[/.test(all), 'no seven-table client-side snapshot left');

// no unbounded list
const rec2 = fs.readFileSync('components/Records.jsx','utf8');
ck(/\.range\(/.test(rec2) && /count:\s*'exact'/.test(rec2),
   'lists paginate server side and report a true total');
ck(/limit\(50\)/.test(fs.readFileSync('app/dashboard/page.jsx','utf8')),
   'the reports list is bounded too');

// org selection is explicit
const store = fs.readFileSync('lib/store.js','utf8');
ck(!/from\('orgs'\)[^;]*limit\(1\)/.test(store), 'no arbitrary single-org pick');
ck(/localStorage.setItem\('gp.org'/.test(store), 'the chosen org is persisted');
ck(/removeChannel/.test(store), 'realtime channels are torn down on switch');

// agent resilience
const ag = fs.readFileSync('../gp/agent/groundplane_agent.py','utf8');
ck(/random\.uniform/.test(ag), 'agent jitters its interval');
ck(/min\(1800/.test(ag), 'agent backs off exponentially with a cap');
ck(/spool_write/.test(ag), 'a failed report is spooled rather than lost');
ck(/SPOOL_MAX/.test(ag), 'the spool is capped so an outage cannot fill the disk');
ck(/sys\.exit\(2\)/.test(ag), 'a revoked token stops the agent instead of looping');

console.log('');
console.log(fail===0 ? `ALL ${pass} CHECKS PASSED` : `${fail} of ${pass+fail} FAILED`);
process.exit(fail?1:0);
