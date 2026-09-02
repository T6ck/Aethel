'use client';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
         PieChart, Pie, Cell, CartesianGrid } from 'recharts';
import { Empty } from './ui';

/* Both charts take live rows. Neither has its own dataset, deliberately:
   a chart with a hardcoded series under a live count is the failure that
   makes a dashboard untrustworthy. */

const tip = {
  contentStyle:{ background:'#17171B', border:'1px solid #26262C', borderRadius:3, fontSize:13 },
  labelStyle:{ color:'#8A8A8F', fontSize:12 }, itemStyle:{ color:'#F5F5F2' },
};
const SEV = { Critical:'#E56A5A', High:'#E56A5A', Medium:'#E0A33E', Low:'#8A8A8F', Info:'#4A4A4F' };
const ORDER = ['Critical','High','Medium','Low','Info'];

export function FindingsDonut({ findings }) {
  const open = (findings || []).filter(f => f.status !== 'Resolved');
  if (!open.length) return <Empty t="No open findings" s="Nothing is currently outstanding in this environment." />;
  const data = ORDER.map(name => ({ name, value: open.filter(f => f.severity===name).length, fill:SEV[name] }))
                    .filter(d => d.value > 0);
  return (
    <div className="relative h-[210px]">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="value" innerRadius={54} outerRadius={78}
               paddingAngle={3} stroke="none" startAngle={90} endAngle={-270}>
            {data.map((d,i) => <Cell key={i} fill={d.fill} />)}
          </Pie>
          <Tooltip {...tip} />
        </PieChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <div className="font-serif text-[27px] leading-none text-soft">{open.length}</div>
        <div className="font-mono text-sm text-secondary mt-1">OPEN</div>
      </div>
    </div>
  );
}

export function FindingsTrend({ findings, weeks=12 }) {
  const rows = (findings || []).filter(f => f.opened);
  if (!rows.length) return <Empty t="Nothing to plot" s="Built from the dates findings were opened. Record one and it appears here." />;
  const now = new Date();
  const data = Array.from({ length: weeks }, (_, i) => {
    const end = new Date(now); end.setDate(end.getDate() - (weeks-1-i)*7);
    const start = new Date(end); start.setDate(start.getDate()-6);
    return { label:`${start.getMonth()+1}/${start.getDate()}`,
      opened: rows.filter(f => { const d=new Date(f.opened); return d>=start && d<=end; }).length };
  });
  return (
    <div className="h-[210px] px-2 pt-4 pb-2">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top:4, right:12, left:-18, bottom:0 }}>
          <defs><linearGradient id="ft" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#E0A33E" stopOpacity={0.26} />
            <stop offset="100%" stopColor="#E0A33E" stopOpacity={0} />
          </linearGradient></defs>
          <CartesianGrid stroke="#1A1A1F" vertical={false} />
          <XAxis dataKey="label" tick={{ fill:'#4A4A4F', fontSize:11 }} tickLine={false}
                 axisLine={{ stroke:'#1A1A1F' }} interval={2} />
          <YAxis allowDecimals={false} tick={{ fill:'#4A4A4F', fontSize:11 }} tickLine={false} axisLine={false} width={34} />
          <Tooltip {...tip} formatter={v => [v,'Opened']} />
          <Area type="monotone" dataKey="opened" stroke="#E0A33E" strokeWidth={1.4} fill="url(#ft)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function LifecycleTrend({ assets }) {
  const rows = (assets || []).filter(a => a.eos_date);
  if (!rows.length) return <Empty t="No lifecycle dates" s="Add an end of support date to an asset and the replacement horizon appears here." />;
  const map = {};
  rows.forEach(a => {
    const d = new Date(a.eos_date);
    const k = `${d.getFullYear()} Q${Math.floor(d.getMonth()/3)+1}`;
    map[k] = (map[k]||0)+1;
  });
  const data = Object.entries(map).sort().map(([label,count]) => ({ label, count }));
  return (
    <div className="h-[210px] px-2 pt-4 pb-2">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top:4, right:12, left:-18, bottom:0 }}>
          <defs><linearGradient id="lc" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3ECF8E" stopOpacity={0.24} />
            <stop offset="100%" stopColor="#3ECF8E" stopOpacity={0} />
          </linearGradient></defs>
          <CartesianGrid stroke="#1A1A1F" vertical={false} />
          <XAxis dataKey="label" tick={{ fill:'#4A4A4F', fontSize:11 }} tickLine={false} axisLine={{ stroke:'#1A1A1F' }} />
          <YAxis allowDecimals={false} tick={{ fill:'#4A4A4F', fontSize:11 }} tickLine={false} axisLine={false} width={34} />
          <Tooltip {...tip} formatter={v => [v,'Assets']} />
          <Area type="stepAfter" dataKey="count" stroke="#3ECF8E" strokeWidth={1.4} fill="url(#lc)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
