import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const chave = import.meta.env.VITE_SUPABASE_ANON_KEY

export const configurado = Boolean(url && chave)

// A falta de configuração NÃO lança na avaliação do módulo. Um throw no topo
// é estaticamente analisável: sem as variáveis, o Rollup conclui que tudo
// depois dele é inalcançável e remove o app inteiro do bundle, produzindo uma
// página em branco sem erro de build. O erro precisa acontecer no uso.
function clienteNaoConfigurado() {
  const erro = () => {
    throw new Error(
      'Supabase não configurado: faltam VITE_SUPABASE_URL e ' +
        'VITE_SUPABASE_ANON_KEY no ambiente.',
    )
  }
  return new Proxy({}, { get: erro, apply: erro })
}

export const supabase = configurado
  ? createClient(url, chave, {
      auth: { persistSession: true, autoRefreshToken: true },
    })
  : clienteNaoConfigurado()
