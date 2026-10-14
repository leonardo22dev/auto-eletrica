import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const OBRIGATORIAS = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY']

// Build sem as variáveis gera um app que sobe em branco, sem erro visível.
// Melhor quebrar aqui, com o nome do que falta, do que descobrir em produção.
function exigirAmbiente(env) {
  const faltando = OBRIGATORIAS.filter((nome) => !env[nome])
  if (faltando.length === 0) return
  throw new Error(
    `Build abortado: falta ${faltando.join(' e ')}.\n` +
      'Local: copie .env.example para .env.local e preencha.\n' +
      'Vercel: cadastre em Settings > Environment Variables.',
  )
}

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  // O modo demonstração traz o próprio banco e não fala com o Supabase.
  if (command === 'build' && env.VITE_MODO_DEMO !== '1') {
    exigirAmbiente(env)
  }
  return {
    plugins: [react(), tailwindcss()],
  }
})
