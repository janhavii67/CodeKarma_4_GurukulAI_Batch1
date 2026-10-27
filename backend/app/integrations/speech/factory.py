from app.core.config import settings
from app.integrations.speech.base import SpeechProvider
from app.integrations.speech.openai_provider import OpenAIWhisperProvider
from app.integrations.speech.mock_provider import MockSpeechProvider
from app.core.exceptions import ValidationError


def get_speech_provider() -> SpeechProvider:
    """
    Factory creating configured SpeechProvider.
    Supports 'openai', 'whisper_api', 'mock', 'local'.
    Mock transcription is restricted to test environments; real environments fail clearly when unconfigured.
    """
    provider_name = (settings.STT_PROVIDER or "mock").lower()

    if provider_name in ("openai", "whisper_api") and settings.OPENAI_API_KEY:
        return OpenAIWhisperProvider(api_key=settings.OPENAI_API_KEY, model=settings.OPENAI_TRANSCRIPTION_MODEL)
    elif provider_name in ("mock", "test") and settings.ENVIRONMENT.lower() == "test":
        return MockSpeechProvider()
    elif settings.OPENAI_API_KEY:
        return OpenAIWhisperProvider(api_key=settings.OPENAI_API_KEY, model=settings.OPENAI_TRANSCRIPTION_MODEL)
    else:
        # Never substitute deterministic sample phrases for real user audio.
        raise ValidationError(
            code="transcription_not_configured",
            message="Transcription is unavailable: configure OPENAI_API_KEY or select a real speech provider.",
        )
