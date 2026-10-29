"""
medical_audio/dataset.py
========================
Generates a deterministic, legally-clean synthetic dataset of labelled medical-
equipment sounds using only numpy and scipy (already in requirements.txt).

Classes modelled
----------------
  ventilator_normal       – rhythmic 120 rpm piston hum ~1 Hz base + harmonics
  ventilator_alarm        – beeping overlay (800 Hz, 0.5 s period)
  infusion_pump_normal    – periodic motor click (2 Hz) + low-amplitude hiss
  infusion_pump_occlusion – irregular motor stall + high-pitched squeal
  ecg_monitor_normal      – soft continuous beep (1 Hz) aligned to heartbeat
  ecg_monitor_alarm       – rapid multi-tone alarm burst (4 Hz)
  defibrillator_charging  – rising-pitch tone (200→2000 Hz sweep 3 s)
  ambient_silence         – calibration class: near-silent room tone

Each clip is 3 seconds at 16 kHz mono (= 48 000 samples).
Returns X (n_samples, n_features) and y (n_samples,) as numpy arrays.
Also writes WAV files to data/medical_audio/ for manual inspection.
"""

from __future__ import annotations

import hashlib
import json
import logging
import math
import os
import struct
import wave
from pathlib import Path
from typing import Dict, List, Tuple

import numpy as np
from scipy.signal import butter, sosfilt

logger = logging.getLogger(__name__)

SAMPLE_RATE = 16_000        # Hz
CLIP_SECONDS = 3
CLIP_SAMPLES = SAMPLE_RATE * CLIP_SECONDS   # 48 000
SAMPLES_PER_CLASS = 120     # 120 clips × 8 classes = 960 training examples

CLASSES: List[str] = [
    "ventilator_normal",
    "ventilator_alarm",
    "infusion_pump_normal",
    "infusion_pump_occlusion",
    "ecg_monitor_normal",
    "ecg_monitor_alarm",
    "defibrillator_charging",
    "ambient_silence",
]

CLASS_TO_IDX: Dict[str, int] = {c: i for i, c in enumerate(CLASSES)}
IDX_TO_CLASS: Dict[int, str] = {i: c for c, i in CLASS_TO_IDX.items()}

# Human-readable condition descriptions for RAG indexing
CONDITION_DESCRIPTIONS: Dict[str, str] = {
    "ventilator_normal":       "Ventilator operating normally. Rhythmic piston cycle at approximately 120 rpm. No alarm conditions detected.",
    "ventilator_alarm":        "VENTILATOR ALARM. High-frequency alert tones detected over mechanical hum. Requires immediate clinical attention.",
    "infusion_pump_normal":    "Infusion pump running normally. Regular 2 Hz motor click and low hiss. Flow rate within parameters.",
    "infusion_pump_occlusion": "INFUSION PUMP OCCLUSION DETECTED. Irregular motor rhythm and high-pitched squeal indicate line blockage.",
    "ecg_monitor_normal":      "ECG monitor in normal sinus rhythm mode. Regular 1 Hz heartbeat beep. Patient vitals stable.",
    "ecg_monitor_alarm":       "ECG MONITOR ALARM. Rapid multi-tone burst (4 Hz) — possible arrhythmia or lead disconnect.",
    "defibrillator_charging":  "Defibrillator charging in progress. Rising-pitch sweep from 200 to 2000 Hz. Standby for discharge.",
    "ambient_silence":         "Ambient silence or near-silent environment. No medical equipment sounds detected.",
}

# ------------------------------------------------------------------ synthesis

def _t(n: int = CLIP_SAMPLES) -> np.ndarray:
    return np.linspace(0, CLIP_SECONDS, n, endpoint=False)


def _add_noise(sig: np.ndarray, rng: np.random.Generator, snr_db: float = 30) -> np.ndarray:
    sig_power = np.mean(sig ** 2) + 1e-12
    noise_power = sig_power / (10 ** (snr_db / 10))
    return sig + rng.normal(0, math.sqrt(noise_power), len(sig))


def _normalize(sig: np.ndarray, peak: float = 0.6) -> np.ndarray:
    m = np.max(np.abs(sig)) + 1e-12
    return sig / m * peak


def _bandpass(sig: np.ndarray, lo: float, hi: float, fs: int = SAMPLE_RATE) -> np.ndarray:
    sos = butter(4, [lo, hi], btype="band", fs=fs, output="sos")
    return sosfilt(sos, sig)


def _rng(seed: int) -> np.random.Generator:
    return np.random.default_rng(seed)


# ---------- per-class generators -----------------------------------------

def _ventilator_normal(rng: np.random.Generator) -> np.ndarray:
    t = _t()
    freq = 2.0 + rng.uniform(-0.1, 0.1)  # ~2 Hz piston
    sig = (
        0.5 * np.sin(2 * np.pi * freq * t)
        + 0.25 * np.sin(2 * np.pi * 2 * freq * t)
        + 0.1 * np.sin(2 * np.pi * 4 * freq * t)
    )
    return _normalize(_add_noise(sig, rng, snr_db=25 + rng.uniform(-3, 3)))


def _ventilator_alarm(rng: np.random.Generator) -> np.ndarray:
    t = _t()
    base = _ventilator_normal(rng) * 0.4
    # Alarm: 800 Hz beep at 0.5 s intervals
    alarm_freq = 800 + rng.uniform(-20, 20)
    beep_period = 0.5
    phase = rng.uniform(0, beep_period)
    alarm_envelope = (np.sin(2 * np.pi * t / beep_period + phase) > 0).astype(float)
    alarm = alarm_envelope * np.sin(2 * np.pi * alarm_freq * t) * 0.7
    return _normalize(_add_noise(base + alarm, rng, snr_db=30))


def _infusion_pump_normal(rng: np.random.Generator) -> np.ndarray:
    t = _t()
    click_rate = 2.0 + rng.uniform(-0.2, 0.2)
    # Click train: narrow Gaussian pulses
    clicks = np.zeros(CLIP_SAMPLES)
    step = int(SAMPLE_RATE / click_rate)
    offset = rng.integers(0, step)
    for i in range(offset, CLIP_SAMPLES, step):
        w = int(SAMPLE_RATE * 0.005)  # 5 ms click
        lo, hi = max(0, i - w), min(CLIP_SAMPLES, i + w)
        width = hi - lo
        if width > 0:
            clicks[lo:hi] += np.hanning(width) * 0.8
    hiss = _bandpass(rng.normal(0, 0.05, CLIP_SAMPLES), 200, 2000)
    return _normalize(_add_noise(clicks + hiss, rng, snr_db=28))


def _infusion_pump_occlusion(rng: np.random.Generator) -> np.ndarray:
    t = _t()
    # Irregular click pattern (stalled)
    clicks = np.zeros(CLIP_SAMPLES)
    pos = 0
    while pos < CLIP_SAMPLES:
        gap = int(SAMPLE_RATE * rng.uniform(0.1, 0.9))
        pos += gap
        if pos >= CLIP_SAMPLES:
            break
        w = int(SAMPLE_RATE * 0.01)
        lo, hi = max(0, pos - w), min(CLIP_SAMPLES, pos + w)
        width = hi - lo
        if width > 0:
            clicks[lo:hi] += np.hanning(width) * 0.6
    # Squeal: high-pitched 3–5 kHz tone
    squeal_freq = rng.uniform(3000, 5000)
    squeal = np.sin(2 * np.pi * squeal_freq * t) * 0.5
    return _normalize(_add_noise(clicks + squeal, rng, snr_db=22))


def _ecg_monitor_normal(rng: np.random.Generator) -> np.ndarray:
    t = _t()
    bpm = 72 + rng.uniform(-10, 10)
    period = 60.0 / bpm
    beep_freq = 880 + rng.uniform(-30, 30)
    beeps = np.zeros(CLIP_SAMPLES)
    pos = rng.uniform(0, period)
    while pos < CLIP_SECONDS:
        i = int(pos * SAMPLE_RATE)
        dur = int(0.08 * SAMPLE_RATE)
        if i + dur < CLIP_SAMPLES:
            env = np.hanning(dur)
            beeps[i:i+dur] += env * np.sin(2 * np.pi * beep_freq * t[i:i+dur]) * 0.6
        pos += period
    return _normalize(_add_noise(beeps, rng, snr_db=32))


def _ecg_monitor_alarm(rng: np.random.Generator) -> np.ndarray:
    t = _t()
    # Rapid 4 Hz multi-tone burst
    alarm_rate = 4.0 + rng.uniform(-0.3, 0.3)
    period = 1.0 / alarm_rate
    freqs = [660, 880, 1100]
    alarm = np.zeros(CLIP_SAMPLES)
    pos = 0.0
    while pos < CLIP_SECONDS:
        i = int(pos * SAMPLE_RATE)
        dur = int(0.1 * SAMPLE_RATE)
        for f in freqs:
            if i + dur < CLIP_SAMPLES:
                alarm[i:i+dur] += np.hanning(dur) * np.sin(2 * np.pi * f * t[i:i+dur]) * 0.4
        pos += period
    return _normalize(_add_noise(alarm, rng, snr_db=30))


def _defibrillator_charging(rng: np.random.Generator) -> np.ndarray:
    t = _t()
    # Rising frequency sweep: 200 → 2000 Hz over 3 s
    f_start = 200 + rng.uniform(-20, 20)
    f_end = 2000 + rng.uniform(-100, 100)
    sweep = np.sin(2 * np.pi * (f_start + (f_end - f_start) * t / CLIP_SECONDS) * t)
    envelope = t / CLIP_SECONDS  # amplitude grows with charge
    return _normalize(_add_noise(sweep * envelope, rng, snr_db=28))


def _ambient_silence(rng: np.random.Generator) -> np.ndarray:
    # Very quiet pink-ish noise
    white = rng.normal(0, 0.01, CLIP_SAMPLES)
    sig = _bandpass(white, 20, 500)
    return _normalize(sig, peak=0.02)


_GENERATORS = {
    "ventilator_normal":       _ventilator_normal,
    "ventilator_alarm":        _ventilator_alarm,
    "infusion_pump_normal":    _infusion_pump_normal,
    "infusion_pump_occlusion": _infusion_pump_occlusion,
    "ecg_monitor_normal":      _ecg_monitor_normal,
    "ecg_monitor_alarm":       _ecg_monitor_alarm,
    "defibrillator_charging":  _defibrillator_charging,
    "ambient_silence":         _ambient_silence,
}

# ------------------------------------------------------------------ features


def extract_features(sig: np.ndarray, sr: int = SAMPLE_RATE) -> np.ndarray:
    """
    Extract a 52-dimensional hand-crafted feature vector from a mono float32 signal.

    Features
    --------
    - 13 MFCCs (mean over time frames)
    - 13 MFCC deltas (mean)
    - 6 spectral features: centroid, bandwidth, rolloff, flatness, RMS, ZCR
    - 6 band energy ratios (sub-bands: 0-250, 250-500, 500-1k, 1-2k, 2-4k, 4-8k Hz)
    - 4 temporal features: RMS, peak, crest factor, duty cycle (above 30% peak)
    - 10 chroma-like pitch class bins (via DFT magnitude binned to 10 semitone groups)
    Total: 13+13+6+6+4+10 = 52 dimensions
    """
    n = len(sig)
    # ---- MFCC-like using DCT over log mel-spaced frequency bands ----
    n_fft = 512
    hop = 256
    n_mels = 40
    n_mfcc = 13

    # Short-time power spectrum
    frames = []
    for start in range(0, n - n_fft, hop):
        frame = sig[start:start + n_fft] * np.hanning(n_fft)
        frames.append(np.abs(np.fft.rfft(frame)) ** 2)
    if not frames:
        return np.zeros(52, dtype=np.float32)
    stps = np.array(frames)  # (T, n_fft//2+1)

    # Mel filterbank
    freqs = np.fft.rfftfreq(n_fft, 1.0 / sr)
    mel_min = 0
    mel_max = 2595 * np.log10(1 + sr / 2 / 700)
    mel_points = np.linspace(mel_min, mel_max, n_mels + 2)
    hz_points = 700 * (10 ** (mel_points / 2595) - 1)
    bin_points = np.floor((n_fft + 1) * hz_points / sr).astype(int)

    fbank = np.zeros((n_mels, len(freqs)))
    for m in range(1, n_mels + 1):
        lo, center, hi = bin_points[m-1], bin_points[m], bin_points[m+1]
        if center > lo:
            for k in range(lo, center):
                if k < len(freqs):
                    fbank[m-1, k] = (k - lo) / (center - lo + 1e-9)
        if hi > center:
            for k in range(center, hi):
                if k < len(freqs):
                    fbank[m-1, k] = (hi - k) / (hi - center + 1e-9)

    mel_energy = np.dot(stps, fbank.T)  # (T, n_mels)
    log_mel = np.log(mel_energy + 1e-9)

    # DCT for MFCCs
    from scipy.fft import dct
    mfcc_frames = dct(log_mel, type=2, n=n_mfcc, axis=1, norm="ortho")  # (T, n_mfcc)
    mfcc_mean = mfcc_frames.mean(axis=0)  # (13,)

    # Delta MFCCs (simple first-order difference)
    if len(mfcc_frames) > 1:
        delta = np.diff(mfcc_frames, axis=0)
        delta_mean = delta.mean(axis=0)
    else:
        delta_mean = np.zeros(n_mfcc)

    # ---- Spectral features (from mean spectrum) ----
    mean_power = stps.mean(axis=0)
    total_power = mean_power.sum() + 1e-12
    centroid = np.sum(freqs * mean_power) / total_power
    bandwidth = np.sqrt(np.sum(((freqs - centroid) ** 2) * mean_power) / total_power)

    # Spectral rolloff (85%)
    cumulative = np.cumsum(mean_power)
    rolloff_idx = np.searchsorted(cumulative, 0.85 * cumulative[-1])
    rolloff = freqs[min(rolloff_idx, len(freqs) - 1)]

    # Spectral flatness
    log_mean = np.exp(np.log(mean_power + 1e-12).mean())
    flatness = log_mean / (mean_power.mean() + 1e-12)

    # RMS energy
    rms = float(np.sqrt(np.mean(sig ** 2)))

    # ZCR
    zcr = float(np.sum(np.abs(np.diff(np.sign(sig)))) / (2 * n))

    spectral_features = np.array([centroid, bandwidth, rolloff, flatness, rms, zcr], dtype=np.float32)

    # ---- Sub-band energy ratios ----
    band_edges = [0, 250, 500, 1000, 2000, 4000, 8000]
    band_energy = []
    for lo_hz, hi_hz in zip(band_edges[:-1], band_edges[1:]):
        mask = (freqs >= lo_hz) & (freqs < hi_hz)
        band_energy.append(mean_power[mask].sum() / total_power if mask.any() else 0.0)
    band_features = np.array(band_energy, dtype=np.float32)

    # ---- Temporal features ----
    peak = float(np.max(np.abs(sig)))
    crest = peak / (rms + 1e-12)
    duty = float(np.mean(np.abs(sig) > 0.3 * peak))
    temporal = np.array([rms, peak, crest, duty], dtype=np.float32)

    # ---- Chroma-like: 10 pitch class bins from DFT ----
    fft_mag = np.abs(np.fft.rfft(sig)) ** 2
    fft_freqs = np.fft.rfftfreq(n, 1.0 / sr)
    # Bin frequencies into 10 octave/pitch buckets (log scale 80–8000 Hz)
    chroma = np.zeros(10, dtype=np.float32)
    valid = fft_freqs >= 80
    if valid.any():
        log_f = np.log2(fft_freqs[valid] / 80.0)
        octave_bins = (log_f / np.log2(8000.0 / 80.0) * 10).astype(int).clip(0, 9)
        np.add.at(chroma, octave_bins, fft_mag[valid])
    chroma /= chroma.sum() + 1e-12

    return np.concatenate([mfcc_mean, delta_mean, spectral_features, band_features, temporal, chroma]).astype(np.float32)


# ------------------------------------------------------------------ WAV I/O

def _write_wav(path: Path, sig: np.ndarray, sr: int = SAMPLE_RATE) -> None:
    """Write a float32 signal as 16-bit PCM WAV."""
    path.parent.mkdir(parents=True, exist_ok=True)
    int16 = (sig * 32767).clip(-32768, 32767).astype(np.int16)
    with wave.open(str(path), "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sr)
        wf.writeframes(int16.tobytes())


# ------------------------------------------------------------------ public API

def generate_dataset(
    samples_per_class: int = SAMPLES_PER_CLASS,
    save_wavs: bool = True,
    wav_dir: Path | None = None,
    seed_offset: int = 0,
) -> Tuple[np.ndarray, np.ndarray, List[str]]:
    """
    Generate a balanced synthetic dataset.

    Returns
    -------
    X : np.ndarray (n_samples, 52)  – feature matrix
    y : np.ndarray (n_samples,)      – integer class labels
    class_names : List[str]          – ordered class name list
    """
    if wav_dir is None:
        wav_dir = Path(__file__).resolve().parents[3] / "data" / "medical_audio"

    X_parts, y_parts = [], []

    for cls_name, gen_fn in _GENERATORS.items():
        cls_idx = CLASS_TO_IDX[cls_name]
        cls_dir = wav_dir / cls_name
        if save_wavs:
            cls_dir.mkdir(parents=True, exist_ok=True)

        for i in range(samples_per_class):
            seed = int(hashlib.md5(f"{cls_name}_{i + seed_offset}".encode()).hexdigest(), 16) % (2**31)
            rng = _rng(seed)
            sig = gen_fn(rng)
            feat = extract_features(sig)
            X_parts.append(feat)
            y_parts.append(cls_idx)

            if save_wavs:
                wav_path = cls_dir / f"{cls_name}_{i:04d}.wav"
                if not wav_path.exists():
                    _write_wav(wav_path, sig)

        logger.info(f"[medical_audio] Generated {samples_per_class} samples for class '{cls_name}'")

    X = np.array(X_parts, dtype=np.float32)
    y = np.array(y_parts, dtype=np.int32)
    return X, y, CLASSES


def load_wav_features(wav_path: Path) -> np.ndarray:
    """
    Load a WAV/audio file and extract features for inference.
    Handles mono/stereo, resamples to SAMPLE_RATE using scipy.
    """
    import soundfile as sf
    sig, sr = sf.read(str(wav_path), dtype="float32", always_2d=False)
    if sig.ndim == 2:
        sig = sig.mean(axis=1)  # stereo → mono
    if sr != SAMPLE_RATE:
        from scipy.signal import resample_poly
        from math import gcd
        g = gcd(SAMPLE_RATE, sr)
        sig = resample_poly(sig, SAMPLE_RATE // g, sr // g)
    # Pad or trim to CLIP_SAMPLES
    if len(sig) < CLIP_SAMPLES:
        sig = np.pad(sig, (0, CLIP_SAMPLES - len(sig)))
    else:
        sig = sig[:CLIP_SAMPLES]
    return extract_features(sig)


def save_dataset_manifest(wav_dir: Path) -> None:
    """Save a JSON manifest of all WAV files with class labels."""
    manifest = []
    for cls_name in CLASSES:
        cls_dir = wav_dir / cls_name
        if not cls_dir.exists():
            continue
        for wav in sorted(cls_dir.glob("*.wav")):
            manifest.append({
                "file": str(wav.relative_to(wav_dir)),
                "class": cls_name,
                "class_idx": CLASS_TO_IDX[cls_name],
                "condition": CONDITION_DESCRIPTIONS[cls_name],
            })
    manifest_path = wav_dir / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2))
    logger.info(f"[medical_audio] Manifest saved: {manifest_path} ({len(manifest)} entries)")
