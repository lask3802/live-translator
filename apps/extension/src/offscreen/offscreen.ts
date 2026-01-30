import AudioProcessorUrl from '../lib/audio-processor.js?url';

console.log("Offscreen script loaded");
console.log("[Offscreen] UserAgent:", navigator.userAgent);

let audioContext: AudioContext | null = null;
let mediaStream: MediaStream | null = null;
// source and workletNode unused in scope after init? 
// No, they are needed for GC protection or connection.
// But typescript says "unused" if not read.
// We should attach them to window or something, or just suppress usage.
let source: MediaStreamAudioSourceNode | null = null;
let workletNode: AudioWorkletNode | null = null;
let ws: WebSocket | null = null;
let pendingAudioQueue: Int16Array[] = [];
const MAX_PENDING_AUDIO_CHUNKS = 50; // ~ a few seconds depending on chunk size
let warnedWsNotOpen = false;
let currentLanguage = "auto";
let isStopping = false;
let wsEverOpened = false;
let currentTargetLanguage = "zh-Hant";
let currentExtraContext = "";

// Notify background that we are ready
console.log("[Offscreen] Sending OFFSCREEN_LOADED");
chrome.runtime.sendMessage({ type: "OFFSCREEN_LOADED" });

chrome.runtime.onMessage.addListener(async (message, _sender, sendResponse) => {
    console.log("[Offscreen] onMessage:", message?.type, message);
    if (message.type === 'INIT_AUDIO_CAPTURE') {
        const streamId = message.data.streamId;
        currentLanguage = message.data.language || "auto";
        currentTargetLanguage = message.data.targetLanguage || "zh-Hant";
        currentExtraContext = message.data.extraContext || "";
        console.log("Offscreen: Starting capture with streamId", streamId);
        await startCapture(streamId);
    } else if (message.type === 'STOP_CAPTURE') {
        console.log("Offscreen: Stopping capture");
        stopCapture();
    } else if (message.type === 'OFFSCREEN_PING') {
        console.log("[Offscreen] Received OFFSCREEN_PING");
        sendResponse({ ok: true });
        return true;
    } else if (message.type === 'SET_LANGUAGE') {
        currentLanguage = message.data?.language || "auto";
        console.log("[Offscreen] Language updated:", currentLanguage);
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: "config",
                language: currentLanguage,
                target_language: currentTargetLanguage,
                extra_context: currentExtraContext,
            }));
        }
    } else if (message.type === 'SET_TARGET_LANGUAGE') {
        currentTargetLanguage = message.data?.targetLanguage || "zh-Hant";
        console.log("[Offscreen] Target language updated:", currentTargetLanguage);
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: "config",
                language: currentLanguage,
                target_language: currentTargetLanguage,
                extra_context: currentExtraContext,
            }));
        }
    } else if (message.type === 'SET_EXTRA_CONTEXT') {
        currentExtraContext = message.data?.extraContext || "";
        console.log("[Offscreen] Extra context updated:", currentExtraContext ? "(set)" : "(empty)");
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: "config",
                language: currentLanguage,
                target_language: currentTargetLanguage,
                extra_context: currentExtraContext,
            }));
        }
    }
    console.log("[Offscreen] onMessage handler finished for", message?.type);
});

let audioChunkCount = 0;
let lastLogTime = 0;

async function startCapture(streamId: string) {
    try {
        isStopping = false;
        console.log("[Offscreen] startCapture begin");
        console.log("[Offscreen] Requesting getUserMedia with tab capture...", { streamId });
        mediaStream = await navigator.mediaDevices.getUserMedia({
            audio: {
                mandatory: {
                    chromeMediaSource: 'tab',
                    chromeMediaSourceId: streamId
                }
            } as any,
            video: false
        });
        console.log("[Offscreen] getUserMedia SUCCESS - tracks:", mediaStream.getTracks().map(t => ({ kind: t.kind, label: t.label, enabled: t.enabled })));

        // Create AudioContext
        console.log("[Offscreen] Creating AudioContext...");
        audioContext = new AudioContext({ sampleRate: 48000 }); // Default
        console.log("[Offscreen] AudioContext created, state:", audioContext.state, "rate:", audioContext.sampleRate);

        // Resume AudioContext if suspended (autoplay policy)
        if (audioContext.state === 'suspended') {
            console.log("[Offscreen] AudioContext suspended, attempting to resume...");
            console.log("[Offscreen] AudioContext resume() starting...");
            await audioContext.resume();
            console.log("[Offscreen] AudioContext resumed, state:", audioContext.state);
        }

        source = audioContext.createMediaStreamSource(mediaStream);
        console.log("[Offscreen] MediaStreamSource created");

        // Load AudioWorklet
        // Note: in Vite, we handle worklet path carefully via ?url import.
        console.log("[Offscreen] Loading AudioWorklet from:", AudioProcessorUrl);
        await audioContext.audioWorklet.addModule(AudioProcessorUrl);
        console.log("[Offscreen] AudioWorklet module loaded");

        workletNode = new AudioWorkletNode(audioContext, 'audio-processor');
        console.log("[Offscreen] AudioWorkletNode created");

        // IMPORTANT: Split the audio path
        // 1. Source -> Destination (for playback - so user can hear the video)
        // 2. Source -> Worklet (for processing and sending to server)
        source.connect(audioContext.destination); // Playback path
        source.connect(workletNode);              // Processing path
        console.log("[Offscreen] Audio graph connected: Source -> Destination + Worklet");
        // Note: workletNode does NOT connect to destination since it doesn't output audio

        // Connect WS
        console.log("[Offscreen] Connecting WebSocket...");
        connectWebSocket();

        // Reset chunk counter
        audioChunkCount = 0;
        lastLogTime = Date.now();

        // Handle data from worklet
        workletNode.port.onmessage = (event) => {
            if (isStopping) {
                return;
            }
            audioChunkCount++;
            const now = Date.now();
            
            // Log every 5 seconds to avoid spam
            if (now - lastLogTime >= 5000) {
                console.log(`[Offscreen] Audio chunks sent in last 5s: ${audioChunkCount}, WS state: ${ws?.readyState}`);
                audioChunkCount = 0;
                lastLogTime = now;
            }
            
            if (ws && ws.readyState === WebSocket.OPEN) {
                // event.data is Int16Array
                ws.send(event.data);
            } else {
                if (!warnedWsNotOpen) {
                    console.warn("[Offscreen] WS not open, queueing audio. State:", ws?.readyState);
                    warnedWsNotOpen = true;
                }
                if (pendingAudioQueue.length >= MAX_PENDING_AUDIO_CHUNKS) {
                    pendingAudioQueue.shift();
                }
                pendingAudioQueue.push(event.data);
            }
        };

        console.log("[Offscreen] Capture setup complete");

    } catch (err) {
        console.error("[Offscreen] Error in startCapture:", err);
    }
}

function connectWebSocket() {
    console.log("[Offscreen] Connecting WebSocket to ws://127.0.0.1:8001/ws/audio ...");
    ws = new WebSocket("ws://127.0.0.1:8001/ws/audio");
    
    ws.onopen = () => {
        wsEverOpened = true;
        console.log("[Offscreen] ✓ WebSocket CONNECTED to server");
        // Notify sidepanel that connection is established
        chrome.runtime.sendMessage({ type: "WS_CONNECTED" });
        ws?.send(JSON.stringify({
            type: "config",
            language: currentLanguage,
            target_language: currentTargetLanguage,
            extra_context: currentExtraContext,
        }));
        if (pendingAudioQueue.length > 0) {
            console.log("[Offscreen] Flushing queued audio chunks:", pendingAudioQueue.length);
            pendingAudioQueue.forEach(chunk => ws?.send(chunk));
            pendingAudioQueue = [];
        }
        warnedWsNotOpen = false;
    };
    
    ws.onclose = (event) => {
        console.log("[Offscreen] WebSocket CLOSED - code:", event.code, "reason:", event.reason, "wasClean:", event.wasClean);
        chrome.runtime.sendMessage({ type: "WS_DISCONNECTED" });
        if (!isStopping && !wsEverOpened) {
            chrome.runtime.sendMessage({
                type: "SERVER_ERROR",
                message: "Server is not running or refused the connection."
            });
            stopCapture();
        }
    };
    
    ws.onerror = (e) => {
        console.error("[Offscreen] WebSocket ERROR:", e);
        console.error("[Offscreen] Make sure the server is running on port 8001!");
        if (!isStopping && !wsEverOpened) {
            chrome.runtime.sendMessage({
                type: "SERVER_ERROR",
                message: "Cannot connect to server. Please start the server and try again."
            });
            stopCapture();
        }
    };
    
    // Forward server messages to sidepanel via chrome.runtime
    ws.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            console.log("[Offscreen] ← Server message:", data.type, data.type === 'transcript' ? data.text : '');
            // Relay transcript and VAD events to sidepanel
            chrome.runtime.sendMessage({ 
                type: "SERVER_MESSAGE", 
                payload: data 
            });
        } catch (err) {
            console.error("[Offscreen] Failed to parse WS message:", err, "raw:", event.data);
        }
    };
}

function stopCapture() {
    console.log("[Offscreen] stopCapture begin");
    isStopping = true;
    if (mediaStream) {
        mediaStream.getTracks().forEach(t => t.stop());
        mediaStream = null;
    }
    if (workletNode) {
        workletNode.port.onmessage = null;
        try {
            workletNode.disconnect();
        } catch (e) {
            // ignore disconnect errors
        }
        workletNode = null;
    }
    if (source) {
        try {
            source.disconnect();
        } catch (e) {
            // ignore disconnect errors
        }
        source = null;
    }
    if (ws) {
        ws.close();
        ws = null;
    }
    if (audioContext) {
        audioContext.close();
        audioContext = null;
    }
    pendingAudioQueue = [];
    warnedWsNotOpen = false;
    console.log("[Offscreen] stopCapture done");
}
