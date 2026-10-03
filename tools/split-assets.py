"""One-time migration of embedded media to independently cached static files."""
import base64
import hashlib
import json
import pathlib
import re

root = pathlib.Path(__file__).resolve().parents[1]
page = root / 'index.html'
html = page.read_text(encoding='utf-8')
script = re.search(r'<script>\s*(\(function\(\)\{[\s\S]*?)</script>', html)
if not script:
    raise SystemExit('Already migrated: app.js is the editable source.')
js = script.group(1)
for name, folder, extension in [('PH', 'photos', '.jpg'), ('AUD', 'audio', '.mp3')]:
    match = re.search(r'var ' + name + r'=(.*?);\s*\n', js)
    values = json.loads(match.group(1))
    out = root / 'assets' / folder
    out.mkdir(exist_ok=True)
    paths = {}
    for key, value in values.items():
        data = base64.b64decode(value.split(',', 1)[-1])
        filename = hashlib.sha256(data).hexdigest()[:24] + extension
        (out / filename).write_bytes(data)
        paths[key] = 'assets/' + folder + '/' + filename
    js = js[:match.start(1)] + json.dumps(paths, ensure_ascii=False, separators=(',', ':')) + js[match.end(1):]
    print(name, len(paths), 'files')
js = js.replace('AU.src="data:audio/mpeg;base64,"+AUD[t]', 'AU.src=AUD[t]').replace('AU.preload="auto"', 'AU.preload="none"')
(root / 'app.js').write_text(js, encoding='utf-8')
page.write_text(html[:script.start()] + '<script src="app.js" defer></script>' + html[script.end():], encoding='utf-8')
print('index.html:', page.stat().st_size, 'bytes; app.js:', (root / 'app.js').stat().st_size, 'bytes')
