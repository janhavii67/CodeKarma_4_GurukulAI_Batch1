import requests, time

BASE = 'http://localhost:8000/api/v1'
EA = {'email': 'expert.a@demo.local', 'password': 'ExpertA@Gurukul2026!'}
EB = {'email': 'expert.b@demo.local', 'password': 'ExpertB@Gurukul2026!'}
H = 'X-CSRF-Token'

with open('seed_100_medical.py', 'r', encoding='utf-8') as f:
    content = f.read()

idx = content.find('def sess(account):')
if idx == -1:
    print('Error: def sess not found')
    exit(1)

new_tail = '''def sess(account):
    for attempt in range(5):
        try:
            s = requests.Session()
            r = s.post(BASE + '/auth/login', json=account, timeout=10)
            r.raise_for_status()
            return s
        except Exception:
            if attempt == 4:
                raise
            time.sleep(1.0 * (attempt + 1))

_sa = None
_sb = None

def get_sa(force_refresh=False):
    global _sa
    if _sa is None or force_refresh:
        _sa = sess(EA)
    return _sa

def get_sb(force_refresh=False):
    global _sb
    if _sb is None or force_refresh:
        _sb = sess(EB)
    return _sb

def csrf(s):
    return s.get(BASE + '/auth/csrf', timeout=10).json()['csrf_token']

def get_vid(s):
    r = s.get(BASE + '/knowledge?status=published&page_size=5', timeout=10)
    items = [i for i in r.json().get('items', []) if i.get('version_status') == 'published']
    if items:
        print(f"  Source: {items[0]['title'][:60]}")
        return items[0]['version_id']
    raise RuntimeError('No published knowledge source found.')

def seed(entry, vid, existing_titles):
    if entry['title'] in existing_titles:
        return 'SKIP'

    try:
        audio = entry['fn']()
    except Exception as e:
        print(f'  x Audio gen: {e}')
        return False

    form = {
        k: v for k, v in {
            'title': entry['title'],
            'interpretation': entry['interp'],
            'source_version_ids': vid,
            'manufacturer': entry.get('mfr', ''),
            'model_name': entry.get('mdl', ''),
            'component': entry.get('cmp', ''),
            'operation': entry.get('op', ''),
            'operating_conditions': entry.get('oc', ''),
            'sound_label': entry.get('lbl', ''),
            'annotation_notes': entry.get('note', ''),
            'machine_id': MACHINES.get(entry['m'], '')
        }.items() if v
    }

    for attempt in range(3):
        try:
            sa = get_sa(force_refresh=(attempt > 0))
            sb = get_sb(force_refresh=(attempt > 0))

            r = sa.post(
                BASE + '/audio/references',
                data=form,
                files={'file': (entry['title'][:25] + '.wav', audio, 'audio/wav')},
                headers={H: csrf(sa)},
                timeout=25
            )
            if r.status_code not in (200, 201):
                msg = r.json().get('error', {}).get('message', r.text[:100]) if 'json' in r.headers.get('content-type', '') else r.text[:100]
                print(f'  x Create ({r.status_code}): {msg}')
                if attempt == 2: return False
                time.sleep(1)
                continue

            data = r.json()
            ref_id = data['id']
            item_id = data['knowledge_item_id']

            sub = sa.post(BASE + f'/audio/references/{ref_id}/submit', headers={H: csrf(sa)}, timeout=15)
            if sub.status_code not in (200, 201):
                print(f'  x Submit ({sub.status_code})')
                if attempt == 2: return False
                time.sleep(1)
                continue

            time.sleep(0.1)
            app = sb.post(
                BASE + f'/reviews/{item_id}/decision',
                json={'decision': 'APPROVED', 'comments': 'Approved.'},
                headers={H: csrf(sb)},
                timeout=15
            )
            if app.status_code not in (200, 201):
                print(f'  x Approve ({app.status_code})')
                if attempt == 2: return False
                time.sleep(1)
                continue

            existing_titles.add(entry['title'])
            return True
        except (requests.exceptions.ConnectionError, requests.exceptions.Timeout) as conn_err:
            print(f'  ! Connection retry {attempt + 1}: {conn_err}')
            time.sleep(1.5 * (attempt + 1))
        except Exception as ex:
            print(f'  x Unexpected: {ex}')
            if attempt == 2: return False
            time.sleep(1)

    return False

if __name__ == '__main__':
    from app.db.session import SessionLocal
    from app.models.audio import AudioReference

    db = SessionLocal()
    existing_titles = set(
        r[0] for r in db.query(AudioReference.title).filter(AudioReference.status == 'published').all()
    )
    db.close()

    print('=' * 70)
    print(f'  Seeding 100 medical equipment audio references')
    print('  Machines: X-Ray | CT Scan | MRI | ECG  (25 each)')
    print(f'  Already published in DB: {len(existing_titles)}')
    print('=' * 70)

    sa = get_sa()
    vid = get_vid(sa)
    ok = 0
    skipped = 0
    fail = 0
    prev_m = ''

    for i, entry in enumerate(REFS):
        m = entry['m']
        if m != prev_m:
            print(f'\\n--- {m.upper()} ---')
            prev_m = m

        res = seed(entry, vid, existing_titles)
        if res == 'SKIP':
            st = 'SKIP'
            skipped += 1
        elif res:
            st = 'OK  '
            ok += 1
        else:
            st = 'FAIL'
            fail += 1

        print(f'  [{i+1:3d}] {st}  [{entry["lbl"]}] {entry["title"][:55]}')
        time.sleep(0.05)

    print(f'\\n{"=" * 70}')
    print(f'  Done: {ok} new published  |  {skipped} skipped (already present)  |  {fail} failed')
    print('  View: http://localhost:5174/app/sound-analysis')
    print('=' * 70)
'''

with open('seed_100_medical.py', 'w', encoding='utf-8') as f:
    f.write(content[:idx] + new_tail)

print('Updated seed_100_medical.py successfully!')
