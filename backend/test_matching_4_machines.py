import os, io, requests, numpy as np, soundfile as sf

BASE = 'http://localhost:8000/api/v1'
EA = {'email': 'expert.a@demo.local', 'password': 'ExpertA@Gurukul2026!'}
H = 'X-CSRF-Token'
SR = 16000
OUT_DIR = os.path.join(os.path.dirname(__file__), 'test_audio_samples')
os.makedirs(OUT_DIR, exist_ok=True)

def t(d=2.0): return np.arange(int(d*SR), dtype=np.float32) / SR
def si(f, a=0.35, d=2.0): return a * np.sin(2 * np.pi * f * t(d))
def ha(f0, n=5, d=2.0, dk=0.6):
    tv = t(d)
    s = sum((dk**(k-1)) * np.sin(2 * np.pi * f0 * k * tv) for k in range(1, n+1))
    return (s / max(float(np.abs(s).max()), 1e-6) * 0.35).astype(np.float32)
def nz(a=0.08, d=2.0, sd=0): return (np.random.default_rng(sd).standard_normal(int(d*SR)) * a).astype(np.float32)
def ck(r, d=2.0, a=0.40):
    s = np.zeros(int(d*SR), dtype=np.float32); p = int(SR/r)
    for i in range(0, len(s), p): s[i:i+6] = a
    return s
def am(fc, fm, a=0.35, d=2.0):
    tv = t(d); return (0.5 * (1 + np.sin(2 * np.pi * fm * tv)) * a * np.sin(2 * np.pi * fc * tv)).astype(np.float32)

def to_wav(s, filename):
    buf = io.BytesIO()
    sf.write(buf, np.clip(s, -0.9, 0.9), SR, format='WAV', subtype='PCM_16')
    raw = buf.getvalue()
    path = os.path.join(OUT_DIR, filename)
    with open(path, 'wb') as f:
        f.write(raw)
    return raw, path

# Define realistic test audio with slight environmental noise
TEST_CASES = [
    # X-Ray
    ('test_xray_normal_warmup.wav', ha(150, n=4) + nz(0.04, sd=201), 'e13400d3-faab-48bc-811a-6a30c78a0b76', 'X-Ray Warm-Up Hum'),
    ('test_xray_overload_alarm.wav', am(800, 2.0) + nz(0.03, sd=202), 'e13400d3-faab-48bc-811a-6a30c78a0b76', 'X-Ray Tube Overload Alarm'),
    ('test_xray_anode_vibration.wav', ha(180, n=4, dk=0.82) + nz(0.08, sd=203), 'e13400d3-faab-48bc-811a-6a30c78a0b76', 'X-Ray Anode Bearing Vibration'),
    # CT Scan
    ('test_ct_gantry_low_speed.wav', ha(120, n=4, dk=0.65) + nz(0.05, sd=204), '4a49fee7-d54b-4898-b653-2e7f8f6d91bc', 'CT Gantry Low Speed'),
    ('test_ct_emergency_alarm.wav', am(1200, 3.0, a=0.45) + nz(0.02, sd=205), '4a49fee7-d54b-4898-b653-2e7f8f6d91bc', 'CT Emergency Stop Alarm'),
    ('test_ct_bearing_vibration.wav', ha(95, n=5, dk=0.85) + nz(0.09, sd=206), '4a49fee7-d54b-4898-b653-2e7f8f6d91bc', 'CT Gantry Bearing Vibration'),
    # MRI
    ('test_mri_normal_t2_gradient.wav', ck(4.0, d=2.0, a=0.44) + ha(600, n=2, dk=0.40) + nz(0.05, sd=207), '2c615e42-6e10-419c-826d-8835812eca18', 'MRI T2 Gradient Banging'),
    ('test_mri_quench_alarm.wav', am(1100, 4.0, a=0.45) + nz(0.04, sd=208), '2c615e42-6e10-419c-826d-8835812eca18', 'MRI Magnet Quench Alert'),
    ('test_mri_cryocooler_hum.wav', am(80, 1.4) + nz(0.05, sd=209), '2c615e42-6e10-419c-826d-8835812eca18', 'MRI Cryocooler Normal'),
    # ECG
    ('test_ecg_qrs_beep.wav', ck(1.0, d=2.0, a=0.35) + si(1000, a=0.20) + nz(0.02, sd=210), '6baa63bc-044a-45fe-afcd-69c67a80f224', 'ECG Sinus Rhythm Beep'),
    ('test_ecg_vfib_alarm.wav', am(1000, 5.0, a=0.42) + nz(0.03, sd=211), '6baa63bc-044a-45fe-afcd-69c67a80f224', 'ECG VF Alarm'),
    ('test_ecg_printer_slip.wav', ck(6.0, d=2.0, a=0.38) + nz(0.06, sd=212), '6baa63bc-044a-45fe-afcd-69c67a80f224', 'ECG Thermal Printer Slip'),
]

session = requests.Session()
session.post(BASE + '/auth/login', json=EA).raise_for_status()
csrf_token = session.get(BASE + '/auth/csrf').json()['csrf_token']

print('=' * 75)
print('  Generating Test Audio Samples and Testing Machine Sound Matching')
print('=' * 75)

for fname, signal, machine_id, desc in TEST_CASES:
    raw, full_path = to_wav(signal, fname)
    
    # Run analysis through API
    files = {'file': (fname, raw, 'audio/wav')}
    data = {'machine_id': machine_id}
    res = session.post(
        BASE + '/audio/analyze',
        data=data,
        files=files,
        headers={H: csrf_token}
    )
    
    if res.status_code == 200:
        result = res.json()
        status = result.get('status')
        score = result.get('similarity_score', 0)
        matched_title = result.get('matched_reference', {}).get('title', 'None')
        pct = f'{score*100:.1f}%' if score else 'N/A'
        print(f'  [MATCH {status:10s}] {desc:32s} -> {pct:>6} | Best: {matched_title[:35]}')
    else:
        print(f'  [ERROR {res.status_code}] {desc}: {res.text[:80]}')

print('=' * 75)
print(f'All test files saved in: {OUT_DIR}')
