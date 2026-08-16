import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = window.KHOTWATNA_SUPABASE_URL || 'YOUR_SUPABASE_URL';
const SUPABASE_ANON_KEY = window.KHOTWATNA_SUPABASE_ANON_KEY || 'YOUR_SUPABASE_PUBLISHABLE_KEY';

export const isConfigured = !SUPABASE_URL.startsWith('YOUR_') && !SUPABASE_ANON_KEY.startsWith('YOUR_');
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
