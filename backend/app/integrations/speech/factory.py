from app.core.config import settings
from app.core.exceptions import ValidationError
from app.integrations.speech.base import SpeechProvider
from app.integrations.speech.openai_provider import OpenAIWhisperProvider
from app.integrations.speech.gemini_provider import GeminiSpeechProvider
from app.integrations.speech.mock_provider import MockSpeechProvider
from app.integrations.speech.local_whisper_provider import LocalWhisperProvider


import sys

def get_speech_provider() -> SpeechProvider:
    """
    Factory creating configured SpeechProvider.
    Supports Gemini, local Whisper, OpenAI Whisper, and a quarantined test/demo mock.
    Mock provider is strictly quarantined behind settings.DEMO_MODE=True or test environments.
    """
    if getattr(settings, "DEMO_MODE", False) or getattr(settings, "ENVIRONMENT", "") in ("testing", "test") or "pytest" in sys.modules:
        return MockSpeechProvider()

    provider_name = (settings.STT_PROVIDER or "gemini").strip().lower()

    if provider_name in ("gemini", "google") and settings.GEMINI_API_KEY:
        return GeminiSpeechProvider()
    elif provider_name in ("local_whisper", "local"):
        return LocalWhisperProvider(
            model=settings.LOCAL_WHISPER_MODEL,
            device=settings.LOCAL_WHISPER_DEVICE,
            compute_type=settings.LOCAL_WHISPER_COMPUTE_TYPE,
            cpu_threads=settings.LOCAL_WHISPER_CPU_THREADS,
            language=settings.LOCAL_WHISPER_LANGUAGE,
        )
    elif provider_name in ("openai", "whisper_api") and settings.OPENAI_API_KEY:
        return OpenAIWhisperProvider(api_key=settings.OPENAI_API_KEY, model=settings.OPENAI_TRANSCRIPTION_MODEL)
    elif settings.GEMINI_API_KEY:
        return GeminiSpeechProvider()
    elif settings.OPENAI_API_KEY:
        return OpenAIWhisperProvider(api_key=settings.OPENAI_API_KEY, model=settings.OPENAI_TRANSCRIPTION_MODEL)
    else:
        raise ValidationError(
            code="stt_provider_not_configured",
            message="No active Speech-to-Text provider credentials configured. Please set GEMINI_API_KEY (or OPENAI_API_KEY) in .env, or enable DEMO_MODE=true for offline demonstration.",
        )
