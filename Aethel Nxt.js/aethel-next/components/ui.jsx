'use client';
import { motion, useInView, useMotionValue, useSpring } from 'framer-motion';
import { useEffect, useRef } from 'react';

/* Reveal. One orchestrated moment as a section enters, then nothing.
   §43 nothing decorative without purpose: this marks arrival, and it
   fires once rather than on every scroll pass. */
export function Reveal({ children, delay = 0, className = '' }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-60px' });
  return (
    <motion.div
      ref={ref} className={className}
      initial={{ opacity: 0, y: 10 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.5, delay, ease: [0.22, 0.61, 0.36, 1] }}
    >{children}</motion.div>
  );
}

/* A number arriving, not a number decorating. Spring rather than a
   linear tween so it settles instead of stopping dead. */
export function Count({ to, suffix = '', decimals = 1, className = '' }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true });
  const mv = useMotionValue(0);
  const spring = useSpring(mv, { stiffness: 70, damping: 20 });

  useEffect(() => { if (inView) mv.set(to); }, [inView, to, mv]);
  useEffect(() => spring.on('change', (v) => {
    if (ref.current) ref.current.textContent = v.toFixed(decimals) + suffix;
  }), [spring, decimals, suffix]);

  return <span ref={ref} className={className}>{'0' + suffix}</span>;
}

export function Chip({ tone = '', children }) {
  const map = {
    healthy:   'text-healthy border-healthy/35',
    attention: 'text-attention border-attention/35',
    critical:  'text-critical border-critical/35',
    '':        'text-secondary border-line2',
  };
  return (
    <span className={`font-mono text-sm px-2 py-[1px] border rounded-[2px] whitespace-nowrap ${map[tone]}`}>
      {children}
    </span>
  );
}

export function Panel({ title, count, action, children, className = '' }) {
  return (
    <section className={`bg-elevated border border-line rounded-[3px] ${className}`}>
      {title && (
        <div className="flex items-baseline justify-between gap-4 px-[18px] py-[15px] border-b border-line">
          <h2 className="text-[15px] font-semibold text-soft">{title}</h2>
          {count != null && <span className="text-sm text-secondary">{count}</span>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
