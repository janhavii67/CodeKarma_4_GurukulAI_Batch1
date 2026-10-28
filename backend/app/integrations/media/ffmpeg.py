import os
import re
import shutil
import subprocess
import wave
from pathlib import Path
from typing import Optional
from app.core.logging import logger
from app.core.exceptions import ValidationError


def _ffmpeg_executable() -> Optional[str]:
    """Prefer the system tool, with the pinned imageio-ffmpeg wheel as a local fallback."""
    executable = shutil.which("ffmpeg")
    if executable:
        return executable
    try:
        import imageio_ffmpeg

        return imageio_ffmpeg.get_ffmpeg_exe()
    except (ImportError, RuntimeError, OSError):
        return None


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

    # 3. Use FFmpeg's input probe when ffprobe is not installed (common on Windows).
    ffmpeg_bin = _ffmpeg_executable()
    if ffmpeg_bin:
        try:
            result = subprocess.run(
                [ffmpeg_bin, "-hide_banner", "-i", str(file_path)],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                timeout=30,
                check=False,
            )
            probe_output = result.stderr or result.stdout or ""
            match = re.search(r"Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)", probe_output)
            if match:
                hours, minutes, seconds = match.groups()
                return int(hours) * 3600 + int(minutes) * 60 + float(seconds)
        except (OSError, subprocess.TimeoutExpired) as exc:
            logger.warning("FFmpeg duration probe failed for %s (%s).", file_path.name, type(exc).__name__)

    raise ValidationError(code="invalid_audio", message="The audio duration could not be read. Verify the recording and try again.")


def extract_audio_wav(input_path: Path, output_path: Path) -> Path:
    """
    Normalizes any audio or video container to 16 kHz mono 16-bit PCM WAV.
    """
    input_path = Path(input_path)
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    ffmpeg_bin = _ffmpeg_executable()
    if not ffmpeg_bin:
        raise ValidationError(code="ffmpeg_unavailable", message="FFmpeg is required to normalize voice recordings. Install the backend dependencies and retry.")

    cmd = [
        ffmpeg_bin,
        "-hide_banner",
        "-loglevel", "error",
        "-y",
        "-i", str(input_path),
        "-vn",
        "-ar", "16000",
        "-ac", "1",
        "-acodec", "pcm_s16le",
        str(output_path),
    ]
    try:
        subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True, timeout=120)
    except (OSError, subprocess.SubprocessError) as exc:
        output_path.unlink(missing_ok=True)
        logger.error("FFmpeg normalization failed for %s (%s).", input_path.name, type(exc).__name__)
        raise ValidationError(code="audio_normalization_failed", message="The audio could not be normalized. Verify the recording and retry.") from exc
    if not output_path.exists() or output_path.stat().st_size == 0:
        raise ValidationError(code="audio_normalization_failed", message="FFmpeg produced no normalized audio. Verify the recording and retry.")
    return output_path
