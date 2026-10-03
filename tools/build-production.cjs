/* Publish an explicit runtime allowlist; keep editable sources in the checkout. */
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const {minify: minifyJS} = require('terser');
const {minify: minifyHTML} = require('html-minifier-terser');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'dist');
const hash = text => crypto.createHash('sha256').update(text).digest('hex').slice(0, 16);
async function read(file) { return fs.readFile(path.join(root, file), 'utf8'); }
async function write(file, content) {
  const destination = path.resolve(output, file);
  if (!destination.startsWith(output + path.sep)) throw new Error('Invalid output path: ' + file);
  await fs.mkdir(path.dirname(destination), {recursive: true});
  await fs.writeFile(destination, content);
}
function dataMap(source, name) {
  const match = source.match(new RegExp('^var ' + name + '=(.*);$', 'm'));
  if (!match) throw new Error('Missing runtime asset map: ' + name);
  return JSON.parse(match[1]);
}
async function compress(source) {
  const result = await minifyJS(source, {
    compress: {passes: 2},
    mangle: true,
    sourceMap: false,
    format: {comments: false}
  });
  if (!result.code) throw new Error('Empty JavaScript output');
  return result.code;
}
async function build() {
  // This fixed, checked directory is the only directory this builder removes.
  if (output !== path.resolve(root, 'dist') || path.dirname(output) !== root) {
    throw new Error('Unsafe output directory');
  }
  await fs.rm(output, {recursive: true, force: true});
  await fs.mkdir(output, {recursive: true});
  const app = await read('app.js');
  const photos = dataMap(app, 'PH'), audio = dataMap(app, 'AUD');
  const bundle = await compress((await read('core.js')) + '\n;' + app);
  const bundlePath = 'assets/app.' + hash(bundle) + '.min.js';
  await write(bundlePath, bundle);
  const html = (await read('index.html')).replace(
    /<script src="core\.js" defer><\/script>\s*<script src="app\.js" defer><\/script>/,
    '<script src="' + bundlePath + '" defer></script>'
  );
  if (html.includes('src="core.js"') || html.includes('src="app.js"')) {
    throw new Error('Original script references remain');
  }
  await write('index.html', await minifyHTML(html, {
    collapseWhitespace: true,
    conservativeCollapse: true,
    removeComments: true,
    minifyCSS: true
  }));
  const fixedAssets = ['assets/icon-192.png', 'assets/icon-512.png',
    'assets/ai-air-guardian-thumbnail-v1.png', 'assets/law-byl14.pdf'];
  for (const file of new Set([...fixedAssets, ...Object.values(photos), ...Object.values(audio)])) {
    if (!/^assets\/[a-zA-Z0-9_./-]+$/.test(file) || file.includes('..')) {
      throw new Error('Invalid runtime asset: ' + file);
    }
    await write(file, await fs.readFile(path.join(root, file)));
  }
  await write('manifest.webmanifest', JSON.stringify(JSON.parse(await read('manifest.webmanifest'))));
  const urls = ['index.html', bundlePath, 'manifest.webmanifest', 'assets/icon-192.png',
    'assets/icon-512.png', 'assets/law-byl14.pdf',
    ...['l1', 'l2', 'w1', 'w2', 'w3', 'edu_shoot'].map(key => photos[key])];
  const digest = crypto.createHash('sha256');
  for (const url of urls) digest.update(await fs.readFile(path.join(output, url)));
  const version = digest.digest('hex').slice(0, 16);
  await write('precache.js', await compress('self.PRECACHE_VERSION=' + JSON.stringify(version) +
    ';self.PRECACHE_URLS=' + JSON.stringify(urls) + ';'));
  // The build marker changes the worker bytes when cached product files change.
  const worker = await compress(await read('sw.js'));
  await write('sw.js', '/* build ' + version + ' */\n' + worker);
  console.log('Production build:', bundlePath, '— no original scripts or source maps');
}
build().catch(error => {console.error(error); process.exitCode = 1;});
