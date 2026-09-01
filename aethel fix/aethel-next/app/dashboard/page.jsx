'use client';
import { useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { Reveal, Count, Chip, Panel } from '@/components/ui';
import { TrafficChart, SeverityDonut } from '@/components/Charts';
import { STATES, METRICS, ASSETS, FINDINGS, CHANGES, MONITORS, SITES, CLIENT } from '@/lib/data';

const NAV = [
  ['Overview',   ['Overview']],
  ['Environment',['Assets','Network','Sites']],
  ['Security',   ['Posture','Findings','Incidents']],
  ['Operations', ['Monitoring','Changes']],
  ['Planning',   ['Lifecycle']],
  ['Documents',  ['Reports']],
];

const TONE = { healthy:'bg-healthy', attention:'bg-attention', critical:'bg-critical' };

export default function Dashboard() {
  const [view, setView] = useState('Overview');
  const [explain, setExplain] = useState(null);

  return (
    <div className="flex h-screen overflow-hidden bg-obsidian">
      {/* rail */}
      <aside className="w-[248px] shrink-0 bg-graphite border-r border-line flex flex-col">
        <Link href="/" className="flex items-center gap-3 px-5 h-[68px] border-b border-line">
          <span className="font-serif text-[21px] leading-none">A</span>
          <span className="font-serif text-[15px] tracking-[.3em]">AETHEL</span>
        </Link>
        <nav className="flex-1 overflow-y-auto py-3">
          {NAV.map(([group, items]) => (
            <div key={group}>
              <div className="px-5 pt-4 pb-1.5 font-mono text-sm tracking-[.16em] uppercase text-muted">{group}</div>
              {items.map((it) => (
                <button key={it} onClick={() => setView(it)}
                  className={`relative w-full flex items-center gap-3 px-5 min-h-[44px] text-[15px] text-left
                    transition-colors ${view === it
                      ? 'text-soft bg-soft/[.055]' : 'text-secondary hover:text-soft hover:bg-soft/[.028]'}`}>
                  {view === it && <motion.span layoutId="rail"
                    className="absolute left-0 top-2 bottom-2 w-[2px] bg-soft" />}
                  <span className="flex-1">{it}</span>
                  <span className={`w-[5px] h-[5px] rounded-full ${
                    it === 'Posture' ? 'bg-healthy' : it === 'Findings' ? 'bg-attention' : 'bg-muted'}`} />
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className="px-5 py-4 border-t border-line">
          <div className="font-mono text-sm tracking-[.16em] uppercase text-secondary">Managed by</div>
          <div className="text-sm text-secondary mt-1">Noira, Technology and Cybersecurity</div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-[60px] shrink-0 border-b border-line bg-graphite flex items-center gap-4 px-6">
          <input placeholder="Search your environment"
            className="w-full max-w-[420px] h-9 px-3 bg-obsidian border border-line rounded-[3px]
                       text-sm placeholder:text-muted outline-none focus:border-line2" />
          <div className="ml-auto flex items-center gap-2.5 px-2.5 py-1.5 border border-line rounded-[3px]">
            <span className="w-6 h-6 rounded-full bg-raised border border-line2 grid place-items-center font-serif text-sm">A</span>
            <div className="hidden sm:block leading-tight">
              <div className="text-sm">{CLIENT.name}</div>
              <div className="font-mono text-sm text-muted">{CLIENT.contact}</div>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto">
          <AnimatePresence mode="wait">
            <motion.div key={view}
              initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:-6 }}
              transition={{ duration:.24, ease:[0.22,0.61,0.36,1] }}
              className="p-7 max-w-[1320px]">
              <View name={view} onExplain={setExplain} />
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      <AnimatePresence>
        {explain && <Drawer item={explain} onClose={() => setExplain(null)} />}
      </AnimatePresence>
    </div>
  );
}

function Head({ title, desc }) {
  return (
    <div className="mb-6">
      <h1 className="font-serif text-[28px] leading-tight">{title}</h1>
      {desc && <p className="text-[15px] text-secondary mt-1.5">{desc}</p>}
    </div>
  );
}

function View({ name, onExplain }) {
  if (name === 'Overview') return <Overview onExplain={onExplain} />;

  if (name === 'Assets') return (<>
    <Head title="Assets" desc="Every device Aethel holds a record for, and how long it stays supported." />
    <Table cols={['Asset','Identifier','Address','Site','Status','End of support']}
      rows={ASSETS.map(a => [a.name, a.ident, a.ip, a.site,
        <Chip key="s" tone="healthy">{a.status}</Chip>, a.eos])} />
  </>);

  if (name === 'Findings') return (<>
    <Head title="Findings" desc="Open items, with the evidence each one rests on." />
    <Table cols={['Finding','Severity','Domain','Asset','Opened','Status']}
      rows={FINDINGS.map(f => [f.title,
        <Chip key="s" tone={f.severity === 'High' ? 'critical' : f.severity === 'Medium' ? 'attention' : ''}>{f.severity}</Chip>,
        f.domain, f.asset, f.opened, f.status])} />
  </>);

  if (name === 'Sites') return (<>
    <Head title="Sites" desc="Physical locations and what runs at each one." />
    <Table cols={['Site','State','Assets']}
      rows={SITES.map(s => [s.label, <Chip key="c" tone="healthy">{s.state}</Chip>,
        ASSETS.filter(a => a.site === s.label).length])} />
  </>);

  if (name === 'Monitoring') return (<>
    <Head title="Monitoring" desc="What is being watched, and from where." />
    <Table cols={['Monitor','Location','Kind','Check-ins','Last reported']}
      rows={MONITORS.map(m => [m.name, m.location, m.kind, m.checkins, m.last])} />
  </>);

  if (name === 'Changes') return (<>
    <Head title="Changes" desc="The record of work performed on this environment." />
    <Table cols={['Change','Where','When']} rows={CHANGES.map(c => [c.what, c.where, c.when])} />
  </>);

  if (name === 'Lifecycle') return (<>
    <Head title="Lifecycle" desc="When equipment stops being supported, and what that costs." />
    <Table cols={['Asset','Identifier','Site','End of support']}
      rows={[...ASSETS].sort((a,b) => a.eos.localeCompare(b.eos))
        .map(a => [a.name, a.ident, a.site,
          <Chip key="e" tone={a.eos < '2028' ? 'attention' : ''}>{a.eos}</Chip>])} />
  </>);

  if (name === 'Network') return (<>
    <Head title="Network" desc="Addressing, segments and the relationships between them." />
    <Table cols={['Address','Asset','Site']} rows={ASSETS.map(a => [a.ip, a.name, a.site])} />
  </>);

  if (name === 'Posture') return (<>
    <Head title="Posture" desc="Based on CIS Controls and NIST CSF." />
    <div className="grid md:grid-cols-2 gap-3.5">
      {STATES.filter(s => s.key === 'security' || s.key === 'attention')
        .map((s,i) => <StateCard key={s.key} s={s} i={i} onExplain={onExplain} />)}
    </div>
    <p className="text-sm text-secondary mt-5 max-w-[62ch] leading-relaxed">
      A score is only defensible if the method is visible. Controls that could not be
      measured are excluded from the denominator and reported as coverage, so a high
      score on thin coverage is never presented as a strong posture.
    </p>
  </>);

  if (name === 'Incidents') return (<>
    <Head title="Incidents" desc="Events, their timeline, and what was learned." />
    <Table cols={['Incident','Severity','Opened','Closed','Root cause']}
      rows={[['Brief internet outage at Branch',
        <Chip key="s" tone="attention">Medium</Chip>,
        '2026-08-12','2026-08-12','Carrier maintenance, unannounced']]} />
  </>);

  if (name === 'Reports') return (<>
    <Head title="Reports" desc="Noira-branded records, generated from a point-in-time snapshot." />
    <Table cols={['Report','Period','Devices','Generated','Status']}
      rows={[[CLIENT.name, CLIENT.period, METRICS.devices, '2026-08-25',
        <Chip key="s" tone="healthy">Issued</Chip>]]} />
  </>);

  return null;
}

function Overview({ onExplain }) {
  return (<>
    <div className="flex items-start justify-between gap-6 mb-6">
      <div>
        <h1 className="font-serif text-[28px] leading-tight">Environment overview</h1>
        <p className="text-[15px] text-secondary mt-1.5">A current view of the technology that runs your business.</p>
      </div>
      <div className="text-right shrink-0">
        <div className="font-mono text-sm text-muted tracking-[.1em] uppercase">Last updated</div>
        <div className="font-mono text-sm text-secondary mt-1">Today, 2:41 PM</div>
        <div className="flex items-center justify-end gap-2 mt-2 text-sm">
          <span className="w-[6px] h-[6px] rounded-full bg-healthy" />Operational
        </div>
      </div>
    </div>

    <div className="grid grid-cols-2 xl:grid-cols-4 gap-3.5 mb-3.5">
      {STATES.map((s, i) => <StateCard key={s.key} s={s} i={i} onExplain={onExplain} />)}
    </div>

    <div className="grid lg:grid-cols-[1.4fr_1fr] gap-3.5 mb-3.5">
      <Reveal delay={0.1}>
        <Panel title="Network traffic" count="Last 30 days"><TrafficChart /></Panel>
      </Reveal>
      <Reveal delay={0.16}>
        <Panel title="Alerts by severity" count={`${METRICS.alerts} raised`}><SeverityDonut /></Panel>
      </Reveal>
    </div>

    <div className="grid lg:grid-cols-2 gap-3.5">
      <Reveal delay={0.2}>
        <Panel title="What changed" count={`${CHANGES.length} entries`}>
          {CHANGES.map(c => (
            <div key={c.id} className="flex items-start gap-3 px-[18px] py-3 border-b border-line last:border-b-0">
              <span className="w-[17px] h-[17px] rounded-full bg-healthy/[.12] grid place-items-center mt-0.5 shrink-0">
                <span className="w-[5px] h-[5px] rounded-full bg-healthy" />
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-[15px]">{c.what}</div>
                <div className="font-mono text-sm text-muted mt-0.5">{c.where}</div>
              </div>
              <span className="font-mono text-sm text-muted shrink-0">{c.when}</span>
            </div>
          ))}
        </Panel>
      </Reveal>
      <Reveal delay={0.26}>
        <Panel title="Needs attention" count={`${FINDINGS.length} open`}>
          {FINDINGS.map(f => (
            <button key={f.id} onClick={() => onExplain(f)}
              className="w-full text-left flex items-start gap-3 px-[18px] py-3 border-b border-line
                         last:border-b-0 hover:bg-soft/[.022] transition-colors">
              <span className={`w-[17px] h-[17px] rounded-full grid place-items-center mt-0.5 shrink-0
                ${f.severity === 'High' ? 'bg-critical/[.12]' : 'bg-attention/[.12]'}`}>
                <span className={`w-[5px] h-[5px] rounded-full ${f.severity === 'High' ? 'bg-critical' : 'bg-attention'}`} />
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-[15px]">{f.title}</div>
                <div className="font-mono text-sm text-muted mt-0.5">{f.asset}</div>
              </div>
              <Chip tone={f.severity === 'High' ? 'critical' : f.severity === 'Medium' ? 'attention' : ''}>{f.severity}</Chip>
            </button>
          ))}
        </Panel>
      </Reveal>
    </div>
  </>);
}

function StateCard({ s, i, onExplain }) {
  return (
    <Reveal delay={i * 0.07}>
      <button onClick={() => onExplain(s)}
        className="group w-full text-left bg-elevated border border-line rounded-[3px]
                   p-[17px] hover:border-line2 transition-colors">
        <div className="flex items-center gap-2 mb-3">
          <span className={`w-[7px] h-[7px] rounded-full ${TONE[s.tone]}`} />
          <span className="font-mono text-sm text-secondary tracking-[.09em] uppercase">{s.label}</span>
          <span className="ml-auto font-mono text-sm text-muted opacity-0 group-hover:opacity-100 transition-opacity">
            Explain
          </span>
        </div>
        <div className="font-serif text-[21px] leading-tight">{s.word}</div>
        <div className="flex items-end justify-between gap-3 mt-2">
          <div>
            <div className="font-serif text-[25px] leading-none">
              <Count to={s.value} suffix={s.suffix} decimals={s.suffix === '%' ? 1 : 0} />
            </div>
            <div className="text-sm text-secondary mt-1.5">{s.sub}</div>
          </div>
          {s.trend && <Spark data={s.trend} />}
        </div>
      </button>
    </Reveal>
  );
}

/* Sparkline as an animated SVG path. Drawn from the real series, no
   smoothing that would misrepresent its shape. */
function Spark({ data }) {
  const w = 96, h = 30, min = Math.min(...data), max = Math.max(...data), span = (max - min) || 1;
  const pts = data.map((v, i) => [(i / (data.length - 1)) * w, h - 2 - ((v - min) / span) * (h - 6)]);
  const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  return (
    <svg width={w} height={h} className="shrink-0 overflow-visible" aria-hidden>
      <motion.path d={d} fill="none" stroke="#3ECF8E" strokeWidth={1.3}
        strokeLinecap="round" strokeLinejoin="round"
        initial={{ pathLength: 0 }} animate={{ pathLength: 1 }}
        transition={{ duration: 1.1, ease: [0.22,0.61,0.36,1], delay: .2 }} />
      <circle cx={pts.at(-1)[0]} cy={pts.at(-1)[1]} r={1.9} fill="#3ECF8E" />
    </svg>
  );
}

function Table({ cols, rows }) {
  return (
    <Panel>
      <table className="w-full border-collapse">
        <thead>
          <tr>{cols.map(c => (
            <th key={c} className="text-left font-mono text-sm tracking-[.1em] uppercase text-muted
                                   font-medium px-[18px] py-[11px] border-b border-line">{c}</th>
          ))}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="hover:bg-soft/[.022] transition-colors">
              {r.map((c, j) => (
                <td key={j} className={`px-[18px] py-3 border-b border-line text-[15px]
                  ${j ? 'font-mono text-sm text-secondary' : ''}`}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}

/* §30 evidence first: observation, evidence, assessment, recommendation,
   always in that order, so a claim never precedes what it rests on. */
function Drawer({ item, onClose }) {
  const chain = item.chain || {
    observation: `${item.title} was raised on ${item.opened} and is still open.`,
    evidence: `Severity ${item.severity}, affecting ${item.asset}, seen ${item.seen} time(s)`,
    assessment: `Rated ${item.severity} against the ${item.domain} domain.`,
    recommendation: 'Review and assign an owner with a remediation date.',
  };
  const rows = [['Observation', chain.observation], ['Evidence', chain.evidence],
                ['Assessment', chain.assessment], ['Recommendation', chain.recommendation]];
  return (
    <>
      <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
        onClick={onClose} className="fixed inset-0 bg-obsidian/70 z-40" />
      <motion.aside role="dialog" aria-modal="true"
        initial={{ x:'100%' }} animate={{ x:0 }} exit={{ x:'100%' }}
        transition={{ type:'spring', stiffness:340, damping:36 }}
        className="fixed top-0 right-0 bottom-0 w-[min(460px,100%)] bg-graphite
                   border-l border-line2 z-50 flex flex-col">
        <div className="px-[22px] py-5 border-b border-line">
          <div className="font-mono text-sm text-muted tracking-[.12em] uppercase">Explain</div>
          <div className="font-serif text-[22px] mt-1.5">{item.label || item.title}</div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {rows.map(([k, v]) => (
            <div key={k} className="px-[22px] py-4 border-b border-line last:border-b-0">
              <div className="font-mono text-sm text-muted tracking-[.12em] uppercase mb-1.5">{k}</div>
              <div className="text-[15px] leading-relaxed">{v}</div>
            </div>
          ))}
        </div>
        <div className="px-[22px] py-4 border-t border-line flex justify-end gap-2.5">
          <button onClick={onClose}
            className="h-9 px-4 rounded-[3px] border border-line2 text-sm text-secondary
                       hover:text-soft hover:border-secondary transition-colors">Close</button>
        </div>
      </motion.aside>
    </>
  );
}
