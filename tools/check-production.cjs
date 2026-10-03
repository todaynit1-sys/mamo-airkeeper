const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..'), output = path.join(root, 'dist');
const read = file => fs.readFileSync(path.join(output, file), 'utf8');
function files(directory) {
  return fs.readdirSync(directory, {withFileTypes: true}).flatMap(entry => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? files(file) : [path.relative(output, file).replaceAll('\\', '/')];
  });
}
async function check() {
  const published = files(output), html = read('index.html');
  for (const file of ['app.js', 'core.js', 'README.md', 'vercel.json', 'package.json',
    'tools/build-production.cjs', 'assets/thumbnail-prompt.txt', '.env', '.omd/preferences.md']) {
    assert.ok(!published.includes(file), 'Development file must not be published: ' + file);
  }
  assert.ok(!published.some(file => /\.map$/.test(file)), 'Source maps must not be published');
  assert.ok(!html.includes('src="app.js"') && !html.includes('src="core.js"'));
  const scripts = [...html.matchAll(/<script\b[^>]*src="([^"]+)"/g)].map(match => match[1]);
  assert.equal(scripts.length, 1);
  assert.match(scripts[0], /^assets\/app\.[a-f0-9]{16}\.min\.js$/);
  const bundle = read(scripts[0]);
  assert.ok(!bundle.includes('sourceMappingURL'));
  assert.ok(!bundle.includes('function renderSearch('), 'Original internal names should be mangled');
  assert.ok(Buffer.byteLength(bundle) < fs.statSync(path.join(root, 'app.js')).size);
  // Both the hashed bundle and every offline URL must be real production files.
  const state = {self: {}};
  vm.runInNewContext(read('precache.js'), state);
  assert.ok(state.self.PRECACHE_URLS.includes(scripts[0]));
  for (const file of state.self.PRECACHE_URLS) assert.ok(published.includes(file), 'Missing cached file: ' + file);
  // Exercise the built service worker's install, cache, and byte-range handling.
  const stores = new Map(), events = {};
  const caches = {
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      const store = stores.get(name);
      return {
        async addAll(urls) {
          for (const url of urls) store.set('https://app.test/' + url,
            new Response(fs.readFileSync(path.join(output, url))));
        },
        async match(request) {
          const key = typeof request === 'string' ? request : request.url;
          return store.get(new URL(key, 'https://app.test/').href)?.clone();
        },
        async put(url, response) {store.set(url, response.clone());}
      };
    },
    async keys() {return [...stores.keys()];},
    async delete(name) {return stores.delete(name);}
  };
  const worker = {
    self: {location: {origin: 'https://app.test'}, clients: {async claim() {}},
      async skipWaiting() {}, addEventListener(name, listener) {events[name] = listener;}},
    caches, Request, Response, URL,
    fetch: async () => {throw new Error('Offline');}
  };
  const context = vm.createContext(worker);
  worker.importScripts = file => vm.runInContext(read(file), context);
  vm.runInContext(read('sw.js'), context);
  let install;
  events.install({waitUntil(task) {install = task;}});
  await install;
  let offline;
  events.fetch({request: new Request('https://app.test/' + scripts[0]), respondWith(task) {offline = task;}});
  assert.equal(await (await offline).text(), bundle);
  const audio = await caches.open('airkeeper-audio-v1');
  await audio.put('https://app.test/assets/audio/test.mp3', new Response('0123456789'));
  let partial;
  events.fetch({request: new Request('https://app.test/assets/audio/test.mp3',
    {headers: {Range: 'bytes=2-4'}}), respondWith(task) {partial = task;}});
  const response = await partial;
  assert.equal(response.status, 206);
  assert.equal(await response.text(), '234');
  console.log('Production checks passed: allowlist, minified bundle, no maps, offline cache, audio ranges');
}
check().catch(error => {console.error(error); process.exitCode = 1;});
