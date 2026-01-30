import os
import logging
import json
from collections import OrderedDict
import asyncio
import uuid
import websockets

try:
    from openai import AsyncOpenAI
except Exception:  # pragma: no cover - optional dependency at runtime
    AsyncOpenAI = None

logger = logging.getLogger("Translator")


class Translator:
    def __init__(self):
        self.api_key = os.getenv("OPENAI_API_KEY")
        self.model = os.getenv("TRANSLATION_MODEL", "gpt-4o-mini")
        self.target_language = os.getenv("TARGET_LANGUAGE", "zh-TW")
        self.realtime_model = os.getenv("REALTIME_MODEL", "gpt-realtime")
        self.use_realtime = os.getenv("USE_REALTIME", "true").lower() in {"1", "true", "yes"}
        self.client = None
        self._cache: OrderedDict[str, str] = OrderedDict()
        self._cache_max = 200
        self._realtime_ws = None
        self._realtime_lock = asyncio.Lock()

        logger.info(f"Translator target language: {self.target_language}")
        logger.info(f"Translator model: {self.model}")
        logger.info(f"Realtime enabled: {self.use_realtime}")
        logger.info(f"Realtime model: {self.realtime_model}")

        if self.api_key and AsyncOpenAI:
            self.client = AsyncOpenAI(api_key=self.api_key)
            logger.info("Translator enabled.")
        elif not self.api_key:
            logger.info("OPENAI_API_KEY not set. Translation disabled.")
        elif not AsyncOpenAI:
            logger.warning("openai package not available. Translation disabled.")

    async def correct_text(self, text: str, history: list[str]) -> str:
        if not text.strip():
            return ""

        if not self.client:
            return text

        cache_key = self._make_cache_key(
            "correct",
            text,
            history,
            extra_context=None,
            target_language=None,
        )
        cached = self._cache_get(cache_key)
        if cached is not None:
            return cached

        instructions = (
            "You correct ASR transcripts using context. "
            "Do NOT repeat the history. "
            "Only return the corrected version of the current transcript. "
            "Output JSON only: {\"corrected_text\": \"...\"}."
        )
        payload = json.dumps(
            {"history": history, "current_transcript": text},
            ensure_ascii=False,
        )

        if self.use_realtime and self.api_key:
            try:
                result = await self._realtime_request(instructions, payload)
                data = json.loads(result or "{}")
                corrected = data.get("corrected_text", text) or text
                self._cache_set(cache_key, corrected)
                return corrected
            except Exception as e:
                logger.error(f"Realtime correction error: {e}")

        try:
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": instructions},
                    {"role": "user", "content": payload},
                ],
                response_format={"type": "json_object"},
            )
            raw = response.choices[0].message.content or "{}"
            data = json.loads(raw)
            corrected = data.get("corrected_text", text) or text
            self._cache_set(cache_key, corrected)
            return corrected
        except Exception as e:
            logger.error(f"Correction error: {e}")
            return text

    async def translate_text(
        self,
        text: str,
        history: list[str],
        target_language: str | None = None,
        extra_context: str | None = None,
    ) -> str | None:
        if not self.client:
            return None

        if not text.strip():
            return ""

        resolved_target = target_language or self.target_language

        cache_key = self._make_cache_key(
            "translate",
            text,
            history,
            extra_context=extra_context,
            target_language=resolved_target,
        )
        cached = self._cache_get(cache_key)
        if cached is not None:
            return cached

        instructions = (
            "You translate text using context. "
            "Do NOT repeat the history. "
            "Only return the translation of the current text. "
            "Output JSON only: {\"translated_text\": \"...\"}."
        )
        payload = json.dumps(
            {
                "target_language": resolved_target,
                "history": history,
                "extra_context": extra_context or "",
                "current_text": text,
            },
            ensure_ascii=False,
        )

        if self.use_realtime and self.api_key:
            try:
                result = await self._realtime_request(instructions, payload)
                data = json.loads(result or "{}")
                translated = data.get("translated_text", "")
                self._cache_set(cache_key, translated)
                return translated
            except Exception as e:
                logger.error(f"Realtime translation error: {e}")

        try:
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": instructions},
                    {"role": "user", "content": payload},
                ],
                response_format={"type": "json_object"},
            )
            raw = response.choices[0].message.content or "{}"
            data = json.loads(raw)
            translated = data.get("translated_text", "")
            self._cache_set(cache_key, translated)
            return translated
        except Exception as e:
            logger.error(f"Translation error: {e}")
            return None

    async def _realtime_request(self, instructions: str, user_payload: str) -> str:
        await self._ensure_realtime_connection()
        request_id = uuid.uuid4().hex
        event = {
            "type": "response.create",
            "response": {
                "conversation": "none",
                "metadata": {"request_id": request_id},
                "output_modalities": ["text"],
                "instructions": instructions,
                "input": [
                    {
                        "type": "message",
                        "role": "user",
                        "content": [
                            {"type": "input_text", "text": user_payload}
                        ],
                    }
                ],
            },
        }

        async with self._realtime_lock:
            await self._realtime_ws.send(json.dumps(event, ensure_ascii=False))
            while True:
                raw = await self._realtime_ws.recv()
                server_event = json.loads(raw)
                if server_event.get("type") == "error":
                    raise RuntimeError(server_event.get("message", "Realtime error"))

                if server_event.get("type") == "response.done":
                    response = server_event.get("response", {})
                    metadata = response.get("metadata", {})
                    if metadata.get("request_id") != request_id:
                        continue
                    return self._extract_text_response(response)

    async def _ensure_realtime_connection(self) -> None:
        if self._realtime_ws and not self._realtime_ws.closed:
            return

        if not self.api_key:
            raise RuntimeError("OPENAI_API_KEY not set for realtime")

        url = f"wss://api.openai.com/v1/realtime?model={self.realtime_model}"
        self._realtime_ws = await websockets.connect(
            url,
            extra_headers={"Authorization": f"Bearer {self.api_key}"},
        )

        session_update = {
            "type": "session.update",
            "session": {
                "type": "realtime",
                "output_modalities": ["text"],
            },
        }
        await self._realtime_ws.send(json.dumps(session_update))

    def _extract_text_response(self, response: dict) -> str:
        output = response.get("output", [])
        for item in output:
            content = item.get("content", []) if isinstance(item, dict) else []
            for part in content:
                if isinstance(part, dict) and "text" in part:
                    return part.get("text", "")
        return ""

    def _make_cache_key(
        self,
        mode: str,
        text: str,
        history: list[str],
        extra_context: str | None,
        target_language: str | None,
    ) -> str:
        payload = {
            "mode": mode,
            "text": text,
            "history": history,
            "extra_context": extra_context or "",
            "target_language": target_language or "",
            "model": self.model,
        }
        return json.dumps(payload, ensure_ascii=False, sort_keys=True)

    def _cache_get(self, key: str) -> str | None:
        if key in self._cache:
            self._cache.move_to_end(key)
            return self._cache[key]
        return None

    def _cache_set(self, key: str, value: str) -> None:
        self._cache[key] = value
        self._cache.move_to_end(key)
        if len(self._cache) > self._cache_max:
            self._cache.popitem(last=False)