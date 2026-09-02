'use client';
import { createContext, useContext, useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { supabase, BRAND } from '@/lib/supabase';
import { Mark, Btn } from './ui';

/* Sign in. Deliberately not a funnel: no social login, no upsell.
 *
 * There is no allowlist check in this file. Anyone may create an
 * account; what they get is decided by the database trigger, which puts
 * an operator address into the operator org and everyone else into
 * their own tenant org. Doing it that way means the browser holds no
 * authority it could be tricked out of. */
function SignIn() {
  const [mode, setMode] = useState('in');
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const origin = () => (typeof window !== 'undefined' ? window.location.origin : '');

  async function submit(e) {
    e?.preventDefault(); setMsg(null); setBusy(true);
    const { error } = mode === 'in'
      ? await supabase.auth.signInWithPassword({ email: email.trim(), password: pass })
      : await supabase.auth.signUp({ email: email.trim(), password: pass,
          options: { emailRedirectTo: origin() + '/dashboard' } });
    setBusy(false);
    if (error) return setMsg({ bad:true, t:error.message });
    if (mode === 'up') setMsg({ t:'Check ' + email + ' for the confirmation link, then sign in.' });
  }

  async function reset() {
    setMsg(null);
    if (!email.trim()) return setMsg({ bad:true, t:'Enter your email first.' });
    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(),
      { redirectTo: origin() + '/reset' });
    setBusy(false);
    setMsg(error ? { bad:true, t:error.message }
                 : { t:'Reset link sent. It opens on this site.' });
  }

  return (
    <div className="min-h-screen grid place-items-center px-5 bg-obsidian">
      <motion.div initial={{ opacity:0, y:12 }} animate={{ opacity:1, y:0 }}
        transition={{ duration:.5, ease:[0.22,0.61,0.36,1] }}
        className="w-full max-w-[420px] bg-elevated border border-line rounded-[3px] p-7">
        <div className="flex items-center gap-3">
          <Mark size={30} className="text-soft" />
          <div>
            <div className="font-serif text-[15px] tracking-[.24em]">GROUNDPLANE</div>
            <div className="font-mono text-sm text-secondary mt-0.5">
              {mode === 'in' ? 'Sign in' : 'Create an account'}
            </div>
          </div>
        </div>

        {/* a measured reference line: the product's own idea, not stock art */}
        <div className="my-6 py-5 px-3 bg-obsidian border border-line relative">
          <div className="h-px bg-line2 w-full" />
          {[18,38,62,82].map((x,i) => (
            <span key={x} style={{ left:x+'%' }}
              className={`absolute w-[5px] h-[5px] rounded-full -translate-x-1/2 -translate-y-1/2
                ${i===1||i===3 ? 'bg-healthy' : 'bg-line2'}`}
              />
          ))}
        </div>

        <form onSubmit={submit} className="grid gap-3">
          <label className="grid gap-1.5">
            <span className="font-mono text-sm text-secondary tracking-[.08em] uppercase">Email</span>
            <input type="email" required autoComplete="username" value={email}
              onChange={e => setEmail(e.target.value)} placeholder="you@company.com"
              className="h-11 px-3 bg-obsidian border border-line2 rounded-[2px] outline-none focus:border-secondary text-[15px]" />
          </label>
          <label className="grid gap-1.5">
            <span className="font-mono text-sm text-secondary tracking-[.08em] uppercase">Password</span>
            <input type="password" required minLength={8} value={pass}
              autoComplete={mode==='in'?'current-password':'new-password'}
              onChange={e => setPass(e.target.value)}
              className="h-11 px-3 bg-obsidian border border-line2 rounded-[2px] outline-none focus:border-secondary text-[15px]" />
          </label>
          <div className="flex flex-wrap gap-2 mt-2">
            <Btn type="submit" variant="primary" disabled={busy}>
              {mode==='in' ? 'Sign in' : 'Create account'}
            </Btn>
            <Btn onClick={() => setMode(m => m==='in'?'up':'in')}>
              {mode==='in' ? 'Create account' : 'Have an account'}
            </Btn>
            <Btn variant="ghost" onClick={reset} disabled={busy}>Forgot password</Btn>
          </div>
        </form>

        {msg && <div className={`mt-4 text-sm leading-relaxed ${msg.bad?'text-critical':'text-healthy'}`}>{msg.t}</div>}

        <p className="mt-6 pt-5 border-t border-line text-sm text-secondary leading-relaxed">
          New accounts start on a 14 day trial with one environment ready to use.
        </p>
      </motion.div>
    </div>
  );
}

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

export function AuthGate({ children }) {
  const [session, setSession] = useState(undefined);
  useEffect(() => {
    supabase.auth.getSession().then(({ data:{ session } }) => setSession(session ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e,s) => setSession(s ?? null));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (session === undefined)
    return <div className="min-h-screen grid place-items-center text-secondary text-sm">Checking access</div>;
  if (!session) return <SignIn />;
  return <AuthCtx.Provider value={{ session, email: session.user.email }}>{children}</AuthCtx.Provider>;
}
