from app.core.config import settings
from app.integrations.speech.base import SpeechProvider
from app.integrations.speech.openai_provider import OpenAIWhisperProvider
from app.integrations.speech.mock_provider import MockSpeechProvider
from app.integrations.speech.local_whisper_provider import LocalWhisperProvider
from app.core.exceptions import ValidationError


def get_speech_provider() -> SpeechProvider:
    """
    Factory creating configured SpeechProvider.
    Supports explicit OpenAI and local Whisper choices. Mock transcription is
    restricted to tests; no provider silently falls back to a paid service.
    """
    provider_name = (settings.STT_PROVIDER or "local_whisper").strip().lower()

    if provider_name in ("local_whisper", "local"):
        return LocalWhisperProvider(
            model=settings.LOCAL_WHISPER_MODEL,
            device=settings.LOCAL_WHISPER_DEVICE,
            compute_type=settings.LOCAL_WHISPER_COMPUTE_TYPE,
            cpu_threads=settings.LOCAL_WHISPER_CPU_THREADS,
            language=settings.LOCAL_WHISPER_LANGUAGE,
        )

    if provider_name in ("openai", "whisper_api"):
        if not settings.OPENAI_API_KEY:
            raise ValidationError(
                code="transcription_not_configured",
                message="OpenAI transcription is selected but OPENAI_API_KEY is not configured.",
            )
        return OpenAIWhisperProvider(api_key=settings.OPENAI_API_KEY, model=settings.OPENAI_TRANSCRIPTION_MODEL)

    if provider_name in ("mock", "test") and settings.ENVIRONMENT.lower() == "test":
        return MockSpeechProvider()

    if provider_name in ("mock", "test"):
        raise ValidationError(
            code="transcription_not_configured",
            message="Mock transcription is only available in the test environment.",
        )

    raise ValidationError(
        code="transcription_provider_invalid",
        message="The configured transcription provider is not supported. Select local_whisper or explicitly configure whisper_api.",
    )
