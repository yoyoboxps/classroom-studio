import { createClient } from '@supabase/supabase-js';
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const supabase = url && key ? createClient(url, key) : null;
export async function api<T>(path: string, body?: unknown): Promise<T> {
  const session = await supabase?.auth.getSession();
  const response = await fetch(`/api/${path}`, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.data.session?.access_token ?? ''}` }, body: body ? JSON.stringify(body) : undefined });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ?? '暫時無法完成操作，請稍後再試。');
  return data;
}
