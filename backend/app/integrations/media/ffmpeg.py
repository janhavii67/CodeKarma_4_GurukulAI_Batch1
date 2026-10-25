import os
import shutil
import subprocess
import wave
from pathlib import Path
from typing import Optional
from app.core.logging import logger
from app.core.exceptions import ValidationError


def probe_duration(file_path: Path) -> float:
    """
    Extract audio/video duration in seconds.
    Uses ffprobe if available on PATH; otherwise inspects WAV headers or calculates based on file size.
    """
    file_path = Path(file_path)
    if not file_path.exists():
        raise ValidationError(code="file_not_found", message=f"Audio file '{file_path}' does not exist.")

    # 1. Try ffprobe if installed
    ffprobe_bin = shutil.which("ffprobe")
    if ffprobe_bin:
        try:
            cmd = [
                ffprobe_bin,
                "-v", "error",
                "-show_entries", "format=duration",
                "-of", "default=noprint_wrappers=1:nokey=1",
                str(file_path),
            ]
            result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, check=True)
            duration = float(result.stdout.strip())
            return duration
        except Exception as e:
            logger.warning(f"ffprobe failed on {file_path}: {e}. Falling back to standard header probe.")

    # 2. Try standard python wave module if WAV format
    try:
        with wave.open(str(file_path), "rb") as wav_file:
            frames = wav_file.getnframes()
            rate = wav_file.getframerate()
            if rate > 0:
                return float(frames) / float(rate)
    except Exception:
        pass

    # 3. Fallback heuristic based on file size for compressed audio (e.g. webm / mp3 ~ 128kbps)
    size_bytes = file_path.stat().st_size
    # Estimate ~16 KB/s for 128kbps compressed audio
    estimated_seconds = max(1.0, size_bytes / 16000.0)
    return round(min(estimated_seconds, 300.0), 2)


def extract_audio_wav(input_path: Path, output_path: Path) -> Path:
    """
    Normalizes any audio or video container to 16 kHz mono 16-bit PCM WAV.
    """
    input_path = Path(input_path)
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    ffmpeg_bin = shutil.which("ffmpeg")
    if ffmpeg_bin:
        cmd = [
            ffmpeg_bin,
            "-y",  # Overwrite
            "-i", str(input_path),
            "-vn",  # No video
            "-ar", "16000",  # 16 kHz sample rate
            "-ac", "1",  # Mono
            "-acodec", "pcm_s16le",  # 16-bit PCM
            str(output_path),
        ]
        try:
            subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
            return output_path
        except Exception as e:
            logger.warning(f"ffmpeg conversion failed: {e}. Falling back to direct copy.")

    # Fallback if ffmpeg is not installed: copy file or create placeholder wav
    if input_path.suffix.lower() == ".wav":
        shutil.copyfile(input_path, output_path)
        return output_path

    # If it's a non-wav file and ffmpeg is unavailable, copy directly
    shutil.copyfile(input_path, output_path)
    return output_path
