from fastapi import APIRouter, WebSocket, WebSocketDisconnect
try:
    from apps.server.core.vad_sequencer import VADSequencer
    from apps.server.core.asr_engine import ASREngine
    from apps.server.core.translator import Translator
except ImportError:
    from core.vad_sequencer import VADSequencer
    from core.asr_engine import ASREngine
    from core.translator import Translator
import logging
import json
import asyncio
from collections import deque
import os
from itertools import count
def trim_history(history_items: list[str], limit: int = 5, max_chars: int = 500) -> list[str]:
    trimmed = history_items[-limit:]
    return [item[:max_chars] for item in trimmed]

# Global model instance (lazy loaded)
asr_model = None
translator = None

def get_asr_model():
    global asr_model
    if asr_model is None:
        asr_model = ASREngine()
    return asr_model

def get_translator():
    global translator
    if translator is None:
        translator = Translator()
    return translator

router = APIRouter()
logger = logging.getLogger("API")

@router.websocket("/ws/audio")
async def audio_websocket(websocket: WebSocket):
    await websocket.accept()
    logger.info("Client connected to /ws/audio")

    current_language = "auto"
    current_target_language = os.getenv("TARGET_LANGUAGE", "zh-TW")
    extra_context = ""
    history = deque(maxlen=50)
    segment_counter = count(1)
    
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
            message = await websocket.receive()
            if not isinstance(message, dict):
                logger.warning(f"Unexpected websocket message type: {type(message)}")
                continue

            message_type = message.get("type")

            if message_type == "websocket.disconnect":
                break

            text_payload = message.get("text")
            if text_payload is not None:
                try:
                    payload = json.loads(text_payload)
                    if payload.get("type") == "config":
                        current_language = payload.get("language", "auto")
                        current_target_language = payload.get("target_language", current_target_language)
                        extra_context = payload.get("extra_context", extra_context)
                        logger.info(f"ASR language set to: {current_language}")
                        logger.info(f"Target language set to: {current_target_language}")
                        if extra_context:
                            logger.info("Extra context updated.")
                    continue
                except Exception as e:
                    logger.warning(f"Failed to parse text message: {e}")
                    continue

            # Receive binary audio chunk (Int16)
            if message_type != "websocket.receive":
                continue

            data = message.get("bytes")
            if data is None:
                continue

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
                        segments = await asyncio.to_thread(engine.transcribe, audio, current_language)
                        translator_instance = get_translator()

                        for segment in segments:
                            text = segment.text.strip()
                            segment_id = next(segment_counter)
                            segment_start = segment.start
                            segment_end = segment.end
                            logger.info(f"ASR: {text}")
                            await websocket.send_json({
                                "type": "transcript",
                                "segment_id": segment_id,
                                "text": text,
                                "start": segment_start,
                                "end": segment_end,
                                "duration_ms": duration_ms
                            })

                            async def translate_and_send(
                                segment_id_snapshot: int,
                                text_snapshot: str,
                                start_snapshot: float,
                                end_snapshot: float,
                            ):
                                context_history = trim_history(list(history))
                                corrected = await translator_instance.correct_text(text_snapshot, context_history)
                                if corrected and corrected != text_snapshot:
                                    await websocket.send_json({
                                        "type": "transcript_corrected",
                                        "segment_id": segment_id_snapshot,
                                        "text": corrected,
                                        "source_text": text_snapshot,
                                        "start": start_snapshot,
                                        "end": end_snapshot,
                                        "duration_ms": duration_ms
                                    })

                                history.append(corrected or text_snapshot)

                                translated = await translator_instance.translate_text(
                                    corrected or text_snapshot,
                                    context_history,
                                    current_target_language,
                                    extra_context,
                                )
                                if translated is None:
                                    return
                                await websocket.send_json({
                                    "type": "translation",
                                    "segment_id": segment_id_snapshot,
                                    "text": translated,
                                    "source_text": corrected or text_snapshot,
                                    "start": start_snapshot,
                                    "end": end_snapshot,
                                    "duration_ms": duration_ms
                                })

                            asyncio.create_task(
                                translate_and_send(segment_id, text, segment_start, segment_end)
                            )
                    except Exception as e:
                        logger.error(f"ASR Error: {e}")
                    
    except WebSocketDisconnect:
        logger.info("Client disconnected")
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
