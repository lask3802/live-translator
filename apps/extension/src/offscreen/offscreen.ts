import AudioProcessorUrl from '../lib/audio-processor.js?url';

console.log("Offscreen script loaded");

let audioContext: AudioContext | null = null;
let mediaStream: MediaStream | null = null;
// source and workletNode unused in scope after init? 
// No, they are needed for GC protection or connection.
// But typescript says "unused" if not read.
// We should attach them to window or something, or just suppress usage.
let source: MediaStreamAudioSourceNode | null = null;
let workletNode: AudioWorkletNode | null = null;
let ws: WebSocket | null = null;

// Notify background that we are ready
chrome.runtime.sendMessage({ type: "OFFSCREEN_LOADED" });

chrome.runtime.onMessage.addListener(async (message, _sender, sendResponse) => {
    if (message.type === 'INIT_AUDIO_CAPTURE') {
        const streamId = message.data.streamId;
        console.log("Offscreen: Starting capture with streamId", streamId);
        await startCapture(streamId);
    } else if (message.type === 'STOP_CAPTURE') {
        console.log("Offscreen: Stopping capture");
        stopCapture();
    } else if (message.type === 'OFFSCREEN_PING') {
        sendResponse({ ok: true });
        return true;
    }
});

let audioChunkCount = 0;
let lastLogTime = 0;

async function startCapture(streamId: string) {
    try {
        console.log("[Offscreen] Requesting getUserMedia with tab capture...");
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
        audioContext = new AudioContext({ sampleRate: 48000 }); // Default
        console.log("[Offscreen] AudioContext created, state:", audioContext.state, "rate:", audioContext.sampleRate);

        // Resume AudioContext if suspended (autoplay policy)
        if (audioContext.state === 'suspended') {
            console.log("[Offscreen] AudioContext suspended, attempting to resume...");
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
        connectWebSocket();

        // Reset chunk counter
        audioChunkCount = 0;
        lastLogTime = Date.now();

        // Handle data from worklet
        workletNode.port.onmessage = (event) => {
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
                // Log only occasionally to avoid spam
                if (audioChunkCount === 1) {
                    console.warn("[Offscreen] WS not open, cannot send audio. State:", ws?.readyState);
                }
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
        console.log("[Offscreen] ✓ WebSocket CONNECTED to server");
        // Notify sidepanel that connection is established
        chrome.runtime.sendMessage({ type: "WS_CONNECTED" });
    };
    
    ws.onclose = (event) => {
        console.log("[Offscreen] WebSocket CLOSED - code:", event.code, "reason:", event.reason, "wasClean:", event.wasClean);
        chrome.runtime.sendMessage({ type: "WS_DISCONNECTED" });
    };
    
    ws.onerror = (e) => {
        console.error("[Offscreen] WebSocket ERROR:", e);
        console.error("[Offscreen] Make sure the server is running on port 8001!");
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
    if (mediaStream) {
        mediaStream.getTracks().forEach(t => t.stop());
        mediaStream = null;
    }
    if (ws) {
        ws.close();
        ws = null;
    }
    if (audioContext) {
        audioContext.close();
        audioContext = null;
    }
}
