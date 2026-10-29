"""
seed_audio_references.py - seeds 15 labelled audio references.
Run from backend directory with venv active and server running on :8000
    python seed_audio_references.py
"""
from __future__ import annotations
import io, sys, time
import numpy as np
import requests
import soundfile as sf

BASE_URL = "http://localhost:8000/api/v1"
EXPERT_A = {"email": "expert.a@demo.local", "password": "ExpertA@Gurukul2026!"}
EXPERT_B = {"email": "expert.b@demo.local", "password": "ExpertB@Gurukul2026!"}
CSRF_HEADER = "X-CSRF-Token"
SR = 16_000

def _wav(s):
    buf = io.BytesIO()
    sf.write(buf, np.clip(s,-0.9,0.9), SR, format="WAV", subtype="PCM_16")
    return buf.getvalue()

def _t(d=2.5): return np.arange(int(d*SR), dtype=np.float32)/SR
def sine(f,a=0.38,d=2.5): return a*np.sin(2*np.pi*f*_t(d))
def harmonics(f0,n=5,d=2.5,dk=0.6):
    t=_t(d); s=sum((dk**(k-1))*np.sin(2*np.pi*f0*k*t) for k in range(1,n+1))
    mx=max(abs(s).max(),1e-6); return (s/mx*0.38).astype(np.float32)
def noise(a=0.10,d=2.5,seed=0):
    return (np.random.default_rng(seed).standard_normal(int(d*SR))*a).astype(np.float32)
def clicks(rate,d=2.5,a=0.45):
    s=np.zeros(int(d*SR),dtype=np.float32); p=int(SR/rate)
    for i in range(0,len(s),p): s[i:i+8]=a
    return s
def am(fc,fm,d=2.5):
    t=_t(d); return (0.5*(1+np.sin(2*np.pi*fm*t))*0.40*np.sin(2*np.pi*fc*t)).astype(np.float32)

REFS = [
    dict(title="Infusion Pump - Normal Operation Hum",sound_label="normal_operation",
         manufacturer="MedTech Systems",model_name="InfuDrive 3000",
         component="Peristaltic Drive Motor",operation="Continuous infusion at 50 mL/h",
         operating_conditions="AC mains, ambient 22 C",
         interpretation="Steady 120 Hz motor hum with low-level harmonics. Expected baseline sound under normal infusion. No intervention required.",
         annotation_notes="Recorded at patient bedside. Motor serviced within last 6 months.",
         audio_fn=lambda: _wav(harmonics(120,n=4)+noise(0.02,seed=1))),
    dict(title="Ventilator - Steady Flow No Alarm",sound_label="normal_operation",
         manufacturer="PulmoAir",model_name="PA-500 ICU Ventilator",
         component="Turbine Blower",operation="CMV mode 14 breaths/min FiO2 0.40",
         operating_conditions="Battery backup active, filter clean",
         interpretation="Regular rhythmic airflow at 0.23 Hz breath cycle with 350 Hz turbine whir. Consistent with normal CMV ventilation.",
         annotation_notes="Captured mid-cycle. Exhalation valve functioning correctly.",
         audio_fn=lambda: _wav(am(350,0.23)+noise(0.03,seed=2))),
    dict(title="Centrifuge - Balanced Rotor Steady State",sound_label="normal_operation",
         manufacturer="LabSpin",model_name="MicroCen 12000",
         component="Rotor Drive",operation="12000 RPM balanced load",
         operating_conditions="Lid locked, no imbalance",
         interpretation="Steady 200 Hz tone with smooth harmonic decay. Characteristic of balanced rotor at full speed. Any deviation warrants inspection.",
         annotation_notes="Recorded post-calibration. Compare at identical RPM.",
         audio_fn=lambda: _wav(harmonics(200,n=6,dk=0.5)+noise(0.015,seed=3))),
    dict(title="Infusion Pump - Occlusion Alarm",sound_label="alarm",
         manufacturer="MedTech Systems",model_name="InfuDrive 3000",
         component="Occlusion Sensor",operation="Occlusion downstream detected",
         operating_conditions="Pump halted automatically",
         interpretation="Repeating 880 Hz dual-beep at 1 Hz. Downstream occlusion. Stop infusion, check tubing and IV line before restarting.",
         annotation_notes="Verified by crimping line. Contact supervisor immediately.",
         audio_fn=lambda: _wav(am(880,1.0)+noise(0.01,seed=4))),
    dict(title="Patient Monitor - SpO2 Low Alarm",sound_label="alarm",
         manufacturer="BioSign",model_name="VitalPro 800",
         component="Alarm Speaker",operation="SpO2 below 90 percent",
         operating_conditions="Continuous monitoring mode",
         interpretation="Escalating 1000/1200/1400 Hz beep every 2 s. Urgent low oxygen saturation alarm. Assess patient airway immediately.",
         annotation_notes="Do not silence without clinician acknowledgment.",
         audio_fn=lambda: _wav(sine(1000,a=0.22)+sine(1200,a=0.18)+sine(1400,a=0.14)+noise(0.01,seed=5))),
    dict(title="Centrifuge - Imbalanced Rotor Vibration",sound_label="abnormal_vibration",
         manufacturer="LabSpin",model_name="MicroCen 12000",
         component="Rotor Bearing",operation="Imbalanced load at 8000 RPM",
         operating_conditions="Unequal tube loading",
         interpretation="40 Hz whole-body vibration with 133 Hz sub-harmonic rattling. Stop immediately and re-balance the rotor before running again.",
         annotation_notes="Intentional imbalance test. Immediate stop required.",
         audio_fn=lambda: _wav(harmonics(133,n=3,dk=0.8)+sine(40,a=0.25)+noise(0.06,seed=6))),
    dict(title="Ultrasound Unit - Cooling Fan Bearing Wear",sound_label="abnormal_vibration",
         manufacturer="SonoTech",model_name="SonoView 400",
         component="Cooling Fan Bearing",operation="Probe scanning B-mode",
         operating_conditions="Warm after 60 min continuous use",
         interpretation="55 Hz rumble overlaid on fan whir peaking after warm-up. Ball-bearing degradation. Schedule preventive maintenance within 30 days.",
         annotation_notes="Noise intensifies after 60 min. Fan bearing replacement recommended.",
         audio_fn=lambda: _wav(sine(55,a=0.20)+harmonics(260,n=3,dk=0.7)+noise(0.05,seed=7))),
    dict(title="Autoclave - Steam Leak Hiss",sound_label="unusual_noise",
         manufacturer="SteraTech",model_name="AutoSter 2100",
         component="Door Gasket",operation="Sterilisation cycle at 134 C",
         operating_conditions="Cycle paused unexpectedly",
         interpretation="Broadband hissing 1-4 kHz consistent with steam escaping from door gasket. Do not open. Stop cycle, vent safely, inspect gasket.",
         annotation_notes="Gasket replaced after fault confirmed.",
         audio_fn=lambda: _wav(noise(0.35,seed=8)+noise(0.10,seed=9))),
    dict(title="IV Pump - Cracked Tubing Squeal",sound_label="unusual_noise",
         manufacturer="MedTech Systems",model_name="InfuDrive 3000",
         component="Peristaltic Tube Segment",operation="Infusion at 125 mL/h",
         operating_conditions="Tubing showing micro-cracks at bend",
         interpretation="High-pitched intermittent 3200 Hz squeal at each compression. Replace tubing immediately. Cracked tubing risks air entrainment.",
         annotation_notes="Squeal occurs once per compression cycle approx 1.2 s.",
         audio_fn=lambda: _wav(am(3200,0.8)*0.4+noise(0.05,seed=10))),
    dict(title="Syringe Pump - Motor Step Skip",sound_label="pump_irregularity",
         manufacturer="FlowPrecision",model_name="SyriDrive 5",
         component="Stepper Motor",operation="Slow infusion 5 mL/h",
         operating_conditions="Battery below 15 percent",
         interpretation="Irregular 4 Hz click pattern with missing steps. Stepper skipping under low battery. Charge battery and verify delivered volume before patient use.",
         annotation_notes="Clicks become irregular below 15 percent battery.",
         audio_fn=lambda: _wav(clicks(4.0,a=0.35)+noise(0.04,seed=11))),
    dict(title="Peristaltic Pump - Air Bubble in Line",sound_label="pump_irregularity",
         manufacturer="MedTech Systems",model_name="InfuDrive 3000",
         component="Peristaltic Chamber",operation="Enteral feeding at 80 mL/h",
         operating_conditions="Air bubble in feed line",
         interpretation="Intermittent soft thud every 0.8 s when air pocket is compressed. Prime the line. Verify air-bubble-detection alarm is armed.",
         annotation_notes="Sound disappears after priming.",
         audio_fn=lambda: _wav(am(180,1.25)*0.5+noise(0.03,seed=12))),
    dict(title="Anaesthesia Machine - Blocked Ventilation Filter",sound_label="fan_noise",
         manufacturer="AnaesFlow",model_name="AF-1000",
         component="Internal Ventilation Fan",operation="Standby with blocked filter",
         operating_conditions="Filter not replaced for 6 months",
         interpretation="380 Hz fan tone 8 dB above baseline with 95 Hz turbulent flutter. Blocked filter overloads the fan. Replace ventilation filter immediately.",
         annotation_notes="Returns to baseline after filter replacement.",
         audio_fn=lambda: _wav(harmonics(380,n=3,dk=0.6)+sine(95,a=0.18)+noise(0.04,seed=13))),
    dict(title="Centrifuge - Over-Speed Setting Whine",sound_label="incorrect_setting",
         manufacturer="LabSpin",model_name="MicroCen 12000",
         component="Rotor Drive",operation="Set to 15000 RPM rotor max 12000",
         operating_conditions="Incorrect rotor/speed combination",
         interpretation="250 Hz mechanical whine with stress harmonics at 500 and 750 Hz. Over-speed for this rotor. Stop immediately and re-enter correct speed.",
         annotation_notes="Never exceed the rotor rated max RPM.",
         audio_fn=lambda: _wav(harmonics(250,n=4,dk=0.55)+noise(0.03,seed=14))),
    dict(title="Ventilator - Turbine Blade Chip Confirmed Fault",sound_label="verified_fault",
         manufacturer="PulmoAir",model_name="PA-500 ICU Ventilator",
         component="Turbine Blade",operation="CMV mode fault investigation",
         operating_conditions="Chipped blade confirmed by inspection",
         interpretation="Periodic 600 Hz impact knock at 7 Hz blade-pass frequency. Do not use on patients until turbine assembly is replaced.",
         annotation_notes="Fault confirmed by biomedical engineer. Unit removed from service.",
         audio_fn=lambda: _wav(clicks(7.0,a=0.30)+harmonics(600,n=2,dk=0.4)+noise(0.04,seed=15))),
    dict(title="Infusion Pump - Gearbox Stripped Tooth Confirmed Fault",sound_label="verified_fault",
         manufacturer="MedTech Systems",model_name="InfuDrive 3000",
         component="Drive Gearbox",operation="Infusion halted by fault",
         operating_conditions="Stripped gear tooth detected",
         interpretation="9 Hz irregular impact clatter with broadband noise burst. Gearbox failure. Tag out of service and notify biomedical engineering.",
         annotation_notes="Gearbox replaced under warranty.",
         audio_fn=lambda: _wav(clicks(9.0,a=0.45)+noise(0.12,seed=16))),
]

# -- HTTP helpers using ONE persistent session with fresh CSRF per call ---------

def make_session():
    return requests.Session()

def login_session(s, account):
    r = s.post(f"{BASE_URL}/auth/login", json=account)
    r.raise_for_status()
    return s

def fresh_csrf(s):
    r = s.get(f"{BASE_URL}/auth/csrf")
    r.raise_for_status()
    return r.json()["csrf_token"]

def get_source_version_id(s):
    csrf = fresh_csrf(s)
    r = s.get(f"{BASE_URL}/knowledge?status=published&page_size=10",
              headers={CSRF_HEADER: csrf})
    r.raise_for_status()
    items = [i for i in r.json().get("items",[]) if i.get("version_status")=="published"]
    if items:
        print(f"  Using: {items[0]['title']!r}")
        return items[0]["version_id"]
    raise RuntimeError("No published knowledge source found. Create and publish one first.")

def seed_one(entry, vid):
    # Create fresh session for Expert A for this entry
    sa = make_session()
    login_session(sa, EXPERT_A)
    csrf_a = fresh_csrf(sa)

    title = entry["title"]
    print(f"\n  [{entry['sound_label'].upper()}] {title}")

    try: audio = entry["audio_fn"]()
    except Exception as e:
        print(f"    x Audio gen failed: {e}"); return False

    form = {k: v for k,v in {
        "title": title,
        "interpretation": entry["interpretation"],
        "source_version_ids": vid,
        "manufacturer": entry.get("manufacturer",""),
        "model_name": entry.get("model_name",""),
        "component": entry.get("component",""),
        "operation": entry.get("operation",""),
        "operating_conditions": entry.get("operating_conditions",""),
        "sound_label": entry.get("sound_label",""),
        "annotation_notes": entry.get("annotation_notes",""),
    }.items() if v}

    r = sa.post(f"{BASE_URL}/audio/references",
                data=form,
                files={"file": (f"{title[:28]}.wav", audio, "audio/wav")},
                headers={CSRF_HEADER: csrf_a})
    if r.status_code not in (200,201):
        msg = r.json().get("error",{}).get("message", r.text[:140]) if r.headers.get("content-type","").startswith("application/json") else r.text[:140]
        print(f"    x Create failed ({r.status_code}): {msg}"); return False
    ref_id = r.json()["id"]; item_id = r.json()["knowledge_item_id"]
    print(f"    + Draft  ref={ref_id[:8]}  item={item_id[:8]}")

    csrf_a2 = fresh_csrf(sa)
    sub = sa.post(f"{BASE_URL}/audio/references/{ref_id}/submit",
                  headers={CSRF_HEADER: csrf_a2})
    if sub.status_code not in (200,201):
        print(f"    x Submit failed ({sub.status_code}): {sub.text[:140]}"); return False
    print(f"    + Submitted for review")

    time.sleep(0.3)
    sb = make_session()
    login_session(sb, EXPERT_B)
    csrf_b = fresh_csrf(sb)
    app = sb.post(f"{BASE_URL}/reviews/{item_id}/decision",
                  json={"decision":"APPROVED","comments":"Approved as labelled audio reference."},
                  headers={CSRF_HEADER: csrf_b})
    if app.status_code not in (200,201):
        print(f"    x Approve failed ({app.status_code}): {app.text[:140]}"); return False
    print(f"    + PUBLISHED")
    return True

def main():
    print("="*65)
    print("  GurukulAI - Audio Reference Dataset Seeder  (15 recordings)")
    print("="*65)
    try: requests.get(f"{BASE_URL}/auth/me", timeout=5)
    except requests.ConnectionError:
        print(f"ERROR: Cannot reach {BASE_URL}. Start the backend."); sys.exit(1)

    s_a = make_session(); login_session(s_a, EXPERT_A)
    print("\nResolving published knowledge source...")
    try: vid = get_source_version_id(s_a)
    except RuntimeError as e:
        print(f"ERROR: {e}"); sys.exit(1)

    print(f"\nSeeding {len(REFS)} references...\n")
    ok=fail=0
    for entry in REFS:
        if seed_one(entry, vid): ok+=1
        else: fail+=1
        time.sleep(0.3)

    print(f"\n{'='*65}")
    print(f"  Done: {ok} published  |  {fail} failed")
    print(f"  View: http://localhost:5174/app/sound-analysis")
    print(f"{'='*65}\n")

if __name__=="__main__":
    main()
