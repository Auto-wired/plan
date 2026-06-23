import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const rootDir = path.dirname(fileURLToPath(import.meta.url))
const pkg = JSON.parse(readFileSync(path.join(rootDir, 'package.json'), 'utf-8')) as {
  version: string
}

function resolveBuildSha(): string {
  const fromEnv = process.env.VITE_BUILD_SHA?.trim()
  if (fromEnv) return fromEnv.slice(0, 7)
  try {
    return execSync('git rev-parse --short HEAD', { cwd: rootDir, encoding: 'utf-8' }).trim()
  } catch {
    return 'dev'
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_SHA__: JSON.stringify(resolveBuildSha()),
  },
})
