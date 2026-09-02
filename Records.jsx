'use client';
import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/lib/supabase';
import { useApp } from '@/lib/store';
import { Chip, Panel, Empty, Head, Btn } from './ui';

/* One editor drives every section. Adding a column is a schema change
   plus one line in COLS, not a new screen. Every field below maps to a
   real column; that is verified by the audit script rather than assumed. */

const sev = v => (v==='Critical'||v==='High') ? 'critical' : v==='Medium' ? 'attention' : '';
const up  = v => (v==='up'||v==='Online') ? 'healthy' : (v==='down'||v==='Offline') ? 'critical' : 'attention';

export const COLS = {
  sites: [
    { k:'name', label:'Site', ph:'Head office' }, { k:'address', label:'Address' },
    { k:'contact', label:'Contact' }, { k:'hours', label:'Hours' },
    { k:'state', label:'State', opts:['Online','Degraded','Offline','Unknown'], def:'Online', chip:up },
    { k:'notes', label:'Notes', long:true },
  ],
  assets: [
    { k:'name', label:'Asset', ph:'Edge firewall' }, { k:'ident', label:'Identifier', ph:'FW-HQ-01' },
    { k:'kind', label:'Type', opts:['Firewall','Switch','Access point','Router','Server','Workstation','Printer','Camera','UPS','Other'] },
    { k:'vendor', label:'Vendor' }, { k:'model', label:'Model' }, { k:'serial', label:'Serial' },
    { k:'firmware', label:'Firmware' }, { k:'ip', label:'IP address', ph:'10.7.20.1' },
    { k:'mac', label:'MAC', ph:'00:1b:44:11:3a:b7' },
    { k:'status', label:'Status', opts:['up','degraded','down','unknown'], def:'up', chip:up },
    { k:'location', label:'Location' },
    { k:'purchase_date', label:'Purchased', type:'date' },
    { k:'warranty_end', label:'Warranty ends', type:'date' },
    { k:'eos_date', label:'End of support', type:'date' },
    { k:'vault_ref', label:'Vault reference', hint:'A label pointing at your password manager. Never a credential.' },
  ],
  subnets: [
    { k:'cidr', label:'Network', ph:'10.7.20.0/24' }, { k:'purpose', label:'Purpose' },
    { k:'vlan_id', label:'VLAN', num:true }, { k:'gateway', label:'Gateway' },
    { k:'dhcp_start', label:'DHCP from' }, { k:'dhcp_end', label:'DHCP to' },
  ],
  circuits: [
    { k:'carrier', label:'Carrier' }, { k:'service_id', label:'Service ID' },
    { k:'bandwidth', label:'Bandwidth' }, { k:'contract_end', label:'Contract ends', type:'date' },
    { k:'support_phone', label:'Support number' },
  ],
  findings: [
    { k:'title', label:'Finding' },
    { k:'severity', label:'Severity', opts:['Critical','High','Medium','Low','Info'], def:'Low', chip:sev },
    { k:'domain', label:'Domain', opts:['Network','Identity','Endpoint','Infrastructure','Data','Process'] },
    { k:'status', label:'Status', opts:['Open','In progress','Accepted','Resolved'], def:'Open' },
    { k:'owner', label:'Owner' }, { k:'opened', label:'Opened', type:'date' }, { k:'due', label:'Due', type:'date' },
    { k:'detail', label:'Observation', long:true },
    { k:'evidence', label:'Evidence', long:true },
    { k:'remediation', label:'Recommendation', long:true },
  ],
  incidents: [
    { k:'title', label:'Incident' },
    { k:'severity', label:'Severity', opts:['Critical','High','Medium','Low'], def:'Medium', chip:sev },
    { k:'summary', label:'Summary', long:true },
    { k:'root_cause', label:'Root cause', long:true },
    { k:'lessons', label:'Lessons', long:true },
  ],
  monitors: [
    { k:'name', label:'Monitor' }, { k:'location', label:'Location' },
    { k:'kind', label:'Kind', opts:['Agent','Worker'], def:'Agent' },
    { k:'target', label:'Target' },
    { k:'interval_secs', label:'Interval, seconds', num:true, def:300 },
    { k:'checkins', label:'Check-ins', num:true },
  ],
  changes: [
    { k:'what', label:'Change' }, { k:'where_at', label:'Where' },
    { k:'why', label:'Why', long:true }, { k:'performed_by', label:'By' },
  ],
  tickets: [
    { k:'subject', label:'Subject' },
    { k:'priority', label:'Priority', opts:['Urgent','High','Normal','Low'], def:'Normal',
      chip:v => (v==='Urgent'||v==='High') ? 'critical' : '' },
    { k:'status', label:'Status', opts:['Open','Waiting','Resolved','Closed'], def:'Open' },
    { k:'requester', label:'Requester' }, { k:'assignee', label:'Assignee' },
    { k:'minutes', label:'Time, minutes', num:true },
    { k:'billing', label:'Billing', opts:['Contract','Billable','Internal'], def:'Contract' },
    { k:'detail', label:'Detail', long:true },
  ],
};

export default function Records({ table, title, desc, empty, note }) {
  const { envId, env, reload } = useApp();
  const cols = COLS[table] || [];
  const [rows, setRows] = useState(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState({});
  const [err, setErr] = useState(null);
  const PAGE = 50;

  /* Server side. Searching or sorting a partial page would be a lie
     about the data, so both go to the database. */
  const load = async () => {
    if (!envId) { setRows([]); setTotal(0); return; }
    let sel = supabase.from(table).select('*', { count:'exact' })
      .eq('environment_id', envId);
    const term = q.trim();
    if (term) {
      const searchable = cols.filter(c => !c.opts && !c.num && !c.type).slice(0,3).map(c => c.k);
      if (searchable.length)
        sel = sel.or(searchable.map(k => `${k}.ilike.%${term}%`).join(','));
    }
    const { data, error, count } = await sel
      .order('created_at', { ascending:false })
      .range(page * PAGE, page * PAGE + PAGE - 1);
    if (error) { setErr(error.message); setRows([]); return; }
    setRows(data || []); setTotal(count ?? 0);
  };
  useEffect(() => { setRows(null); setErr(null); load(); /* eslint-disable-next-line */ }, [table, envId, page, q]);
  useEffect(() => { setPage(0); }, [table, envId, q]);

  const archived = env?.status === 'archived';

  async function save() {
    const clean = {};
    cols.forEach(c => {
      const v = draft[c.k];
      clean[c.k] = (v === '' || v == null) ? null : (c.num ? Number(v) : v);
    });
    const { error } = editing === 'new'
      ? await supabase.from(table).insert({ ...clean, environment_id: envId })
      : await supabase.from(table).update(clean).eq('id', editing);
    if (error) { setErr(error.message); return; }
    setEditing(null); load(); reload();
  }
  async function remove(id) {
    const { error } = await supabase.from(table).delete().eq('id', id);
    if (error) setErr(error.message); else { load(); reload(); }
  }

  if (!envId) return (<><Head title={title} desc={desc} />
    <Panel><Empty t="No environment selected" s="Pick one in the top bar, or create one." /></Panel></>);

  return (
    <>
      <Head title={title} desc={desc} right={
        <div className="flex items-center gap-2">
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search"
            className="h-10 px-3 bg-obsidian border border-line2 rounded-[3px] text-sm
                       outline-none focus:border-secondary w-[180px]" />
          {!archived && <Btn variant="primary" onClick={() => {
            const d = {}; cols.forEach(c => d[c.k] = c.def ?? ''); setDraft(d); setEditing('new');
          }}>Add record</Btn>}
        </div>} />

      {archived && <div className="mb-4 text-sm text-attention">
        This environment is archived. Records are readable but cannot be changed.
      </div>}
      {err && <div className="mb-4 text-sm text-critical">{err}</div>}

      <Panel>
        {rows === null ? <Empty t="Loading" s={'Reading ' + table + '.'} />
        : !rows.length ? <Empty t={empty?.t || 'No records yet'} s={empty?.s || ''} />
        : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse min-w-[760px]">
              <thead><tr>
                {cols.slice(0,6).map(c => (
                  <th key={c.k} className="text-left font-mono text-sm tracking-[.1em] uppercase text-muted
                                           font-medium px-[18px] py-[11px] border-b border-line">{c.label}</th>
                ))}
                <th className="w-[130px] border-b border-line" />
              </tr></thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id} className="hover:bg-soft/[.022] transition-colors">
                    {cols.slice(0,6).map((c,i) => (
                      <td key={c.k} className={`px-[18px] py-3 border-b border-line text-[15px]
                        ${i ? 'font-mono text-sm text-secondary' : ''}`}>
                        {c.chip ? <Chip tone={c.chip(r[c.k])}>{r[c.k] ?? 'not set'}</Chip>
                                : (r[c.k] ?? <span className="text-muted">not set</span>)}
                      </td>
                    ))}
                    <td className="px-[18px] py-3 border-b border-line text-right whitespace-nowrap">
                      <button onClick={() => { setDraft({ ...r }); setEditing(r.id); }}
                        className="text-sm text-secondary hover:text-soft px-2 py-1">
                        {archived ? 'View' : 'Edit'}
                      </button>
                      {!archived && <button onClick={() => remove(r.id)}
                        className="text-sm text-secondary hover:text-critical px-2 py-1">Delete</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {rows && total > 0 && (
          <div className="flex items-center justify-between gap-4 px-[18px] py-3 border-t border-line">
            <span className="font-mono text-sm text-secondary">
              {page*PAGE+1} to {Math.min((page+1)*PAGE, total)} of {total}
            </span>
            <div className="flex gap-2">
              <Btn onClick={() => setPage(p => Math.max(0, p-1))} disabled={page===0}>Previous</Btn>
              <Btn onClick={() => setPage(p => p+1)}
                   disabled={(page+1)*PAGE >= total}>Next</Btn>
            </div>
          </div>
        )}
      </Panel>

      {note && <p className="text-sm text-secondary mt-4 max-w-[64ch] leading-relaxed">{note}</p>}

      <AnimatePresence>
        {editing && <Editor cols={cols} draft={draft} setDraft={setDraft} readOnly={archived}
          title={editing==='new' ? 'New record' : 'Record'}
          onSave={save} onClose={() => setEditing(null)} />}
      </AnimatePresence>
    </>
  );
}

function Editor({ cols, draft, setDraft, onSave, onClose, title, readOnly }) {
  return (
    <>
      <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
        onClick={onClose} className="fixed inset-0 bg-obsidian/70 z-40" />
      <motion.aside role="dialog" aria-modal="true"
        initial={{x:'100%'}} animate={{x:0}} exit={{x:'100%'}}
        transition={{ type:'spring', stiffness:340, damping:36 }}
        className="fixed top-0 right-0 bottom-0 w-[min(480px,100%)] bg-graphite border-l border-line2 z-50 flex flex-col">
        <div className="px-6 py-5 border-b border-line font-serif text-[21px]">{title}</div>
        <div className="flex-1 overflow-y-auto p-6 grid gap-4">
          {cols.map(c => (
            <label key={c.k} className="grid gap-1.5">
              <span className="font-mono text-sm text-secondary tracking-[.08em] uppercase">{c.label}</span>
              {c.opts ? (
                <select disabled={readOnly} value={draft[c.k] ?? ''}
                  onChange={e => setDraft(d => ({ ...d, [c.k]: e.target.value }))}
                  className="h-11 px-3 bg-obsidian border border-line2 rounded-[2px] outline-none focus:border-secondary text-[15px] disabled:opacity-60">
                  <option value="">not set</option>
                  {c.opts.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              ) : c.long ? (
                <textarea rows={3} disabled={readOnly} value={draft[c.k] ?? ''}
                  onChange={e => setDraft(d => ({ ...d, [c.k]: e.target.value }))}
                  className="px-3 py-2.5 bg-obsidian border border-line2 rounded-[2px] outline-none focus:border-secondary text-[15px] leading-relaxed resize-y disabled:opacity-60" />
              ) : (
                <input type={c.type || 'text'} disabled={readOnly} value={draft[c.k] ?? ''}
                  placeholder={c.ph || ''}
                  onChange={e => setDraft(d => ({ ...d, [c.k]: e.target.value }))}
                  className="h-11 px-3 bg-obsidian border border-line2 rounded-[2px] outline-none focus:border-secondary text-[15px] disabled:opacity-60" />
              )}
              {c.hint && <span className="text-sm text-muted">{c.hint}</span>}
            </label>
          ))}
        </div>
        <div className="px-6 py-4 border-t border-line flex justify-end gap-2.5">
          <Btn onClick={onClose}>{readOnly ? 'Close' : 'Cancel'}</Btn>
          {!readOnly && <Btn variant="primary" onClick={onSave}>Save</Btn>}
        </div>
      </motion.aside>
    </>
  );
}
