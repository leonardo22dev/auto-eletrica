import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.{js,jsx}', 'supabase/**/*.test.js'],
    testTimeout: 30000,
    // Cada arquivo de teste de banco sobe um Postgres em WebAssembly e aplica
    // as migrations uma vez. Com a suíte inteira em paralelo, o primeiro
    // gancho passava dos 10 s padrão de vez em quando.
    hookTimeout: 60000,
  },
})
