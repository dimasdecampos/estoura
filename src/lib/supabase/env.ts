export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
// Painel do Supabase: "Publishable key" (ou a antiga "anon key")
export const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const hasSupabaseEnv = Boolean(SUPABASE_URL && SUPABASE_KEY);
