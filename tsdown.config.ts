import { defineConfig } from 'tsdown'

export default defineConfig({
  clean: true,
  dts: false,
  entry: ['src/cli.ts'],
  format: 'esm',
  outDir: 'dist',
  platform: 'node',
  sourcemap: false,
  target: 'node20',
  deps: {
    neverBundle: ['better-sqlite3'],
    onlyBundle: false,
  },
})
