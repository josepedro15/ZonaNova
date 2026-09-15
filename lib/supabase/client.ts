'use client';

import { createBrowserClient } from '@supabase/ssr';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '@/lib/env';

/** Cliente do browser. Sujeito a RLS — é esse o ponto. */
export function criarClienteBrowser() {
    return createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}
