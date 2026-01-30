from faster_whisper import WhisperModel
import numpy as np
import logging

logger = logging.getLogger("ASREngine")

class ASREngine:
    def __init__(self, model_size: str = "base.en", device: str = "cpu", compute_type: str = "int8"):
        logger.info(f"Loading Whisper model: {model_size} on {device} ({compute_type})...")
        self.model = WhisperModel(model_size, device=device, compute_type=compute_type)
        logger.info("Whisper model loaded.")

    def transcribe(self, audio_data: np.ndarray):
        """
        Transcribe audio chunk (16kHz, float32 or int16).
        Returns list of segments.
        """
        # Ensure float32 for faster-whisper
        if audio_data.dtype == np.int16:
            audio_data = audio_data.astype(np.float32) / 32768.0
        
        # We use beam_size=1 for speed in real-time
        segments, info = self.model.transcribe(
            audio_data, 
            beam_size=1,
            language="en",
            condition_on_previous_text=False # Critical for short streaming chunks
        )
        
        # Convert generator to list
        # Note: This blocks until transcription is done
        result = list(segments)
        return result