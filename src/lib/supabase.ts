import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const ADMIN_EMAIL = import.meta.env.VITE_ADMIN_EMAIL as string;

if (!url || !key) {
  console.warn('[FermenteFM] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY tanımlı değil.');
}

export const supabase = createClient(
  url || 'https://placeholder.supabase.co',
  key || 'placeholder',
);

// Public URL for a file in the fermentefm bucket
export function audioUrl(filePath: string): string {
  return supabase.storage.from('fermentefm').getPublicUrl(filePath).data.publicUrl;
}
