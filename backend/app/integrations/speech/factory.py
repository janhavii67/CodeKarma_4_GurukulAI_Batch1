from app.core.config import settings
from app.integrations.speech.base import SpeechProvider
from app.integrations.speech.openai_provider import OpenAIWhisperProvider
from app.integrations.speech.mock_provider import MockSpeechProvider


def get_speech_provider() -> SpeechProvider:
    """
    Factory creating configured SpeechProvider.
    Supports 'openai', 'whisper_api', 'mock', 'local'.
    Defaults to MockSpeechProvider if OpenAI key is empty or provider is 'mock'.
    """
    provider_name = (settings.STT_PROVIDER or "mock").lower()

    if provider_name in ("openai", "whisper_api") and settings.OPENAI_API_KEY:
        return OpenAIWhisperProvider(api_key=settings.OPENAI_API_KEY)
    elif provider_name in ("mock", "test"):
        return MockSpeechProvider()
    elif settings.OPENAI_API_KEY:
        return OpenAIWhisperProvider(api_key=settings.OPENAI_API_KEY)
    else:
        # Graceful fallback for local development without paid keys
        return MockSpeechProvider()
