'use client';
import { motion, useInView, useMotionValue, useSpring } from 'framer-motion';
import { useEffect, useRef } from 'react';

export function Reveal({ children, delay=0, className='' }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once:true, margin:'-60px' });
  return (
    <motion.div ref={ref} className={className}
      initial={{ opacity:0, y:10 }} animate={inView ? { opacity:1, y:0 } : {}}
      transition={{ duration:.5, delay, ease:[0.22,0.61,0.36,1] }}>{children}</motion.div>
  );
}

/* A number arriving, not decorating. Spring so it settles. */
export function Count({ to, suffix='', decimals=0, className='' }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once:true });
  const mv = useMotionValue(0);
  const spring = useSpring(mv, { stiffness:70, damping:20 });
  useEffect(() => { if (inView) mv.set(Number(to) || 0); }, [inView, to, mv]);
  useEffect(() => spring.on('change', v => {
    if (ref.current) ref.current.textContent = v.toFixed(decimals) + suffix;
  }), [spring, decimals, suffix]);
  return <span ref={ref} className={className}>{'0' + suffix}</span>;
}

export function Chip({ tone='', children }) {
  const map = {
    healthy:'text-healthy border-healthy/35', attention:'text-attention border-attention/35',
    critical:'text-critical border-critical/35', '':'text-secondary border-line2',
  };
  return <span className={`font-mono text-sm px-2 py-[1px] border rounded-[2px] whitespace-nowrap ${map[tone]}`}>{children}</span>;
}

export function Panel({ title, count, action, children, className='' }) {
  return (
    <section className={`bg-elevated border border-line rounded-[3px] ${className}`}>
      {title && (
        <div className="flex items-baseline justify-between gap-4 px-[18px] py-[15px] border-b border-line">
          <h2 className="text-[15px] font-semibold text-soft">{title}</h2>
          <div className="flex items-center gap-3">
            {count != null && <span className="text-sm text-secondary">{count}</span>}
            {action}
          </div>
        </div>
      )}
      {children}
    </section>
  );
}

export function Empty({ t, s, action }) {
  return (
    <div className="px-[18px] py-7">
      <div className="text-[15px] font-semibold text-soft">{t}</div>
      {s && <div className="text-sm text-secondary mt-1.5 max-w-[56ch] leading-relaxed">{s}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Head({ title, desc, right }) {
  return (
    <div className="flex items-start justify-between gap-6 mb-6">
      <div>
        <h1 className="font-serif text-[28px] leading-tight">{title}</h1>
        {desc && <p className="text-[15px] text-secondary mt-1.5 max-w-[68ch]">{desc}</p>}
      </div>
      {right}
    </div>
  );
}

export function Btn({ children, onClick, variant='', type='button', disabled, className='' }) {
  const base = 'inline-flex items-center gap-2 h-10 px-4 rounded-[3px] text-sm transition-colors disabled:opacity-50';
  const v = variant === 'primary'
    ? 'bg-soft text-obsidian font-semibold hover:bg-white'
    : variant === 'ghost'
    ? 'text-secondary hover:text-soft'
    : 'border border-line2 text-secondary hover:text-soft hover:border-secondary';
  return <button type={type} onClick={onClick} disabled={disabled} className={`${base} ${v} ${className}`}>{children}</button>;
}

/* The mark: a horizon line with a measured point above it. A groundplane
   is the reference everything is measured against, so the mark is that
   idea and nothing else. Holds at 16px because it is two shapes. */
export function Mark({ size=26, className='' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} aria-hidden="true">
      <path d="M3 22h26" stroke="currentColor" strokeWidth="1.6" strokeLinecap="square" />
      <path d="M16 22V8" stroke="currentColor" strokeWidth="1.2" opacity=".55" />
      <circle cx="16" cy="7" r="3" fill="currentColor" />
      <path d="M7 22l4.5-6M25 22l-4.5-6" stroke="currentColor" strokeWidth="1" opacity=".3" />
    </svg>
  );
}

export function Wordmark({ className='' }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <Mark size={22} className="text-soft" />
      <span className="font-serif text-[15px] tracking-[.24em] text-soft">GROUNDPLANE</span>
    </span>
  );
}
