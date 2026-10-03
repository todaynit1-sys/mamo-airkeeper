"""Regenerate cache version after changes to product files."""
from pathlib import Path
import hashlib
import json
import re

root=Path(__file__).resolve().parents[1]
urls=['index.html','core.js','app.js','manifest.webmanifest','assets/icon-192.png','assets/icon-512.png','assets/law-byl14.pdf']
photos=json.loads(re.search(r'^var PH=(.*);$',(root/'app.js').read_text(encoding='utf-8'),re.M)[1])
urls+=sorted(photos[key] for key in ['l1','l2','w1','w2','w3','edu_shoot'])
digest=hashlib.sha256(b''.join((root/u).read_bytes() for u in urls)).hexdigest()[:16]
(root/'precache.js').write_text('self.PRECACHE_VERSION='+json.dumps(digest)+';\nself.PRECACHE_URLS='+json.dumps(urls,separators=(',',':'))+';\n',encoding='utf-8')
print('Cache version',digest,'with',len(urls),'resources')
