'use client';
import { createClient } from '@supabase/supabase-js';

/* A publishable key identifies the project and grants nothing on its
   own. Every table has RLS forced and every policy keys off org
   membership, so this key can only ever reach rows the signed in user
   is entitled to. Shipping it in the bundle is the intended use. */
export const SUPABASE_URL = 'https://tejsbytmtcdzvgzlpkgp.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_Wu9i_AiY83mk7NwPRuq4qw_I7C0Eu7R';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession:true, autoRefreshToken:true, detectSessionInUrl:true },
});

export const BRAND = {
  name: 'Groundplane',
  domain: 'groundplanes.com',
  tagline: 'Know what you are standing on.',
  lede: 'A living view of the technology that runs your business. Infrastructure, security, operations and planning, measured against a known reference.',
};
