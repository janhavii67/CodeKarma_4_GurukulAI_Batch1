import json
import math
import mimetypes
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


class GeminiSpeechProvider(SpeechProvider):
    """
    Multimodal Speech-to-Text transcription using Google Gemini models.
    Natively supports audio waveforms (WAV, MP3, WebM, OGG) and produces
    accurate timestamped segments without third-party binary dependencies.
    """

    def __init__(self, api_key: Optional[str] = None, model: Optional[str] = None):
        raw_key = api_key or getattr(settings, "GEMINI_API_KEY", "")
        self.api_keys: List[str] = []
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
        self.client = genai.Client(api_key=self.api_key)

    def _rotate_key(self) -> str:
        if not self.api_keys:
            return ""
        self.current_key_idx = (self.current_key_idx + 1) % len(self.api_keys)
        self.api_key = self.api_keys[self.current_key_idx]
        self.client = genai.Client(api_key=self.api_key)
        logger.info(f"Rotated Gemini STT API key to slot {self.current_key_idx + 1}/{len(self.api_keys)}")
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

            response = self.client.models.generate_content(
                model=self.model,
                contents=[audio_part, GEMINI_STT_PROMPT],
                config=config,
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
            raise ValidationError(
                code="transcription_failed",
                message=f"Gemini transcription service failed: {str(e)}",
            )
