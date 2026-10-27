from pathlib import Path
from typing import List
from app.integrations.speech.base import SpeechProvider, Segment


class MockSpeechProvider(SpeechProvider):
    """
    Deterministic speech-to-text provider for tests, local offline development,
    and air-gapped manufacturing environments.
    """

    def __init__(self, sample_segments: List[Segment] = None):
        self.sample_segments = sample_segments or [
            Segment(
                idx=1,
                start_s=0.0,
                end_s=3.4,
                text="[ILLUSTRATIVE — NOT A REAL PROCEDURE] Before beginning the face turning cycle on the CNC lathe, inspect the spindle chuck jaw pressure.",
            ),
            Segment(
                idx=2,
                start_s=3.5,
                end_s=7.2,
                text="[ILLUSTRATIVE — NOT A REAL PROCEDURE] Set hydraulic chuck clamping pressure strictly to 25 bar for steel billets.",
            ),
            Segment(
                idx=3,
                start_s=7.3,
                end_s=11.8,
                text="[ILLUSTRATIVE — NOT A REAL PROCEDURE] Mount tool insert CNMG 120408 with torque wrench set to 4.5 Nm.",
            ),
            Segment(
                idx=4,
                start_s=11.9,
                end_s=16.5,
                text="[ILLUSTRATIVE — NOT A REAL PROCEDURE] Warning: never operate without closing the blast shield door. Coolant flow must be verified prior to spindle start.",
            ),
            Segment(
                idx=5,
                start_s=16.6,
                end_s=21.0,
                text="[ILLUSTRATIVE — NOT A REAL PROCEDURE] Ensure feed rate is set to the correct value before engaging cycle start.",
            ),
        ]

    async def transcribe(self, audio_path: Path) -> List[Segment]:
        return self.sample_segments
