from pathlib import Path
from typing import List
import httpx
from app.integrations.speech.base import SpeechProvider, Segment
from app.core.exceptions import ValidationError
from app.core.logging import logger
from app.core.config import settings


class OpenAIWhisperProvider(SpeechProvider):
    """
    OpenAI Whisper API speech-to-text provider.
    Requires OPENAI_API_KEY.
    """

    def __init__(self, api_key: str, model: str | None = None):
        if not api_key:
            raise ValidationError(
                code="missing_api_key",
                message="OpenAI API key is missing. Set OPENAI_API_KEY in .env or switch STT_PROVIDER.",
            )
        self.api_key = api_key
        self.model = model or settings.OPENAI_TRANSCRIPTION_MODEL

    async def transcribe(self, audio_path: Path) -> List[Segment]:
        audio_path = Path(audio_path)
        if not audio_path.exists():
            raise ValidationError(code="file_not_found", message=f"Audio file '{audio_path}' not found.")

        url = "https://api.openai.com/v1/audio/transcriptions"
        headers = {"Authorization": f"Bearer {self.api_key}"}

        async with httpx.AsyncClient(timeout=60.0) as client:
            with open(audio_path, "rb") as f:
                files = {"file": (audio_path.name, f, "audio/wav")}
                data = {
                    "model": self.model,
                    "response_format": "verbose_json",
                    "timestamp_granularities[]": "segment",
                }
                try:
                    response = await client.post(url, headers=headers, files=files, data=data)
                    response.raise_for_status()
                    payload = response.json()
                except httpx.HTTPStatusError as e:
                    # Do not log provider response bodies or request details; keep credentials and user audio private.
                    logger.error("Speech provider returned HTTP status %s", e.response.status_code)
                    raise ValidationError(code="transcription_failed", message="OpenAI transcription service failed.")
                except httpx.TimeoutException:
                    raise ValidationError(code="transcription_timeout", message="Speech provider timed out. The recording is saved and can be retried.")
                except Exception as e:
                    logger.error("Speech provider request failed (%s)", type(e).__name__)
                    raise ValidationError(code="transcription_network_error", message="Failed to contact transcription service.")

        raw_segments = payload.get("segments", [])
        if not raw_segments and isinstance(payload.get("text"), str) and payload["text"].strip():
            # Single segment fallback
            return [Segment(idx=1, start_s=0.0, end_s=payload.get("duration", 5.0), text=payload["text"].strip())]

        segments: List[Segment] = []
        for idx, seg in enumerate(raw_segments, start=1):
            segments.append(
                Segment(
                    idx=idx,
                    start_s=float(seg.get("start", 0.0)),
                    end_s=float(seg.get("end", 0.0)),
                    text=seg.get("text", "").strip(),
                )
            )
        return segments
