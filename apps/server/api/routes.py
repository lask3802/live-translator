from fastapi import APIRouter, WebSocket, WebSocketDisconnect
try:
    from apps.server.core.vad_sequencer import VADSequencer
    from apps.server.core.asr_engine import ASREngine
except ImportError:
    from core.vad_sequencer import VADSequencer
    from core.asr_engine import ASREngine
import logging
import json
import asyncio

# Global model instance (lazy loaded)
asr_model = None

def get_asr_model():
    global asr_model
    if asr_model is None:
        asr_model = ASREngine()
    return asr_model

router = APIRouter()
logger = logging.getLogger("API")

@router.websocket("/ws/audio")
async def audio_websocket(websocket: WebSocket):
    await websocket.accept()
    logger.info("Client connected to /ws/audio")
    
    # Initialize VAD per connection
    vad = VADSequencer()
    try:
        vad.init_model()
    except Exception as e:
        logger.error(f"Failed to initialize VAD: {e}")
        await websocket.close(code=1011)
        return

    try:
        while True:
            # Receive binary audio chunk (Int16)
            data = await websocket.receive_bytes()
            
            # Process VAD
            events = vad.process(data)
            
            for event in events:
                if event["type"] == "start":
                    logger.info("VAD: Speech START")
                    await websocket.send_json({"type": "vad_start"})
                elif event["type"] == "commit":
                    audio = event["audio"]
                    duration_ms = (len(audio) / 16000) * 1000
                    logger.info(f"VAD: Speech COMMIT ({duration_ms:.0f}ms)")
                    await websocket.send_json({
                        "type": "vad_commit", 
                        "duration_ms": duration_ms
                    })
                    # Transcribe
                    try:
                        engine = get_asr_model()
                        segments = await asyncio.to_thread(engine.transcribe, audio)
                        
                        for segment in segments:
                            logger.info(f"ASR: {segment.text.strip()}")
                            await websocket.send_json({
                                "type": "transcript",
                                "text": segment.text.strip(),
                                "start": segment.start,
                                "end": segment.end,
                                "duration_ms": duration_ms
                            })
                    except Exception as e:
                        logger.error(f"ASR Error: {e}")
                    
    except WebSocketDisconnect:
        logger.info("Client disconnected")
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
