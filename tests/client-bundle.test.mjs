import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readdir, readFile } from 'node:fs/promises';
import { parseSync } from 'vite';

const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const sharedModules = new Set([
  'svelte',
  'svelte/internal/client',
  'svelte/internal/disclose-version',
  'svelte/store',
  'svelte/reactivity',
]);
const root = new URL(`../${manifest.kem.client.root}/`, import.meta.url);
const entry = new URL(manifest.kem.client.entry, root);

async function listClientFiles(dir) {
  const files = [];
  for (const child of await readdir(dir, { withFileTypes: true })) {
    if (child.isDirectory()) {
      files.push(...await listClientFiles(new URL(child.name + '/', dir)));
    } else {
      assert.ok(child.isFile() && child.name.endsWith('.js'), `Unexpected client file: ${child.name}`);
      files.push(new URL(child.name, dir).href);
    }
  }
  return files;
}

test('ships a native ESM entry and a reachable chunk under the client publish root', async () => {
  assert.equal(manifest.kem.client.root, './dist');
  assert.equal(manifest.kem.client.entry, './client.js');
  assert.equal(manifest.kem.host, './host.mjs');
  assert.deepEqual(manifest.files, ['dist/', 'host.mjs']);

  const files = new Set(await listClientFiles(root));
  const visited = new Set();
  const bare = new Set();
  async function visit(url) {
    if (visited.has(url.href)) return;
    assert.ok(files.has(url.href), `Module is missing from the client publish root: ${url.href}`);
    visited.add(url.href);
    const code = await readFile(url, 'utf8');
    const { module, errors } = parseSync(url.pathname, code);
    assert.deepEqual(errors, []);
    assert.equal(module.hasModuleSyntax, true);
    assert.doesNotMatch(code, /__KEM_CLIENT_PLUGIN__|\bKEM_PLATFORM\b/);
    const refs = [
      ...module.staticImports.map(({ moduleRequest }) => moduleRequest.value),
      ...module.staticExports.flatMap(({ entries }) =>
        entries.flatMap(({ moduleRequest }) => moduleRequest ? [moduleRequest.value] : [])),
      ...module.dynamicImports.map(({ moduleRequest: { start, end } }) => {
        const { program } = parseSync(url.pathname, code.slice(start, end));
        const [statement] = program.body;
        assert.ok(statement?.type === 'ExpressionStatement' &&
          statement.expression.type === 'Literal' && typeof statement.expression.value === 'string',
        'Expected a literal dynamic import');
        return statement.expression.value;
      }),
    ];
    for (const id of refs) {
      if (id.startsWith('./') || id.startsWith('../')) {
        await visit(new URL(id, url));
      } else {
        assert.ok(sharedModules.has(id), `Unsupported client import: ${id}`);
        bare.add(id);
      }
    }
  }

  await visit(entry);
  assert.ok(visited.size > 1, 'Expected the entry to load a separate JS chunk');
  assert.deepEqual(visited, files, 'Every emitted JS file must be reachable from the entry');
  for (const id of ['svelte', 'svelte/internal/client', 'svelte/internal/disclose-version', 'svelte/store']) {
    assert.ok(bare.has(id), `Expected shared external: ${id}`);
  }

  // --conditions=browser selects the same Svelte client exports as the renderer.
  const { default: plugin } = await import(entry.href);
  assert.deepEqual(plugin.inject, ['navRail', 'surfaces']);
  assert.equal(typeof plugin.apply, 'function');
});

test('registers the nav page, footer and desktop scope on one plugin fiber', async (t) => {
  const events = [];
  let listener;
  let nav;
  let surface;
  const effects = [];
  const scope = 'scope-local-player';
  const windowStub = {
    kemDesktop: {
      contributions: {
        open: async () => scope,
        menu: async (key, items) => events.push(['menu', key, items.map(({ id }) => id)]),
        caption: async (key, text) => events.push(['caption', key, text]),
        close: async (key) => events.push(['close', key]),
        onAction: (next) => {
          listener = next;
          return () => events.push(['unsubscribe']);
        },
      },
    },
  };
  // Cordis executes an effect immediately and keeps its disposer for fiber unload.
  const ctx = {
    effect(setup) {
      effects.push(setup());
      return async () => {};
    },
    navRail: {
      add(item) {
        nav = item;
        return async () => {};
      },
    },
    surfaces: {
      register(name, id, component) {
        surface = { name, id, component };
        return async () => {};
      },
    },
  };

  const originalWindow = globalThis.window;
  globalThis.window = windowStub;
  t.after(() => {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  });
  const { default: plugin } = await import(entry.href);
  await plugin.apply(ctx);

  assert.equal(nav.id, 'local-player');
  assert.equal(nav.label, '本地播放器');
  assert.equal(typeof nav.view, 'function');
  assert.deepEqual(
    { name: surface.name, id: surface.id },
    { name: 'footer', id: 'local-player' },
  );
  assert.equal(typeof surface.component, 'function');
  assert.deepEqual(
    events.filter(([type]) => type === 'menu'),
    [['menu', scope, ['previous', 'toggle', 'next']]],
  );
  const captions = events.filter(([type]) => type === 'caption');
  assert.ok(captions.length > 0);
  assert.ok(captions.every(([, key, text]) => key === scope && text === null));
  assert.equal(typeof listener, 'function');

  for (const cleanup of effects) await cleanup();
  assert.ok(events.some(([type, key]) => type === 'close' && key === scope));
  assert.ok(events.some(([type]) => type === 'unsubscribe'));
});
