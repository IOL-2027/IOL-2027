#!/usr/bin/env python3
"""Pre-render the Useful Thai phrase audio with Gemini TTS.

The phrase list is fixed, so the audio is generated once and shipped as static
MP3 files. Visitors never call an API and never download a speech model.

For every phrase form in src/thaiPhrases.json this script makes two clips,
normal speed and slow, and writes them to public/audio/thai/<slug>.mp3 and
<slug>-slow.mp3. Each clip is then transcribed back with a Gemini model and
compared with the Thai text it was meant to say, so a clip that says the wrong
thing is reported instead of quietly shipped. A Thai speaker should still
listen before release: a transcript match does not prove the tones are right.

Usage
  python scripts/generate-thai-audio.py                  generate missing clips
  python scripts/generate-thai-audio.py --force          regenerate every clip
  python scripts/generate-thai-audio.py --only hello-khrap,help
  python scripts/generate-thai-audio.py --male Iapetus --female Sulafat
  python scripts/generate-thai-audio.py --audition       sample several voices into tmp/voice-audition/

Requirements: GEMINI_API_KEY in .env, ffmpeg on PATH. Standard library only.
"""

import argparse
import base64
import difflib
import html
import json
import re
import shutil
import subprocess
import sys
import time
import unicodedata
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PHRASES = ROOT / 'src' / 'thaiPhrases.json'
OUT_DIR = ROOT / 'public' / 'audio' / 'thai'
REPORT = ROOT / 'tmp' / 'thai-audio-report.json'
AUDITION_DIR = ROOT / 'tmp' / 'voice-audition'

API = 'https://generativelanguage.googleapis.com/v1beta'
TTS_MODEL = 'gemini-3.8-flash-tts'
CHECK_MODEL = 'gemini-3.8-flash'

DEFAULT_VOICES = {'male': 'Charon', 'female': 'Kore'}
AUDITION_VOICES = {
    'male': ['Charon', 'Iapetus', 'Achird', 'Algieba', 'Orus'],
    'female': ['Kore', 'Sulafat', 'Despina', 'Vindemiatrix', 'Aoede'],
}
AUDITION_TEXT = {
    'male': 'สวัสดีครับ ยินดีต้อนรับสู่ประเทศไทย',
    'female': 'สวัสดีค่ะ ยินดีต้อนรับสู่ประเทศไทย',
}

STYLES = {
    'normal': 'warm, clear and natural, like a friendly Thai host welcoming a visitor, at a relaxed everyday pace',
    'slow': 'speaking slowly and clearly, like a patient Thai teacher helping a beginner, keeping natural Thai tones',
}

# ffmpeg chain: trim silence at both ends, keep a short tail, even out loudness across clips.
AUDIO_FILTER = ','.join([
    'silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.05',
    'areverse',
    'silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.05',
    'areverse',
    'apad=pad_dur=0.12',
    'loudnorm=I=-18:TP=-2:LRA=11',
])


def load_key():
    env = ROOT / '.env'
    if not env.exists():
        sys.exit('No .env file. Create one with GEMINI_API_KEY=<your key>.')
    match = re.search(r'^GEMINI_API_KEY=(.*)$', env.read_text(encoding='utf-8'), re.M)
    key = match.group(1).strip().strip('"').strip("'") if match else ''
    if not key:
        sys.exit('GEMINI_API_KEY is empty in .env.')
    return key


def post_json(url, body, key, attempts=6):
    data = json.dumps(body).encode('utf-8')
    for attempt in range(attempts):
        request = urllib.request.Request(url, data=data, method='POST', headers={
            'x-goog-api-key': key,
            'Content-Type': 'application/json',
        })
        try:
            with urllib.request.urlopen(request, timeout=120) as response:
                return json.load(response)
        except urllib.error.HTTPError as error:
            detail = error.read().decode('utf-8', 'replace')[:400]
            if error.code in (429, 500, 502, 503, 504) and attempt < attempts - 1:
                wait = int(error.headers.get('Retry-After') or 0) or min(60, 4 * 2 ** attempt)
                print(f'    HTTP {error.code}, retrying in {wait}s')
                time.sleep(wait)
                continue
            sys.exit(f'HTTP {error.code} from {url}\n{detail}')
        except urllib.error.URLError as error:
            if attempt < attempts - 1:
                time.sleep(min(30, 3 * 2 ** attempt))
                continue
            sys.exit(f'Network error calling {url}: {error}')
    sys.exit(f'Gave up calling {url}')


def synthesise(text, voice, style, key):
    """Return WAV bytes. Gemini 3.8 TTS reads `text` verbatim; delivery goes in speech_metadata."""
    response = post_json(f'{API}/interactions', {
        'model': TTS_MODEL,
        'input': [{
            'type': 'user_input',
            'content': [{
                'type': 'text',
                'text': text,
                'annotations': [{'type': 'speech_metadata', 'style': style}],
            }],
        }],
        'response_format': {'type': 'audio'},
        'generation_config': {'speech_config': [{'voice': voice}]},
    }, key)
    audio = [
        part for step in response.get('steps', []) if step.get('type') == 'model_output'
        for part in step.get('content', []) if part.get('type') == 'audio'
    ]
    if not audio:
        sys.exit(f'No audio in TTS response for {text!r}: {json.dumps(response)[:400]}')
    return base64.b64decode(audio[-1]['data'])


def transcribe(wav, key):
    response = post_json(f'{API}/models/{CHECK_MODEL}:generateContent', {
        'contents': [{'parts': [
            {'inline_data': {'mime_type': 'audio/wav', 'data': base64.b64encode(wav).decode('ascii')}},
            {'text': 'Transcribe this Thai speech exactly as spoken, in Thai script. '
                     'Output only the transcript, with no translation, romanisation or commentary.'},
        ]}],
        'generationConfig': {'temperature': 0},
    }, key)
    parts = response.get('candidates', [{}])[0].get('content', {}).get('parts', [])
    return ''.join(part.get('text', '') for part in parts if not part.get('thought')).strip()


def normalise(text):
    """Compare Thai text without spaces, punctuation or invisible characters."""
    text = unicodedata.normalize('NFC', text)
    return ''.join(ch for ch in text if unicodedata.category(ch)[0] in ('L', 'M', 'N'))


def to_mp3(wav, destination):
    destination.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        ['ffmpeg', '-y', '-loglevel', 'error', '-i', 'pipe:0', '-af', AUDIO_FILTER,
         '-ar', '24000', '-ac', '1', '-codec:a', 'libmp3lame', '-b:a', '64k', str(destination)],
        input=wav, check=True,
    )


def clip_seconds(path):
    result = subprocess.run(
        ['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', str(path)],
        capture_output=True, text=True, check=True,
    )
    return float(result.stdout.strip() or 0)


def check(expected, wav, key):
    heard = transcribe(wav, key)
    a, b = normalise(expected), normalise(heard)
    return {'heard': heard, 'match': a == b, 'similarity': round(difflib.SequenceMatcher(None, a, b).ratio(), 3)}


def generate(args, key):
    phrases = json.loads(PHRASES.read_text(encoding='utf-8'))
    voices = {'male': args.male, 'female': args.female}
    only = set(filter(None, (args.only or '').split(',')))
    report = json.loads(REPORT.read_text(encoding='utf-8')) if REPORT.exists() else {}
    jobs = [(form, speed) for phrase in phrases for form in phrase['forms'] for speed in ('normal', 'slow')
            if not only or form['audio'] in only]
    print(f'{len(jobs)} clips · voices: male {voices["male"]}, female {voices["female"]} · model {TTS_MODEL}')

    for form, speed in jobs:
        name = form['audio'] + ('-slow' if speed == 'slow' else '')
        destination = OUT_DIR / f'{name}.mp3'
        if destination.exists() and not args.force:
            print(f'  skip   {name} (exists)')
            continue
        voice = voices[form['voice']]
        wav = synthesise(form['speech'], voice, STYLES[speed], key)
        to_mp3(wav, destination)
        result = check(form['speech'], wav, key)
        report[name] = {'text': form['speech'], 'voice': voice, 'speed': speed,
                        'seconds': round(clip_seconds(destination), 2), **result}
        flag = 'ok   ' if result['match'] else 'CHECK'
        print(f'  {flag}  {name:24} {report[name]["seconds"]:>5}s  {voice:10} heard: {result["heard"]}')
        REPORT.parent.mkdir(parents=True, exist_ok=True)
        REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
        time.sleep(args.pause)

    flagged = [name for name, item in report.items() if not item['match']]
    print(f'\nReport: {REPORT.relative_to(ROOT)}')
    print('All transcripts match the intended text.' if not flagged else
          f'{len(flagged)} clip(s) to listen to: {", ".join(flagged)}')


def audition(args, key):
    AUDITION_DIR.mkdir(parents=True, exist_ok=True)
    rows = []
    for gender, names in AUDITION_VOICES.items():
        for voice in names:
            text = AUDITION_TEXT[gender]
            wav = synthesise(text, voice, STYLES['normal'], key)
            to_mp3(wav, AUDITION_DIR / f'{gender}-{voice}.mp3')
            result = check(text, wav, key)
            rows.append((gender, voice, text, result))
            print(f'  {"ok   " if result["match"] else "CHECK"}  {gender:6} {voice:12} heard: {result["heard"]}')
            time.sleep(args.pause)
    cells = ''.join(
        f'<tr><td>{g}</td><td><strong>{v}</strong></td><td><audio controls preload="none" src="{g}-{v}.mp3"></audio></td>'
        f'<td>{html.escape(r["heard"])}</td><td>{"match" if r["match"] else "differs"}</td></tr>'
        for g, v, _, r in rows)
    (AUDITION_DIR / 'index.html').write_text(
        '<!doctype html><meta charset="utf-8"><title>Thai voice audition</title>'
        '<style>body{font:16px system-ui;margin:40px}td{padding:8px 14px;border-bottom:1px solid #ddd}</style>'
        '<h1>Thai voice audition</h1><p>Pick one male and one female voice, then run '
        '<code>python scripts/generate-thai-audio.py --force --male NAME --female NAME</code></p>'
        f'<table><tr><th>Voice</th><th>Name</th><th>Listen</th><th>Transcribed back as</th><th></th></tr>{cells}</table>',
        encoding='utf-8')
    print(f'\nOpen {AUDITION_DIR.relative_to(ROOT) / "index.html"} in a browser to listen.')


def main():
    # Windows consoles default to a code page that cannot print Thai transcripts.
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--force', action='store_true', help='regenerate clips that already exist')
    parser.add_argument('--only', help='comma-separated audio slugs to generate')
    parser.add_argument('--male', default=DEFAULT_VOICES['male'], help='voice for ครับ forms')
    parser.add_argument('--female', default=DEFAULT_VOICES['female'], help='voice for ค่ะ forms and neutral phrases')
    parser.add_argument('--pause', type=float, default=1.0, help='seconds to wait between clips')
    parser.add_argument('--audition', action='store_true', help='sample several voices instead of generating')
    args = parser.parse_args()
    for tool in ('ffmpeg', 'ffprobe'):
        if not shutil.which(tool):
            sys.exit(f'{tool} not found on PATH.')
    key = load_key()
    audition(args, key) if args.audition else generate(args, key)


if __name__ == '__main__':
    main()
