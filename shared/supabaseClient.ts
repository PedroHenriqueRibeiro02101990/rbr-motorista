import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

// URL e chave publishable do projeto real "ERP RBR" (kwscmegsfbtvlnyxougt).
// A chave publishable/anon é segura para expor no cliente — o acesso real é
// controlado inteiramente por RLS no Postgres (ver claude/schema-supabase-v1.md).
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? 'https://kwscmegsfbtvlnyxougt.supabase.co'
const SUPABASE_PUBLISHABLE_KEY =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  'sb_publishable_sthW1YMeFhUi97okxaocWw_UDBYaO6A'

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
})
