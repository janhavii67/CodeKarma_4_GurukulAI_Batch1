import os, requests, time

BASE = 'http://localhost:8000/api/v1'
TRAINEE = {'email': 'trainee@demo.local', 'password': 'Trainee@Gurukul2026!'}
WAV_DIR = 'test_audio_samples'
CSRF_HEADER = 'X-CSRF-Token'

s = requests.Session()
r = s.post(BASE + '/auth/login', json=TRAINEE)
r.raise_for_status()

files = sorted(os.listdir(WAV_DIR))
print('Running', len(files), 'test files\n')

for fn in files:
    path = os.path.join(WAV_DIR, fn)
    with open(path, 'rb') as f:
        data = f.read()
    csrf = s.get(BASE + '/auth/csrf').json()['csrf_token']
    resp = s.post(
        BASE + '/audio/analyze',
        data={},
        files={'file': (fn, data, 'audio/wav')},
        headers={CSRF_HEADER: csrf}
    )
    if resp.status_code not in (200, 201):
        print(fn, '-> ERROR', resp.status_code, resp.text[:80])
        continue
    j = resp.json()
    best = j.get('matched_reference') or {}
    score = best.get('similarity_score', 0) if best else 0
    title = (best.get('title') or 'No match')[:42]
    label = best.get('sound_label') or 'n/a'
    pct = round(score * 100, 1)
    status = 'PASS' if score >= 0.75 else 'LOW'
    print(fn[:44].ljust(46), title[:40].ljust(42), str(pct).rjust(6) + '%', label, status)
    time.sleep(0.15)

print('\nDone.')
