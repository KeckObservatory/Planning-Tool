import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import { resolve } from 'path'

const main = resolve(__dirname, './index.html')
// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    chunkSizeWarningLimit: 1000,
    minify: 'esbuild',
    outDir: resolve(__dirname, 'dist'),
    rollupOptions: {
      input: {
        main: main,
      },
      output: {
        // Keep the big charting libraries in their own chunks. They are only
        // reached through React.lazy imports, so they are fetched when a chart
        // dialog is first opened instead of at startup. Splitting them also
        // means a change to app code doesn't invalidate their browser cache.
        manualChunks(id) {
          if (id.includes('node_modules/plotly.js')) return 'plotly'
          if (id.includes('node_modules/aladin-lite')) return 'aladin'
          if (id.includes('node_modules/html2canvas')) return 'html2canvas'
          if (id.includes('node_modules/@mui/x-data-grid')) return 'datagrid'
        },
      },
    },
  },
})
