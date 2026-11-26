import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig, type Plugin } from 'vite';

const sharedModules = new Set([
  'svelte',
  'svelte/internal/client',
  'svelte/internal/disclose-version',
  'svelte/store',
  'svelte/reactivity',
]);

function checkClientOutput(): Plugin {
  return {
    name: 'kem-client-output',
    generateBundle: {
      order: 'post',
      handler(_options, bundle) {
        const entry = bundle['client.js'];
        if (entry?.type !== 'chunk' || !entry.isEntry || !entry.exports.includes('default')) {
          this.error('Expected client.js to be an ESM entry with a default export.');
        }
        if (!entry.imports.some((id) => bundle[id]?.type === 'chunk')) {
          this.error('Expected client.js to import a separate client chunk.');
        }

        let bytes = 0;
        for (const file of Object.values(bundle)) {
          if (file.type !== 'chunk' || !file.fileName.endsWith('.js') || (file.isEntry && file !== entry)) {
            this.error(`Unexpected client output: ${file.fileName}`);
          }
          for (const id of [...file.imports, ...file.dynamicImports]) {
            if (!Object.hasOwn(bundle, id) && !sharedModules.has(id)) {
              this.error(`Unsupported KEM client import ${JSON.stringify(id)} in ${file.fileName}.`);
            }
          }
          bytes += new TextEncoder().encode(file.code).byteLength;
        }
        if (bytes > 4 * 1024 * 1024) {
          this.error(`KEM client output exceeds the 4 MiB project budget (${bytes} bytes).`);
        }
      },
    },
  };
}

export default defineConfig({
  plugins: [svelte({ compilerOptions: { runes: true, css: 'injected' } }), checkClientOutput()],
  publicDir: false,
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    lib: {
      entry: 'src/client.ts',
      formats: ['es'],
      fileName: () => 'client.js',
    },
    rolldownOptions: {
      // Expose unknown Svelte subpaths to the output check instead of bundling a second runtime.
      external: /^svelte(?:\/|$)/,
      output: {
        chunkFileNames: 'chunks/[name]-[hash].js',
        codeSplitting: {
          // Both UI contributions and the desktop integration share this module instance.
          groups: [{ name: 'player-state', test: /[\\/]src[\\/]player-store\.ts$/ }],
        },
      },
    },
  },
});
