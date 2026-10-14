import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const chave = import.meta.env.VITE_SUPABASE_ANON_KEY

// Modo demonstração: roda um Postgres em WebAssembly dentro do navegador,
// com as migrations reais e dados de exemplo. Serve para percorrer o sistema
// antes de existir um Supabase — nada do que acontece nele prova que a
// integração real funciona, e nada do que se digita nele é salvo em lugar
// nenhum: some ao recarregar a página.
export const modoDemo = import.meta.env.VITE_MODO_DEMO === '1'

export const configurado = modoDemo || Boolean(url && chave)

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

function clienteReal() {
  if (url && chave) {
    return createClient(url, chave, {
      auth: { persistSession: true, autoRefreshToken: true },
    })
  }
  return clienteNaoConfigurado()
}

// Import dinâmico para que o Postgres em WebAssembly, que pesa megabytes,
// só entre no bundle quando o modo demonstração está ligado. Em produção a
// condição é constante em tempo de build e o ramo inteiro some.
export const supabase = modoDemo
  ? (await import('../demo/cliente.js')).clienteDemo
  : clienteReal()
