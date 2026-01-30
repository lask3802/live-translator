import numpy as np
import collections
import logging
import torch

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("VADSequencer")

class VADSequencer:
    """
    VAD Sequencer using Silero VAD to detect speech segments.
    Maintains a buffer and state machine to output clean speech chunks.
    """
    def __init__(self, sample_rate: int = 16000, threshold: float = 0.5, min_speech_duration_ms: int = 250, min_silence_duration_ms: int = 500):
        self.sample_rate = sample_rate
        self.threshold = threshold
        self.min_speech_ms = min_speech_duration_ms
        self.min_silence_ms = min_silence_duration_ms

        self.model = None
        self.utils = None
        
        # State
        self.triggered = False
        self.temp_end = 0
        self.current_speech = [] # List of numpy arrays (int16)
        
        # Buffer for incoming data
        self.buffer = bytearray()
        
    def init_model(self):
        """Lazy load the model to avoid blocking on startup if not needed immediately."""
        if self.model: return
        try:
            # We use the standard torch.hub.load
            logger.info("Loading Silero VAD model...")
            self.model, self.utils = torch.hub.load(repo_or_dir='snakers4/silero-vad',
                                                  model='silero_vad',
                                                  force_reload=False,
                                                  trust_repo=True)
            self.get_speech_timestamps, _, self.read_audio, _, _ = self.utils
            logger.info("Silero VAD model loaded.")
        except Exception as e:
            logger.error(f"Failed to load VAD model: {e}")
            raise

    def process(self, audio_chunk: bytes) -> list[dict]:
        """
        Process a raw audio chunk (Int16).
        Returns a list of events.
        Events:
          - {"type": "start"}
          - {"type": "commit", "audio": np.array(int16)}
        """
        if not self.model:
            self.init_model()
            
        # Add to buffer
        self.buffer.extend(audio_chunk)
        
        # We need fixed window sizes for VAD (512, 1024, or 1536 samples at 16k)
        # 512 samples = 32ms.
        window_size_samples = 512
        window_size_bytes = window_size_samples * 2 # Int16 = 2 bytes
        
        events = []
        
        # Process all full windows in buffer
        while len(self.buffer) >= window_size_bytes:
            chunk_bytes = self.buffer[:window_size_bytes]
            self.buffer = self.buffer[window_size_bytes:]
            
            # Convert to numpy and then float32 for model
            audio_int16 = np.frombuffer(chunk_bytes, dtype=np.int16)
            audio_float32 = audio_int16.astype(np.float32) / 32768.0
            
            # Predict
            # model(x, sr) -> prob
            with torch.no_grad():
                speech_prob = self.model(torch.from_numpy(audio_float32), self.sample_rate).item()
            
            current_window_duration_s = window_size_samples / self.sample_rate
            
            if speech_prob >= self.threshold:
                # Speech detected
                if not self.triggered:
                    self.triggered = True
                    events.append({"type": "start"})
                
                self.current_speech.append(audio_int16)
                self.temp_end = 0
            else:
                # Silence detected
                if self.triggered:
                    self.current_speech.append(audio_int16)
                    self.temp_end += current_window_duration_s
                    
                    if self.temp_end >= (self.min_silence_ms / 1000.0):
                        # Silence exceeded threshold, commit speech
                        self.triggered = False
                        if self.current_speech:
                            full_speech = np.concatenate(self.current_speech)
                            events.append({"type": "commit", "audio": full_speech})
                            self.current_speech = []
        
        return events