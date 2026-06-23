import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', '../supabase/functions/ai-assistant/**/*.test.ts'],
  },
})
