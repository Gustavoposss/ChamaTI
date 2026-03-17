import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY

if (!supabaseUrl || !supabaseKey) {
  // Evita quebrar a aplicação em desenvolvimento caso as variáveis não estejam configuradas.
  // Apenas mostra um aviso no console.
  // eslint-disable-next-line no-console
  console.warn('Supabase não configurado. Verifique VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY.')
}

export const supabase = createClient(supabaseUrl, supabaseKey)

