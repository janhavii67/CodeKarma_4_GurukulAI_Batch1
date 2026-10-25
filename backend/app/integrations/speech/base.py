from abc import ABC, abstractmethod
from dataclasses import dataclass
from pathlib import Path
from typing import List


@dataclass
class Segment:
    idx: int
    start_s: float
    end_s: float
    text: str


class SpeechProvider(ABC):
    """Abstract interface for speech-to-text providers."""

    @abstractmethod
    async def transcribe(self, audio_path: Path) -> List[Segment]:
        """
        Transcribe audio at audio_path into timestamped segments.
        Must raise an exception with a descriptive message on unrecoverable failure.
        """
        pass
