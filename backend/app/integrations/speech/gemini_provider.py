import json
import math
import mimetypes
import time
from pathlib import Path
from typing import List, Optional
from google import genai
from google.genai import types
from app.integrations.speech.base import SpeechProvider, Segment
from app.core.config import settings
from app.core.exceptions import ValidationError
from app.core.logging import logger

GEMINI_STT_PROMPT = """You are an accurate Speech-to-Text transcription engine for precision manufacturing procedures.
Listen to this audio recording and transcribe all spoken dialogue into ordered, timestamped segments.

Strict Rules:
1. Transcribe the spoken words verbatim. Do NOT summarize, extrapolate, or add text not heard in the recording.
2. Break the narration into natural sentence-level segments (each approximately 3-8 seconds long).
3. Provide realistic start_s and end_s timestamps in seconds relative to the audio timeline.
4. If the recording is silent or contains no intelligible speech, return an empty segments array.
5. Return valid JSON ONLY matching the following schema:
{
  "language": "en",
  "segments": [
    {
      "idx": 1,
      "start_s": 0.0,
      "end_s": 3.5,
      "text": "Exact spoken words for this segment."
    }
  ]
}
"""


def _is_timeout_exception(exc: Exception) -> bool:
    if isinstance(exc, TimeoutError):
        return True
    timeout_types = {"timeoutexception", "connecttimeout", "readtimeout", "writetimeout", "pooltimeout"}
    return any(cls.__name__.lower() in timeout_types for cls in type(exc).__mro__)


class GeminiSpeechProvider(SpeechProvider):
    """
    Multimodal Speech-to-Text transcription using Google Gemini models.
    Natively supports audio waveforms (WAV, MP3, WebM, OGG) and produces
    accurate timestamped segments without third-party binary dependencies.
    """
    api_keys: List[str] = []
    current_key_idx: int = 0
    timeout_s: float = 30.0
    _client_timeout_s: float = 30.0

    def __init__(self, api_key: Optional[str] = None, model: Optional[str] = None, timeout_s: Optional[float] = None):
        raw_key = api_key or getattr(settings, "GEMINI_API_KEY", "")
        self.api_keys = []
        if raw_key:
            import re
            for part in re.split(r"[|,]", str(raw_key)):
                k = part.strip()
                if k and k not in self.api_keys:
                    self.api_keys.append(k)

        if not self.api_keys:
            raise ValidationError(
                code="missing_gemini_api_key",
                message="Gemini API key is missing. Set GEMINI_API_KEY in your .env file or configuration.",
            )
        self.current_key_idx = 0
        self.api_key = self.api_keys[0]
        # Keep speech transcription aligned with the model configured for this
        # deployment. A hard-coded legacy model can be unavailable to a given
        # Gemini project even when its configured Gemini model is valid.
        self.model = model or settings.GEMINI_MODEL or "gemini-2.5-flash"
        self.timeout_s = max(0.001, float(settings.AI_REQUEST_TIMEOUT_S if timeout_s is None else timeout_s))
        self._client_timeout_s = self.timeout_s
        self.client = self._new_client(self.api_key, self._client_timeout_s)

    @staticmethod
    def _new_client(api_key: str, timeout_s: float):
        return genai.Client(
            api_key=api_key,
            http_options=types.HttpOptions(
                timeout=max(1, int(timeout_s * 1000)),
                retry_options=types.HttpRetryOptions(attempts=1),
            ),
        )

    def _bound_client_timeout(self, remaining_s: float) -> None:
        if not hasattr(self, "api_key") or not hasattr(self, "_new_client"):
            return
        timeout_s = max(0.001, min(getattr(self, "timeout_s", 30.0), remaining_s))
        if timeout_s < getattr(self, "_client_timeout_s", 30.0):
            self._client_timeout_s = timeout_s
            self.client = self._new_client(self.api_key, timeout_s)

    def _rotate_key(self, remaining_s: Optional[float] = None) -> str:
        keys = getattr(self, "api_keys", [])
        if not keys:
            return ""
        self.current_key_idx = (getattr(self, "current_key_idx", 0) + 1) % len(keys)
        self.api_key = keys[self.current_key_idx]
        timeout_s = getattr(self, "_client_timeout_s", 30.0)
        if remaining_s is not None:
            timeout_s = max(0.001, min(timeout_s, remaining_s))
        self._client_timeout_s = timeout_s
        if hasattr(self, "_new_client"):
            self.client = self._new_client(self.api_key, timeout_s)
        logger.info(f"Rotated Gemini STT API key to slot {self.current_key_idx + 1}/{len(keys)}")
        return self.api_key

    async def transcribe(self, audio_path: Path) -> List[Segment]:
        audio_path = Path(audio_path)
        if not audio_path.exists():
            raise ValidationError(code="file_not_found", message=f"Audio file '{audio_path}' does not exist.")

        file_size = audio_path.stat().st_size
        if file_size < 100:
            logger.warning(f"Audio file {audio_path.name} is virtually empty ({file_size} bytes).")
            return []

        # Use Gemini's registered MIME types rather than platform-specific
        # guesses such as audio/x-wav.
        mime_by_suffix = {
            ".wav": "audio/wav",
            ".mp3": "audio/mp3",
            ".m4a": "audio/m4a",
            ".aac": "audio/aac",
            ".ogg": "audio/ogg",
            ".oga": "audio/ogg",
            ".webm": "audio/webm",
            ".weba": "audio/webm",
            ".mp4": "audio/mp4",
        }
        mime_type = mime_by_suffix.get(audio_path.suffix.lower())
        if not mime_type:
            mime_type, _ = mimetypes.guess_type(str(audio_path))
        if not mime_type:
            raise ValidationError(code="unsupported_audio_type", message="Gemini cannot determine the uploaded audio format.")

        try:
            with open(audio_path, "rb") as f:
                audio_bytes = f.read()

            audio_part = types.Part.from_bytes(data=audio_bytes, mime_type=mime_type)

            config = types.GenerateContentConfig(
                temperature=0.0,
                response_mime_type="application/json",
            )

            candidate_models = [self.model]
            if hasattr(settings, "gemini_fallback_models"):
                for m in settings.gemini_fallback_models:
                    if m not in candidate_models:
                        candidate_models.append(m)

            response = None
            last_exc: Optional[Exception] = None
            timeout = getattr(self, "timeout_s", 30.0)
            deadline = time.monotonic() + timeout
            if getattr(self, "_client_timeout_s", 30.0) < timeout:
                self._client_timeout_s = timeout
                if hasattr(self, "_new_client") and hasattr(self, "api_key"):
                    self.client = self._new_client(self.api_key, timeout)

            api_keys = getattr(self, "api_keys", [])
            for candidate_model in candidate_models:
                keys_attempted = 0
                max_key_attempts = max(1, len(api_keys))
                while keys_attempted < max_key_attempts:
                    remaining_s = deadline - time.monotonic()
                    if remaining_s <= 0:
                        last_exc = TimeoutError("Gemini transcription exceeded the configured request timeout.")
                        break
                    self._bound_client_timeout(remaining_s)
                    try:
                        candidate_response = self.client.models.generate_content(
                            model=candidate_model,
                            contents=[audio_part, GEMINI_STT_PROMPT],
                            config=config,
                        )
                        if time.monotonic() > deadline:
                            raise TimeoutError("Gemini transcription exceeded the configured request timeout.")
                        response = candidate_response
                        break
                    except Exception as exc:
                        last_exc = exc
                        err_str = str(exc).lower()
                        is_quota = "quota" in err_str or "resourceexhausted" in err_str or "429" in err_str or "rate limit" in err_str
                        if is_quota and len(api_keys) > 1 and keys_attempted < max_key_attempts - 1:
                            self._rotate_key(deadline - time.monotonic())
                            keys_attempted += 1
                            continue
                        break
                if response is not None:
                    break

            if response is None:
                err_str = str(last_exc).lower() if last_exc else ""
                if "quota" in err_str or "resourceexhausted" in err_str:
                    raise ValidationError(
                        code="transcription_quota_exceeded",
                        message="The speech provider quota has been exhausted. Check provider quota or retry later.",
                    )
                if "429" in err_str or "rate limit" in err_str:
                    raise ValidationError(
                        code="transcription_rate_limited",
                        message="The speech provider returned a usage-limit response. Check provider quota and rate limits before retrying.",
                    )
                if _is_timeout_exception(last_exc) or "timeout" in err_str or "timed out" in err_str:
                    raise ValidationError(
                        code="transcription_timeout",
                        message="Speech-to-text request timed out. Please check your network connection and retry.",
                    )
                if "auth" in err_str or "api_key" in err_str or "401" in err_str or "403" in err_str:
                    raise ValidationError(
                        code="transcription_not_configured",
                        message="Speech-to-text authentication failed. Verify GEMINI_API_KEY configuration.",
                    )
                raise ValidationError(
                    code="transcription_failed",
                    message=f"Gemini transcription service failed: {str(last_exc)}",
                )

            response_text = response.text or "{}"
            if "```json" in response_text:
                response_text = response_text.split("```json")[1].split("```")[0].strip()
            elif "```" in response_text:
                response_text = response_text.split("```")[1].split("```")[0].strip()

            parsed = json.loads(response_text)
            raw_segments = parsed.get("segments", [])

            segments: List[Segment] = []
            for s in raw_segments:
                text = (s.get("text") or "").strip()
                if not text:
                    continue
                try:
                    start_s = float(s["start_s"])
                    end_s = float(s["end_s"])
                except (KeyError, TypeError, ValueError, OverflowError) as exc:
                    raise ValidationError(
                        code="invalid_transcript_timestamps",
                        message="Gemini returned a transcript segment without valid start and end timestamps. Please retry the recording.",
                    ) from exc
                if not math.isfinite(start_s) or not math.isfinite(end_s) or start_s < 0 or end_s <= start_s:
                    raise ValidationError(
                        code="invalid_transcript_timestamps",
                        message="Gemini returned invalid transcript timestamps. Please retry the recording.",
                    )
                segments.append(
                    Segment(
                        idx=len(segments) + 1,
                        start_s=start_s,
                        end_s=end_s,
                        text=text,
                    )
                )

            return segments

        except ValidationError:
            raise
        except Exception as e:
            logger.error(f"Gemini STT transcription error: {e}", exc_info=True)
            if _is_timeout_exception(e):
                raise ValidationError(
                    code="transcription_timeout",
                    message="Speech-to-text request timed out. Please check your network connection and retry.",
                ) from e
            raise ValidationError(
                code="transcription_failed",
                message=f"Gemini transcription service failed: {str(e)}",
            ) from e
