'use client';
import { useEffect, useState } from 'react';
import { supabase, SUPABASE_URL, SUPABASE_KEY } from '@/lib/supabase';
import { useApp } from '@/lib/store';
import { Panel, Empty, Head, Btn, Chip } from './ui';

/* Collectors.
 *
 * The enrollment code is shown once, here, and expires in 24 hours. It
 * is deliberately short enough to read off a screen and type into a
 * terminal on a client site. It is exchanged once for a long token that
 * the operator never sees and never has to handle. */
export default function Agents() {
  const { envId, env } = useApp();
  const [rows, setRows] = useState(null);
  const [name, setName] = useState('');
  const [issued, setIssued] = useState(null);
  const [err, setErr] = useState(null);

  const load = async () => {
    if (!envId) { setRows([]); return; }
    const { data, error } = await supabase.from('agents')
      .select('id,name,hostname,platform,version,enroll_code,enroll_expires,enrolled_at,last_seen,revoked_at')
      .eq('environment_id', envId).order('created_at', { ascending:false });
    if (error) { setErr(error.message); setRows([]); return; }
    setRows(data || []);
  };
  useEffect(() => { setRows(null); load(); /* eslint-disable-next-line */ }, [envId]);

  async function issue() {
    setErr(null);
    const n = name.trim() || ('collector-' + Math.random().toString(36).slice(2,6));
    const { data, error } = await supabase.rpc('create_agent', { p_env: envId, p_name: n });
    if (error) return setErr(error.message);
    const row = Array.isArray(data) ? data[0] : data;
    setIssued({ name:n, code: row.code });
    setName(''); load();
  }
  async function revoke(id) {
    const { error } = await supabase.rpc('revoke_agent', { p_agent: id });
    if (error) setErr(error.message); else load();
  }

  if (!envId) return (<><Head title="Collectors" />
    <Panel><Empty t="No environment selected" s="Pick one in the top bar." /></Panel></>);

  const state = a => a.revoked_at ? ['critical','Revoked']
    : a.enrolled_at ? ['healthy','Reporting']
    : ['attention','Awaiting enrollment'];

  return (
    <>
      <Head title="Collectors"
        desc="A collector runs on one server inside a network and reports what it can see. Each one belongs to a single environment and cannot report to any other." />

      {err && <div className="mb-4 text-sm text-critical">{err}</div>}

      <div className="grid lg:grid-cols-[1fr_1.15fr] gap-3.5 mb-3.5">
        <Panel title="Add a collector">
          <div className="p-[18px] grid gap-3">
            <label className="grid gap-1.5">
              <span className="font-mono text-sm text-secondary tracking-[.08em] uppercase">Name</span>
              <input value={name} onChange={e => setName(e.target.value)}
                placeholder="hq-desk"
                className="h-11 px-3 bg-obsidian border border-line2 rounded-[2px] outline-none focus:border-secondary text-[15px]" />
            </label>
            <Btn variant="primary" onClick={issue} className="justify-self-start">Issue enrollment code</Btn>
            <p className="text-sm text-secondary leading-relaxed">
              The code is valid for 24 hours and can be used once. The collector
              exchanges it for a token you never have to handle.
            </p>
          </div>
        </Panel>

        <Panel title="Install">
          <div className="p-[18px]">
            {!issued ? (
              <Empty t="No code issued yet"
                s="Issue a code and the install commands appear here with it filled in." />
            ) : (
              <div className="grid gap-3">
                <div>
                  <div className="font-mono text-sm text-secondary tracking-[.08em] uppercase mb-1.5">
                    Enrollment code for {issued.name}
                  </div>
                  <div className="font-mono text-[22px] tracking-[.18em] text-healthy
                                  bg-obsidian border border-line2 rounded-[2px] px-4 py-3">
                    {issued.code}
                  </div>
                  <p className="text-sm text-attention mt-2">
                    Shown once. It expires in 24 hours.
                  </p>
                </div>
                <pre className="bg-obsidian border border-line2 rounded-[2px] p-3 text-sm
                                font-mono text-secondary overflow-x-auto leading-relaxed">
{`# on the client's server
python3 groundplane_agent.py enroll --code ${issued.code}
python3 groundplane_agent.py run --daemon --interval 3600`}
                </pre>
                <Btn onClick={() => navigator.clipboard?.writeText(issued.code)}>Copy code</Btn>
              </div>
            )}
          </div>
        </Panel>
      </div>

      <Panel title="Deployed" count={rows?.length ?? ''}>
        {rows === null ? <Empty t="Loading" s="Reading collectors." />
        : !rows.length ? <Empty t="No collectors yet"
            s="Nothing is reporting from inside this network. Until one is deployed, only what is reachable from the public internet can be measured." />
        : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse min-w-[680px]">
              <thead><tr>
                {['Collector','Host','Platform','State','Last seen',''].map(h => (
                  <th key={h} className="text-left font-mono text-sm tracking-[.1em] uppercase text-muted
                                         font-medium px-[18px] py-[11px] border-b border-line">{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {rows.map(a => {
                  const [tone, label] = state(a);
                  return (
                    <tr key={a.id} className="hover:bg-soft/[.022] transition-colors">
                      <td className="px-[18px] py-3 border-b border-line text-[15px]">{a.name}</td>
                      <td className="px-[18px] py-3 border-b border-line font-mono text-sm text-secondary">{a.hostname ?? 'not yet'}</td>
                      <td className="px-[18px] py-3 border-b border-line font-mono text-sm text-secondary">{a.platform ?? 'not yet'}</td>
                      <td className="px-[18px] py-3 border-b border-line"><Chip tone={tone}>{label}</Chip></td>
                      <td className="px-[18px] py-3 border-b border-line font-mono text-sm text-secondary">
                        {a.last_seen ? new Date(a.last_seen).toLocaleString() : 'never'}
                      </td>
                      <td className="px-[18px] py-3 border-b border-line text-right">
                        {!a.revoked_at && (
                          <button onClick={() => revoke(a.id)}
                            className="text-sm text-secondary hover:text-critical px-2 py-1">Revoke</button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <p className="text-sm text-secondary mt-4 max-w-[68ch] leading-relaxed">
        Revoking a collector clears its token immediately. It will be refused on
        its next report without needing to be uninstalled from the host.
      </p>
    </>
  );
}
