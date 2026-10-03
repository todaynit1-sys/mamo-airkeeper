"""Regenerate existing narration with a Korean voice; preserve caption keys."""
import asyncio
import hashlib
import json
import pathlib
import re
import subprocess
import shutil

import edge_tts

ROOT = pathlib.Path(__file__).resolve().parents[1]
CACHE = ROOT.parent / '.voice-build'
VOICE = 'ko-KR-SunHiNeural'

def spoken(text):
    text = text.replace('1/3', '삼 분의 일')
    text = re.sub(r'(\d+(?:\.\d+)?)\s*㎏/㎠', r'제곱센티미터당 \1 킬로그램', text)
    text = re.sub(r'(\d+(?:\.\d+)?)\s*kgf/㎠', r'제곱센티미터당 \1 킬로그램힘', text)
    text = re.sub(r'(\d+(?:\.\d+)?)\s*m/s', r'초속 \1 미터', text)
    text = re.sub(r'(\d+(?:\.\d+)?)\s*m\b', r'\1 미터', text)
    for unit, name in [('㎡', '제곱미터'), ('㎥', '세제곱미터'), ('㎝', '센티미터'), ('㎞', '킬로미터')]:
        text = text.replace(unit, ' ' + name)
    text = re.sub(r'제(\d+)(조|항|호)', r'제 \1 \2 ', text)
    text = text.replace('→', ', 다음은 ').replace('·', ', ').replace('/', ', ')
    text = re.sub(r'(\d+)~(\d+)', r'\1에서 \2', text)
    text = text.replace('(', ', ').replace(')', ', ').replace(':', ', ')
    return re.sub(r'\s+', ' ', text).strip(' ,')

async def main():
    path = ROOT / 'app.js'
    html = path.read_text(encoding='utf-8')
    match = re.search(r'var AUD=(.*?);\s*\n', html)
    old = json.loads(match.group(1))
    captions = json.loads(subprocess.check_output(['node', str(ROOT / 'tools/list-narration.cjs')], encoding='utf-8'))
    CACHE.mkdir(exist_ok=True)
    sem = asyncio.Semaphore(4)
    completed = 0

    async def make(text):
        nonlocal completed
        if text in old and (ROOT / old[text]).is_file():
            completed += 1
            return text, old[text]
        transcript = spoken(text)
        filename = hashlib.sha256((VOICE + '-3%' + transcript).encode()).hexdigest() + '.mp3'
        target = CACHE / filename
        async with sem:
            if not target.exists() or target.stat().st_size < 1000:
                for attempt in range(3):
                    try:
                        await edge_tts.Communicate(transcript, VOICE, rate='-3%').save(str(target))
                        if target.stat().st_size < 1000:
                            raise ValueError('Empty narration')
                        break
                    except Exception:
                        if attempt == 2:
                            raise
                        await asyncio.sleep(2 * (attempt + 1))
        completed += 1
        if completed % 20 == 0 or completed == len(captions):
            print(f'Generated {completed}/{len(captions)}', flush=True)
        output = ROOT / 'assets/audio' / (hashlib.sha256(target.read_bytes()).hexdigest()[:24] + '.mp3')
        output.parent.mkdir(exist_ok=True)
        shutil.copyfile(target, output)
        return text, output.relative_to(ROOT).as_posix()

    clips = dict(await asyncio.gather(*(make(text) for text in captions)))
    assert set(clips) == set(captions)
    html = html[:match.start(1)] + json.dumps(clips, ensure_ascii=False, separators=(',', ':')) + html[match.end(1):]
    path.write_text(html, encoding='utf-8')
    print(f'Updated {len(clips)} clips using {VOICE}', flush=True)

if __name__ == '__main__':
    asyncio.run(main())
