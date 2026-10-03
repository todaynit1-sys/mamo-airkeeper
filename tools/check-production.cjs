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
  assert.ok(!published.includes('precache.js'), 'No offline precache manifest');
  assert.ok(!html.includes('data-view="offline"') && !html.includes('saveAudioPack'));
  assert.ok(!bundle.includes('beforeinstallprompt') && !bundle.includes('serviceWorker.register('));
  const cacheKeys = new Set(['airkeeper-base-old', 'airkeeper-audio-v1', 'other-app-cache']);
  const caches = {
    async keys() {return [...cacheKeys];},
    async delete(name) {return cacheKeys.delete(name);}
  };
  const events = {};
  let skipped = false, claimed = false, unregistered = false;
  const worker = {self: {
    async skipWaiting() {skipped = true;},
    clients: {async claim() {claimed = true;}},
    registration: {async unregister() {unregistered = true; return true;}},
    addEventListener(name, listener) {events[name] = listener;}
  }, caches};
  vm.runInNewContext(read('sw.js'), worker);
  assert.equal(events.fetch, undefined, 'Retirement worker must never serve offline responses');
  let install;
  events.install({waitUntil(task) {install = task;}});
  await install;
  let activation;
  events.activate({waitUntil(task) {activation = task;}});
  await activation;
  assert.ok(skipped && claimed && unregistered);
  assert.deepEqual([...cacheKeys], ['other-app-cache']);

  // The new app must also retire an existing controller without erasing drafts.
  const source = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const cleanup = source.match(/async function retireOffline\(\)\{[\s\S]*?\n\}/)[0];
  const saved = new Map([['ms.packDate','old'], ['ms.packVersion','old'],
    ['ms2.draft','draft'], ['ms.favorites','favorites'], ['ms.theme','dark']]);
  let ownRemoved = false, otherRemoved = false, reloads = 0;
  const registration = {active: {scriptURL: 'https://app.test/sw.js'},
    async unregister() {ownRemoved = true; return true;}};
  const unrelated = {active: {scriptURL: 'https://app.test/other/sw.js'},
    async unregister() {otherRemoved = true; return true;}};
  const app = {window: {caches}, caches, URL, console,
    location: {href: 'https://app.test/?update=online#home', reload() {reloads++;}},
    navigator: {onLine: true, serviceWorker: {controller: registration.active,
      async getRegistrations() {return [registration, unrelated];}}},
    localStorage: {removeItem(key) {saved.delete(key);}}};
  cacheKeys.add('airkeeper-base-old'); cacheKeys.add('airkeeper-audio-v1');
  await vm.runInNewContext(cleanup + '\nretireOffline();', app);
  assert.ok(ownRemoved && !otherRemoved);
  assert.equal(reloads, 1);
  assert.deepEqual([...cacheKeys], ['other-app-cache']);
  assert.deepEqual([...saved.keys()], ['ms2.draft', 'ms.favorites', 'ms.theme']);
  app.navigator.serviceWorker.getRegistrations = async () => {throw new Error('Restricted storage');};
  app.console = {warn() {}};
  await vm.runInNewContext(cleanup + '\nretireOffline();', app);
  assert.equal(reloads, 1, 'Cleanup failure must not cause a reload loop');
  const config = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
  assert.ok(config.headers.some(rule => rule.source === '/(.*)' && rule.headers.some(
    header => header.key === 'Cache-Control' && header.value === 'no-store')));
  console.log('Production checks passed: minified allowlist, no offline pack, scoped cache retirement, drafts retained');

}
check().catch(error => {console.error(error); process.exitCode = 1;});
