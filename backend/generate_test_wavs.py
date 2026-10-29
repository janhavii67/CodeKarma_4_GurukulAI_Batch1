"""
Generates 15 test WAV files matching the seeded reference recordings.
Output folder: test_audio_samples/
"""
import io, os
import numpy as np
import soundfile as sf

OUT = "test_audio_samples"
os.makedirs(OUT, exist_ok=True)
SR = 16_000

def _wav(s, name):
    path = os.path.join(OUT, name)
    sf.write(path, np.clip(s,-0.9,0.9), SR, subtype="PCM_16")
    print(f"  + {name}")
    return path

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

print(f"Writing test WAVs to ./{OUT}/\n")

# 1. Normal operation — Infusion pump hum 120 Hz
_wav(harmonics(120,n=4)+noise(0.02,seed=1), "01_infusion_pump_normal_hum.wav")

# 2. Normal operation — Ventilator steady flow 350 Hz AM
_wav(am(350,0.23)+noise(0.03,seed=2), "02_ventilator_normal_flow.wav")

# 3. Normal operation — Centrifuge balanced rotor 200 Hz
_wav(harmonics(200,n=6,dk=0.5)+noise(0.015,seed=3), "03_centrifuge_balanced_rotor.wav")

# 4. Alarm — Infusion pump occlusion 880 Hz AM
_wav(am(880,1.0)+noise(0.01,seed=4), "04_infusion_pump_occlusion_alarm.wav")

# 5. Alarm — Patient monitor SpO2 low beeps
_wav(sine(1000,a=0.22)+sine(1200,a=0.18)+sine(1400,a=0.14)+noise(0.01,seed=5), "05_monitor_spo2_low_alarm.wav")

# 6. Abnormal vibration — Centrifuge imbalance 133 Hz + 40 Hz
_wav(harmonics(133,n=3,dk=0.8)+sine(40,a=0.25)+noise(0.06,seed=6), "06_centrifuge_imbalanced_rotor.wav")

# 7. Abnormal vibration — Ultrasound fan bearing 55 Hz rumble
_wav(sine(55,a=0.20)+harmonics(260,n=3,dk=0.7)+noise(0.05,seed=7), "07_ultrasound_fan_bearing_wear.wav")

# 8. Unusual noise — Autoclave steam hiss (broadband)
_wav(noise(0.35,seed=8)+noise(0.10,seed=9), "08_autoclave_steam_leak_hiss.wav")

# 9. Unusual noise — IV pump cracked tubing squeal 3200 Hz
_wav(am(3200,0.8)*0.4+noise(0.05,seed=10), "09_iv_pump_cracked_tubing_squeal.wav")

# 10. Pump irregularity — Syringe pump step skip 4 Hz clicks
_wav(clicks(4.0,a=0.35)+noise(0.04,seed=11), "10_syringe_pump_step_skip.wav")

# 11. Pump irregularity — Peristaltic pump air bubble 180 Hz AM
_wav(am(180,1.25)*0.5+noise(0.03,seed=12), "11_peristaltic_pump_air_bubble.wav")

# 12. Fan noise — Anaesthesia machine blocked filter 380 Hz
_wav(harmonics(380,n=3,dk=0.6)+sine(95,a=0.18)+noise(0.04,seed=13), "12_anaesthesia_blocked_filter.wav")

# 13. Incorrect setting — Centrifuge over-speed 250 Hz whine
_wav(harmonics(250,n=4,dk=0.55)+noise(0.03,seed=14), "13_centrifuge_overspeed_whine.wav")

# 14. Verified fault — Ventilator turbine blade chip 7 Hz + 600 Hz
_wav(clicks(7.0,a=0.30)+harmonics(600,n=2,dk=0.4)+noise(0.04,seed=15), "14_ventilator_turbine_blade_chip.wav")

# 15. Verified fault — Infusion pump gearbox stripped tooth 9 Hz clatter
_wav(clicks(9.0,a=0.45)+noise(0.12,seed=16), "15_infusion_pump_gearbox_fault.wav")

# -- BONUS: slightly-noisy variants to simulate real uploads ------------------
print("\n  -- Noisy variants (simulate real-world recording conditions) --")

_wav(harmonics(120,n=4)+noise(0.08,seed=42),  "T01_infusion_pump_normal_noisy.wav")
_wav(am(880,1.0)+noise(0.06,seed=43),          "T04_occlusion_alarm_noisy.wav")
_wav(harmonics(133,n=3,dk=0.8)+sine(40,a=0.25)+noise(0.14,seed=44),
                                                "T06_centrifuge_imbalance_noisy.wav")
_wav(clicks(7.0,a=0.30)+noise(0.09,seed=45),   "T14_turbine_fault_noisy.wav")

print(f"\nDone. {len(os.listdir(OUT))} WAV files saved to: {os.path.abspath(OUT)}")
