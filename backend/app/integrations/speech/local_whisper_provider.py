"""Local CPU transcription using faster-whisper with a process-wide model cache."""
import asyncio
from pathlib import Path
from threading import Lock
from typing import Any, List, Optional, Tuple

from app.core.exceptions import ValidationError
from app.core.logging import logger
from app.core.config import settings
from app.integrations.speech.base import Segment, SpeechProvider

_model_lock = Lock()
_inference_lock = Lock()
_model_key: Optional[Tuple[str, str, str, int]] = None
_model_instance: Any = None


def _load_model(model_name: str, device: str, compute_type: str, cpu_threads: int) -> Any:
    """Load at most one model per process; replace it only if config changes."""
    global _model_key, _model_instance
    key = (model_name, device, compute_type, cpu_threads)
    with _model_lock:
        if _model_instance is not None and _model_key == key:
            return _model_instance
        try:
            from faster_whisper import WhisperModel
        except ImportError as exc:
            raise ValidationError(
                code="local_whisper_dependency_missing",
                message="Local transcription requires faster-whisper. Install the backend requirements and restart the server.",
            ) from exc
        try:
            model = WhisperModel(
                model_name,
                device=device,
                compute_type=compute_type,
                cpu_threads=cpu_threads,
                num_workers=1,
            )
        except Exception as exc:
            logger.error("Local Whisper model initialization failed (%s).", type(exc).__name__)
            raise ValidationError(
                code="local_whisper_model_unavailable",
                message="The local Whisper model could not be loaded. Check model settings and first-time download access; the original recording is still saved.",
            ) from exc
        _model_instance = model
        _model_key = key
        return model


def _clear_model_cache() -> None:
    """Release the cached model; exposed for tests and controlled reloads."""
    global _model_key, _model_instance
    with _model_lock:
        _model_key = None
        _model_instance = None


class LocalWhisperProvider(SpeechProvider):
    """Faster-whisper provider tuned for local Windows CPU use."""

    def __init__(
        self,
        model: Optional[str] = None,
        device: Optional[str] = None,
        compute_type: Optional[str] = None,
        cpu_threads: Optional[int] = None,
        language: Optional[str] = None,
    ) -> None:
        self.model_name = model or settings.LOCAL_WHISPER_MODEL
        self.device = device or settings.LOCAL_WHISPER_DEVICE
        self.compute_type = compute_type or settings.LOCAL_WHISPER_COMPUTE_TYPE
        self.cpu_threads = max(1, cpu_threads or settings.LOCAL_WHISPER_CPU_THREADS)
        selected_language = language if language is not None else settings.LOCAL_WHISPER_LANGUAGE
        selected_language = (selected_language or "en").strip().lower() or "en"
        self.language = None if selected_language in {"auto", "detect"} else selected_language
        self.detected_language: Optional[str] = None
        # The transcript records both the engine and selected checkpoint.
        self.model = f"local_whisper:{self.model_name}"

    async def transcribe(self, audio_path: Path) -> List[Segment]:
        path = Path(audio_path)
        if not path.is_file():
            raise ValidationError(code="file_not_found", message="The saved audio recording could not be found.")

        try:
            # Model loading, audio decode, and inference are CPU-bound. Keep them
            # off FastAPI's event loop and serialize inference to bound RAM use.
            return await asyncio.to_thread(self._transcribe_sync, path)
        except ValidationError:
            raise
        except TypeError as exc:
            if "metadata_errors" in str(exc):
                logger.error("Local Whisper audio decoder dependency is incompatible.")
                raise ValidationError(
                    code="local_whisper_dependency_incompatible",
                    message="Local transcription dependencies are incompatible. Reinstall backend requirements and restart; the original recording is still saved.",
                ) from exc
            logger.error("Local Whisper inference failed (%s).", type(exc).__name__)
            raise ValidationError(
                code="local_transcription_failed",
                message="Local transcription failed. The original recording is still saved; check the audio format and local model setup before retrying.",
            ) from exc
        except Exception as exc:
            logger.error("Local Whisper inference failed (%s).", type(exc).__name__)
            raise ValidationError(
                code="local_transcription_failed",
                message="Local transcription failed. The original recording is still saved; check the audio format and local model setup before retrying.",
            ) from exc

    def _transcribe_sync(self, audio_path: Path) -> List[Segment]:
        with _inference_lock:
            model = _load_model(
                self.model_name,
                self.device,
                self.compute_type,
                self.cpu_threads,
            )
            options = {"beam_size": 3, "vad_filter": True}
            if self.language:
                options["language"] = self.language
            generated_segments, info = model.transcribe(str(audio_path), **options)
            # faster-whisper returns a lazy generator; consume it while holding
            # the inference lock so two jobs cannot run inference concurrently.
            result: List[Segment] = []
            raw_text_parts: List[str] = []
            raw_segment_count = 0
            for index, segment in enumerate(generated_segments, start=1):
                raw_segment_count += 1
                raw_text = segment.text or ""
                raw_text_parts.append(raw_text)
                text = raw_text.strip()
                if text:
                    result.append(
                        Segment(
                            idx=index,
                            start_s=float(segment.start),
                            end_s=float(segment.end),
                            text=text,
                        )
                    )
            logger.debug(
                "Local Whisper result model=%s detected_language=%s language_probability=%.3f options=%s segments=%d raw_text_characters=%d",
                self.model_name,
                getattr(info, "language", "unknown"),
                float(getattr(info, "language_probability", 0.0) or 0.0),
                options,
                raw_segment_count,
                len("".join(raw_text_parts)),
            )
            self.detected_language = getattr(info, "language", None)
            return result
