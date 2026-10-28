"""Decoded, deterministic machine-sound feature extraction and reference matching.

This is a signal-processing baseline. It does not identify faults and its cosine
similarity scores are not probabilities or production-calibrated confidence.
"""
from __future__ import annotations

import io
import json
import math
import shutil
import subprocess
from typing import Any, Dict, Iterable, List, Optional

import numpy as np
import soundfile as sf
from scipy.signal import resample_poly

from app.core.config import settings


FEATURE_VERSION = "log_mel_mean_v1"
TARGET_SAMPLE_RATE = 16_000
FRAME_SIZE = 2_048
FRAME_HOP = 1_024
MEL_BANDS = 48
MIN_DURATION_SECONDS = 0.5
MAX_DURATION_SECONDS = 120.0
MAX_CHANNELS = 8
MIN_SAMPLE_RATE = 8_000
MAX_SAMPLE_RATE = 192_000
SILENCE_RMS_THRESHOLD = 0.0005


class AudioInputError(ValueError):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


class AudioProcessingError(RuntimeError):
    """Feature extraction failed; callers must not report this as a no-match."""


def _ffmpeg_executable() -> Optional[str]:
    """Use a system FFmpeg when present, otherwise the bundled Windows/Linux wheel binary."""
    executable = shutil.which("ffmpeg")
    if executable:
        return executable
    try:
        import imageio_ffmpeg

        return imageio_ffmpeg.get_ffmpeg_exe()
    except (ImportError, RuntimeError, OSError):
        return None


def _mel(frequency: np.ndarray) -> np.ndarray:
    return 2595.0 * np.log10(1.0 + frequency / 700.0)


def _media_mime(data: bytes, filename: Optional[str] = None) -> str:
    """Identify supported containers from signatures, using the filename to split MP4 audio/video."""
    suffix = (filename or "").lower().rsplit(".", 1)[-1] if "." in (filename or "") else ""
    if data.startswith(b"fLaC"):
        return "audio/flac"
    if len(data) >= 12 and data.startswith(b"RIFF") and data[8:12] == b"WAVE":
        return "audio/wav"
    if suffix == "aac" and len(data) >= 2 and data[0] == 0xFF and (data[1] & 0xF6) == 0xF0:
        return "audio/aac"
    if data.startswith(b"ID3") or (len(data) >= 2 and data[0] == 0xFF and (data[1] & 0xE0) == 0xE0 and (data[1] & 0x06) != 0):
        return "audio/mpeg"
    if data.startswith(b"OggS") and suffix == "opus":
        return "audio/opus"
    if data.startswith(b"OggS"):
        return "audio/ogg"
    if len(data) >= 12 and data[4:8] == b"ftyp":
        if suffix in {"m4a", "m4b", "m4p"}:
            return "audio/mp4"
        if suffix in {"mov", "qt"}:
            return "video/quicktime"
        if suffix == "3gp":
            return "video/3gpp"
        return "video/mp4"
    if data.startswith(b"\x1aE\xdf\xa3"):
        return "audio/webm" if suffix in {"webm", "weba"} else "video/webm"
    if len(data) >= 12 and data.startswith(b"RIFF") and data[8:12] == b"AVI ":
        return "video/avi"
    if data.startswith(b"FLV"):
        return "video/x-flv"
    if data.startswith(bytes.fromhex("3026B2758E66CF11A6D900AA0062CE6C")):
        return "video/wmv"
    if len(data) >= 4 and data[:3] == b"\x00\x00\x01" and data[3] in {0x00, 0xB3, 0xBA}:
        return "video/mpeg"
    if suffix in {"aiff", "aif"} and len(data) >= 12 and data.startswith(b"FORM") and data[8:12] in {b"AIFF", b"AIFC"}:
        return "audio/aiff"
    return ""


def _decode_audio(data: bytes, filename: Optional[str] = None) -> tuple[np.ndarray, int, str, Optional[bytes]]:
    if not data:
        raise AudioInputError("empty_audio", "The audio file is empty.")
    if len(data) > settings.MAX_UPLOAD_BYTES:
        raise AudioInputError("payload_too_large", f"Audio exceeds the {settings.MAX_UPLOAD_MB} MB upload limit.")

    mime = _media_mime(data, filename)
    if not mime:
        raise AudioInputError(
            "unsupported_audio_format",
            "Use a valid WAV, FLAC, MP3, M4A, OGG, WebM, or MP4 recording with an audio track.",
        )

    decoded_data = data
    normalized_wav: Optional[bytes] = None
    if mime not in {"audio/flac", "audio/wav"}:
        ffmpeg = _ffmpeg_executable()
        if not ffmpeg:
            raise AudioProcessingError("FFmpeg is required to decode compressed audio and video uploads.")
        try:
            result = subprocess.run(
                [
                    ffmpeg, "-hide_banner", "-loglevel", "error", "-nostdin", "-i", "pipe:0",
                    "-map", "0:a:0", "-vn", "-ac", "1", "-ar", str(TARGET_SAMPLE_RATE),
                    "-t", str(MAX_DURATION_SECONDS + 1), "-c:a", "pcm_s16le", "-f", "wav", "pipe:1",
                ],
                input=data,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                timeout=35,
                check=False,
            )
        except subprocess.TimeoutExpired as exc:
            raise AudioInputError("audio_decode_timeout", "The recording took too long to decode. Try a shorter clip.") from exc
        except OSError as exc:
            raise AudioProcessingError("FFmpeg could not be started to decode the upload.") from exc
        if result.returncode != 0 or not result.stdout:
            raise AudioInputError(
                "invalid_audio",
                "The media could not be decoded. Check that the file is complete and contains an audio track.",
            )
        decoded_data = result.stdout
        normalized_wav = result.stdout

    try:
        info = sf.info(io.BytesIO(decoded_data))
        if info.format not in {"WAV", "WAVEX", "RF64", "FLAC"}:
            raise AudioInputError("unsupported_audio_format", "The decoded recording format is not supported.")
        if info.channels < 1 or info.channels > MAX_CHANNELS:
            raise AudioInputError("unsupported_channel_count", f"Audio must have between 1 and {MAX_CHANNELS} channels.")
        if info.samplerate < MIN_SAMPLE_RATE or info.samplerate > MAX_SAMPLE_RATE:
            raise AudioInputError("unsupported_sample_rate", f"Audio sample rate must be between {MIN_SAMPLE_RATE} and {MAX_SAMPLE_RATE} Hz.")
        duration = info.frames / info.samplerate
        if duration < MIN_DURATION_SECONDS:
            raise AudioInputError("audio_too_short", f"Record at least {MIN_DURATION_SECONDS:g} seconds of machine sound.")
        if duration > MAX_DURATION_SECONDS:
            raise AudioInputError("audio_too_long", f"Record no more than {MAX_DURATION_SECONDS:g} seconds at a time.")
        samples, sample_rate = sf.read(io.BytesIO(decoded_data), dtype="float32", always_2d=True)
    except AudioInputError:
        raise
    except Exception as exc:
        raise AudioInputError("invalid_audio", "The audio could not be decoded. Check that the recording is complete and not corrupted.") from exc

    if samples.size == 0 or not np.isfinite(samples).all():
        raise AudioInputError("invalid_audio", "The audio contains no usable decoded samples.")
    mono = samples.mean(axis=1, dtype=np.float64).astype(np.float32)
    if sample_rate != TARGET_SAMPLE_RATE:
        divisor = math.gcd(int(sample_rate), TARGET_SAMPLE_RATE)
        mono = resample_poly(mono, TARGET_SAMPLE_RATE // divisor, int(sample_rate) // divisor).astype(np.float32)
    if float(np.sqrt(np.mean(np.square(mono, dtype=np.float64)))) < SILENCE_RMS_THRESHOLD:
        raise AudioInputError("silent_audio", "The recording is too quiet to compare. Record the operating sound again with clear audio.")
    if len(mono) / TARGET_SAMPLE_RATE > MAX_DURATION_SECONDS:
        raise AudioInputError("audio_too_long", f"Record no more than {MAX_DURATION_SECONDS:g} seconds at a time.")
    return mono, int(sample_rate), mime, normalized_wav


def extract_features(data: bytes, filename: Optional[str] = None) -> Dict[str, Any]:
    """Decode and summarize an upload as a normalized 48-band log-mel profile."""
    samples, source_rate, mime, normalized_wav = _decode_audio(data, filename)
    try:
        if len(samples) < FRAME_SIZE:
            raise AudioInputError("audio_too_short", "Record at least 0.5 seconds of machine sound.")
        frames = np.lib.stride_tricks.sliding_window_view(samples, FRAME_SIZE)[::FRAME_HOP]
        window = np.hanning(FRAME_SIZE).astype(np.float32)
        spectrum = np.abs(np.fft.rfft(frames * window, axis=1)) ** 2
        frequencies = np.fft.rfftfreq(FRAME_SIZE, d=1.0 / TARGET_SAMPLE_RATE)

        lower_mel = float(_mel(np.array([20.0]))[0])
        upper_mel = float(_mel(np.array([TARGET_SAMPLE_RATE / 2]))[0])
        edges = 700.0 * (10 ** (np.linspace(lower_mel, upper_mel, MEL_BANDS + 1) / 2595.0) - 1.0)
        band_power = []
        for lower, upper in zip(edges[:-1], edges[1:]):
            selected = (frequencies >= lower) & (frequencies < upper)
            if not np.any(selected):
                band_power.append(0.0)
            else:
                band_power.append(float(spectrum[:, selected].mean(axis=1).mean()))
        profile = np.log1p(np.asarray(band_power, dtype=np.float64))
        profile -= profile.mean()
        norm = float(np.linalg.norm(profile))
        if not math.isfinite(norm) or norm <= 1e-12:
            raise AudioInputError("unsuitable_audio", "The recording does not contain enough changing acoustic detail to compare.")
        profile /= norm
        return {
            "version": FEATURE_VERSION,
            "vector": [round(float(value), 8) for value in profile],
            "duration_seconds": round(len(samples) / TARGET_SAMPLE_RATE, 3),
            "sample_rate": source_rate,
            "normalized_sample_rate": TARGET_SAMPLE_RATE,
            "mime": mime,
            "normalized_audio_wav": normalized_wav,
        }
    except AudioInputError:
        raise
    except Exception as exc:
        raise AudioProcessingError("Audio feature extraction failed.") from exc


def _cosine_similarity(left: Iterable[float], right: Iterable[float]) -> Optional[float]:
    a = np.asarray(list(left), dtype=np.float64)
    b = np.asarray(list(right), dtype=np.float64)
    if a.shape != b.shape or a.size == 0 or not np.isfinite(a).all() or not np.isfinite(b).all():
        return None
    denominator = float(np.linalg.norm(a) * np.linalg.norm(b))
    if denominator <= 1e-12:
        return None
    cosine = float(np.dot(a, b) / denominator)
    # Linear map keeps scores in [0,1]. It is only a display/ranking value.
    return round(max(0.0, min(1.0, (cosine + 1.0) / 2.0)), 4)


def compare_features(query: Dict[str, Any], references: List[Dict[str, Any]]) -> Dict[str, Any]:
    if query.get("version") != FEATURE_VERSION:
        raise AudioProcessingError("Query audio features use an unsupported version.")

    scored: List[Dict[str, Any]] = []
    compatible = 0
    for reference in references:
        if reference.get("feature_version") != FEATURE_VERSION:
            continue
        try:
            stored = json.loads(reference.get("features_json") or "{}")
        except (TypeError, json.JSONDecodeError):
            continue
        if stored.get("version") != FEATURE_VERSION or not isinstance(stored.get("vector"), list):
            continue
        score = _cosine_similarity(query.get("vector", []), stored["vector"])
        if score is None:
            continue
        compatible += 1
        scored.append({**reference, "similarity_score": score})

    scored.sort(key=lambda item: item["similarity_score"], reverse=True)
    if not references:
        return {"status": "NO_RELIABLE_MATCH", "reason_code": "NO_APPROVED_REFERENCES", "message": "There are no expert-approved reference recordings available for comparison.", "candidates": [], "matched_reference": None}
    if compatible == 0:
        return {"status": "FAILED", "reason_code": "REFERENCE_FEATURES_UNAVAILABLE", "message": "Approved recordings exist, but none have compatible audio features. Ask an expert to reprocess the reference library.", "candidates": [], "matched_reference": None}

    candidates = scored[:5]
    top = scored[0]
    threshold = float(settings.AUDIO_MATCH_MIN_SIMILARITY)
    if top["similarity_score"] < threshold:
        return {
            "status": "NO_RELIABLE_MATCH",
            "reason_code": "BELOW_SCREENING_THRESHOLD",
            "message": "No reference met the current screening threshold. The closest recordings are shown for comparison; this does not confirm or rule out a fault.",
            "candidates": candidates,
            "matched_reference": None,
        }
    margin = float(settings.AUDIO_MATCH_AMBIGUITY_MARGIN)
    if len(scored) > 1 and top["similarity_score"] - scored[1]["similarity_score"] < margin:
        return {
            "status": "AMBIGUOUS_MATCH",
            "reason_code": "CLOSE_REFERENCE_SCORES",
            "message": "Several approved references have similar scores. Review the references with an expert; the highest score is not necessarily the correct match.",
            "candidates": candidates,
            "matched_reference": None,
        }
    return {
        "status": "MATCHED",
        "reason_code": "REFERENCE_SIMILARITY_MATCH",
        "message": "This recording is acoustically similar to an approved reference. Similarity alone does not confirm a fault or machine safety.",
        "candidates": candidates,
        "matched_reference": top,
    }
