import json
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

    def __init__(self, api_key: Optional[str] = None, model: str = "gemini-2.5-flash"):
        self.api_key = api_key or settings.GEMINI_API_KEY
        if not self.api_key:
            raise ValidationError(
                code="missing_gemini_api_key",
                message="Gemini API key is missing. Set GEMINI_API_KEY in your .env file or configuration.",
            )
        self.model = model
        self.client = genai.Client(api_key=self.api_key)

    async def transcribe(self, audio_path: Path) -> List[Segment]:
        audio_path = Path(audio_path)
        if not audio_path.exists():
            raise ValidationError(code="file_not_found", message=f"Audio file '{audio_path}' does not exist.")

        file_size = audio_path.stat().st_size
        if file_size < 100:
            logger.warning(f"Audio file {audio_path.name} is virtually empty ({file_size} bytes).")
            return []

        # Determine mime type
        mime_type, _ = mimetypes.guess_type(str(audio_path))
        if not mime_type:
            suffix = audio_path.suffix.lower()
            if suffix == ".wav":
                mime_type = "audio/wav"
            elif suffix == ".webm":
                mime_type = "audio/webm"
            elif suffix == ".mp3":
                mime_type = "audio/mp3"
            elif suffix == ".ogg":
                mime_type = "audio/ogg"
            else:
                mime_type = "audio/wav"

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
            for idx, s in enumerate(raw_segments, start=1):
                text = (s.get("text") or "").strip()
                if not text:
                    continue
                start_s = float(s.get("start_s", 0.0))
                end_s = float(s.get("end_s", start_s + 2.0))
                segments.append(
                    Segment(
                        idx=idx,
                        start_s=start_s,
                        end_s=end_s,
                        text=text,
                    )
                )

            return segments

        except Exception as e:
            logger.error(f"Gemini STT transcription error: {e}", exc_info=True)
            raise ValidationError(
                code="transcription_failed",
                message=f"Gemini transcription service failed: {str(e)}",
            )
