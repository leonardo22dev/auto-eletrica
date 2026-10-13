import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.{js,jsx}', 'supabase/**/*.test.js'],
    testTimeout: 30000,
  },
})
