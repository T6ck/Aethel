'use client';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Reveal } from '@/components/ui';

/* The globe carries three.js, so it stays out of the initial bundle and
   never runs during static export. */
const Globe = dynamic(() => import('@/components/Globe'), { ssr: false });

const STATUS = [
  ['Infrastructure', 'Operational'],
  ['Security', 'Protected'],
  ['Monitoring', 'Active'],
  ['Risk', 'Low'],
];

export default function Marketing() {
  return (
    <main className="min-h-screen bg-obsidian">
      <nav className="flex items-center gap-8 px-8 h-[68px] border-b border-line">
        <div className="flex items-center gap-3">
          <span className="font-serif text-[22px] leading-none">A</span>
          <span className="font-serif text-[15px] tracking-[.3em]">AETHEL</span>
        </div>
        <div className="hidden md:flex gap-7 font-mono text-sm text-secondary tracking-[.1em]">
          {['PLATFORM','SECURITY','INFRASTRUCTURE','INSIGHTS'].map(i => (
            <span key={i} className="hover:text-soft cursor-pointer transition-colors">{i}</span>
          ))}
        </div>
        <Link href="/dashboard"
          className="ml-auto inline-flex items-center gap-2 h-9 px-4 rounded-[3px]
                     bg-soft text-obsidian text-sm font-semibold hover:bg-white transition-colors">
          Client Login <span aria-hidden>→</span>
        </Link>
      </nav>

      <section className="relative overflow-hidden min-h-[600px] flex items-center">
        <Globe className="absolute inset-0 left-1/3" reduced={false} />
        {/* the copy sits over the globe, faded so the type never fights it */}
        <div className="absolute inset-y-0 left-0 w-full md:w-[62%]
                        bg-gradient-to-r from-obsidian via-obsidian/92 to-transparent pointer-events-none" />
        <div className="relative px-8 md:px-14 py-20 max-w-[620px]">
          <motion.h1
            initial={{ opacity:0, y:16 }} animate={{ opacity:1, y:0 }}
            transition={{ duration:.75, ease:[0.22,0.61,0.36,1] }}
            className="font-serif text-[46px] md:text-[58px] leading-[1.06] tracking-[-.015em]">
            Your technology,<br /><em className="italic text-secondary">in context.</em>
          </motion.h1>
          <motion.p
            initial={{ opacity:0, y:14 }} animate={{ opacity:1, y:0 }}
            transition={{ duration:.7, delay:.14 }}
            className="mt-6 text-[16px] leading-relaxed text-secondary max-w-[46ch]">
            Aethel gives you a clear, living view of the technology that runs your
            business. Infrastructure, security, operations and planning, in one place.
          </motion.p>
          <motion.div
            initial={{ opacity:0, y:12 }} animate={{ opacity:1, y:0 }}
            transition={{ duration:.7, delay:.26 }}
            className="mt-9 flex flex-wrap gap-3">
            <Link href="/dashboard"
              className="inline-flex items-center h-11 px-6 rounded-[3px] bg-soft text-obsidian
                         font-semibold hover:bg-white transition-colors">
              Explore the platform
            </Link>
            <Link href="/dashboard"
              className="inline-flex items-center gap-2 h-11 px-6 rounded-[3px] border border-line2
                         text-secondary hover:text-soft hover:border-secondary transition-colors">
              Client login <span aria-hidden>→</span>
            </Link>
          </motion.div>

          <Reveal delay={0.4} className="mt-14">
            <div className="font-mono text-sm text-secondary tracking-[.16em]">MANAGED BY</div>
            <div className="font-serif text-[19px] tracking-[.26em] mt-1">NOIRA</div>
          </Reveal>
        </div>
      </section>

      <section className="border-t border-line">
        <div className="grid grid-cols-2 md:grid-cols-4">
          {STATUS.map(([k, v], i) => (
            <Reveal key={k} delay={i * 0.07}
              className="px-7 py-6 border-r border-line last:border-r-0">
              <div className="flex items-center gap-2.5">
                <span className="w-[6px] h-[6px] rounded-full bg-healthy" />
                <span className="font-mono text-sm text-secondary tracking-[.1em] uppercase">{k}</span>
              </div>
              <div className="font-serif text-[19px] mt-2">{v}</div>
            </Reveal>
          ))}
        </div>
      </section>

      <footer className="px-8 py-10 border-t border-line text-sm text-secondary">
        Aethel is the environment. Noira is the operator.
      </footer>
    </main>
  );
}
