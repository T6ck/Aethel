'use client';
import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from './supabase';

/* One context for the whole app.
 *
 * The single most important value here is `mode`. An operator org owns
 * many environments and gets a switcher plus a client roster. A tenant
 * org owns exactly one and never sees that machinery at all. Both read
 * the same tables through the same policies; only the chrome differs.
 *
 * Mode is derived from the org record the database created at signup,
 * never from the email address in the browser. A forged claim in the
 * client cannot promote anyone: RLS decides what comes back regardless. */

const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

export const ENV_TABLES = ['sites','assets','subnets','circuits','findings',
  'incidents','monitors','changes','tickets','reports','agents'];

export function AppProvider({ children }) {
  const [session, setSession] = useState(undefined);
  const [orgs, setOrgs]       = useState(undefined);
  const [orgId, setOrgId]     = useState(null);
  const [envs, setEnvs]       = useState([]);
  const [envId, setEnvId]     = useState(null);
  const [summary, setSummary] = useState({});
  const [err, setErr]         = useState(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data:{ session } }) => setSession(session ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s ?? null));
    return () => sub.subscription.unsubscribe();
  }, []);

  /* Load every org this user belongs to. RLS already limits the result
     to their memberships. Picking one arbitrarily meant `mode` could
     flip between loads for anyone in two orgs, which the schema
     permits, so the choice is explicit and persisted instead. */
  useEffect(() => {
    if (session === undefined) return;
    if (!session) { setOrgs(null); return; }
    supabase.from('orgs').select('*').order('kind').order('name')
      .then(({ data, error }) => {
        if (error) setErr(error.message);
        const list = data || [];
        setOrgs(list);
        setOrgId(prev => {
          const stored = typeof window !== 'undefined' ? localStorage.getItem('gp.org') : null;
          return list.find(o => o.id === (prev || stored))?.id || list[0]?.id || null;
        });
      });
  }, [session]);

  useEffect(() => {
    if (orgId && typeof window !== 'undefined') localStorage.setItem('gp.org', orgId);
  }, [orgId]);

  const loadEnvs = useCallback(async () => {
    const { data, error } = await supabase.from('environments')
      .select('*').eq('org_id', orgId).order('status').order('name');
    if (error) { setErr(error.message); return; }
    const list = data || [];
    setEnvs(list);
    setEnvId(prev => {
      const stored = typeof window !== 'undefined' ? localStorage.getItem('gp.env') : null;
      return list.find(e => e.id === (prev || stored))?.id
          || list.find(e => e.status !== 'archived')?.id
          || list[0]?.id || null;
    });
    const { data: s } = await supabase.from('env_summary').select('*');
    setSummary(Object.fromEntries((s || []).map(r => [r.id, r])));
  }, [orgId]);

  useEffect(() => { if (orgId) loadEnvs(); }, [orgId, loadEnvs]);
  useEffect(() => {
    if (envId && typeof window !== 'undefined') localStorage.setItem('gp.env', envId);
  }, [envId]);

  const org  = (orgs || []).find(o => o.id === orgId) || null;
  const mode = org?.kind === 'operator' ? 'operator' : 'tenant';
  const env  = envs.find(e => e.id === envId) || null;
  const sum  = envId ? summary[envId] : null;

  async function addEnvironment(name, email, tier) {
    const { data, error } = await supabase.rpc('create_environment', {
      p_org: org.id, p_name: name, p_email: email || null, p_tier: tier || 'Standard',
    });
    if (error) return { error: error.message };
    await loadEnvs();
    setEnvId(data);
    return { id: data };
  }
  async function archiveEnvironment(id) {
    const { error } = await supabase.rpc('archive_environment', { p_env: id });
    if (!error) await loadEnvs();
    return { error: error?.message };
  }

  /* S8: realtime on the two tables that actually change under you.
     Scoped to the selected environment and torn down on switch, because
     subscribing to everything is its own scaling problem. */
  useEffect(() => {
    if (!envId) return;
    const ch = supabase.channel('env:' + envId)
      .on('postgres_changes',
        { event:'*', schema:'public', table:'findings', filter:'environment_id=eq.'+envId },
        () => loadEnvs())
      .on('postgres_changes',
        { event:'*', schema:'public', table:'agent_reports', filter:'environment_id=eq.'+envId },
        () => loadEnvs())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [envId, loadEnvs]);

  return (
    <Ctx.Provider value={{
      session, orgs, org, orgId, setOrgId, mode, envs, env, envId, setEnvId, summary, sum,
      reload: loadEnvs, addEnvironment, archiveEnvironment,
      err, setErr, signOut: () => supabase.auth.signOut(),
    }}>{children}</Ctx.Provider>
  );
}
