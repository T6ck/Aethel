'use client';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
         PieChart, Pie, Cell, CartesianGrid } from 'recharts';
import { TRAFFIC_30D, SEVERITY } from '@/lib/data';

const tip = {
  contentStyle:{ background:'#17171B', border:'1px solid #26262C', borderRadius:3, fontSize:13 },
  labelStyle:{ color:'#8A8A8F', fontSize:12 }, itemStyle:{ color:'#F5F5F2' },
};

export function TrafficChart() {
  return (
    <div className="h-[210px] px-2 pt-4 pb-2">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={TRAFFIC_30D} margin={{ top:4, right:12, left:-18, bottom:0 }}>
          <defs>
            <linearGradient id="tg" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor="#3ECF8E" stopOpacity={0.28} />
              <stop offset="100%" stopColor="#3ECF8E" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#1A1A1F" vertical={false} />
          <XAxis dataKey="d" tick={{ fill:'#4A4A4F', fontSize:11 }} tickLine={false}
                 axisLine={{ stroke:'#1A1A1F' }} interval={6} />
          <YAxis tick={{ fill:'#4A4A4F', fontSize:11 }} tickLine={false} axisLine={false} width={44} />
          <Tooltip {...tip} formatter={(v) => [v + ' MB', 'Traffic']} />
          <Area type="monotone" dataKey="mb" stroke="#3ECF8E" strokeWidth={1.4} fill="url(#tg)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function SeverityDonut() {
  const total = SEVERITY.reduce((a, s) => a + s.value, 0);
  return (
    <div className="relative h-[210px]">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={SEVERITY} dataKey="value" innerRadius={54} outerRadius={78}
               paddingAngle={3} stroke="none" startAngle={90} endAngle={-270}>
            {SEVERITY.map((s, i) => <Cell key={i} fill={s.value ? s.fill : '#1A1A1F'} />)}
          </Pie>
          <Tooltip {...tip} />
        </PieChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <div className="font-serif text-[27px] leading-none text-soft">{total}</div>
        <div className="font-mono text-sm text-secondary mt-1">OPEN</div>
      </div>
    </div>
  );
}
