console.log("Background service worker loaded");

let isRecording = false;
let offscreenReady = false;
let cachedStreamId: string | null = null;
let cachedTabId: number | null = null;
let cachedAt = 0;
const STREAM_CACHE_TTL_MS = 60_000; // 1 minute

// CRITICAL: We MUST disable auto-open to handle the click ourselves.
// This allows us to capture the streamId (requires gesture) AND open the panel (requires gesture)
// in parallel off the same click event.
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false })
    .then(() => console.log("SidePanel behavior set: openPanelOnActionClick = false"))
    .catch((err) => console.error("Failed to set panel behavior:", err));

// Capture streamId AND open panel on action click
chrome.action.onClicked.addListener(async (tab) => {
    try {
        if (!tab?.id || !tab.windowId) return;

        console.log("Action clicked for tab:", tab.id);

        if (tab.url?.startsWith("chrome://") || tab.url?.startsWith("edge://") || tab.url?.includes("webstore")) {
            console.warn("Cannot capture system page", tab.url);
            cachedStreamId = null;
            // Just open the panel to show the error state
            await chrome.sidePanel.open({ windowId: tab.windowId });
            return;
        }

        // EXECUTE IN PARALLEL!
        // Both APIs require a user gesture. usage of 'await' between them might consume it.
        // Running them concurrently ensures both see the active gesture.
        const openPanelPromise = chrome.sidePanel.open({ windowId: tab.windowId });

        const capturePromise = chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id })
            .then(streamId => {
                console.log("Captured streamId:", streamId);
                cachedStreamId = streamId;
                cachedTabId = tab.id!;
                cachedAt = Date.now();
            })
            .catch(err => {
                console.error("Failed to capture streamId:", err);
                cachedStreamId = null;
            });

        await Promise.all([openPanelPromise, capturePromise]);

    } catch (err) {
        console.error("Error in action handler:", err);
    }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === "GET_STREAM_ID") {
        const now = Date.now();
        const isFresh = cachedStreamId && (now - cachedAt) < STREAM_CACHE_TTL_MS;
        const matchesTab = cachedTabId && message.tabId && cachedTabId === message.tabId;

        console.log("GET_STREAM_ID request:", { msgTab: message.tabId, cachedTab: cachedTabId, isFresh, hasStream: !!cachedStreamId });

        if (isFresh && matchesTab) {
            sendResponse({ success: true, streamId: cachedStreamId });
        } else {
            sendResponse({
                success: false,
                error: "Stream not captured. Please click the extension icon again."
            });
        }
        return true;
    }
    if (message.type === "START_RECORDING") {
        const { streamId } = message;
        console.log("Received START_RECORDING with streamId", streamId);
        startRecording(streamId).then(result => {
            sendResponse(result);
        });
        return true; // Keep channel open for async response
    } else if (message.type === "STOP_RECORDING") {
        console.log("Received STOP_RECORDING");
        stopRecording().then(() => {
            sendResponse({ status: "stopped" });
        });
        return true;
    }
    if (message.type === "OFFSCREEN_LOADED") {
        console.log("Offscreen loaded signal received");
        offscreenReady = true;
        return true;
    }
    return true;
});

async function startRecording(streamId: string): Promise<{ success: boolean; error?: string }> {
    if (isRecording) {
        return { success: false, error: "Already recording" };
    }

    if (!streamId) {
        return { success: false, error: "No stream ID provided." };
    }

    try {
        console.log("Starting offscreen capture with streamId:", streamId);

        // Create document and wait for handshake
        await setupOffscreenDocument("src/offscreen/offscreen.html");

        // No arbitrary timeout needed if we trust the handshake, but for robustness
        // we'll wait a tiny bit or trust the message flow. 
        // Actually, since createDocument is async, we still need to wait for the loaded signal?
        // The standard pattern is create -> wait for message.
        // But createDocument promise resolves when the *creation* is requested, not loaded.

        // Simple robust fix: Use a polling retry for sendMessage if it fails, OR just wait slightly longer.
        // Given we added the message in offscreen.ts, we should wait for it.
        // But implementing a one-off promise waiter for a global event listener is complex.
        // Let's stick to a robust waitFor ready check.

        await waitForOffscreenReady();

        console.log("Sending INIT_AUDIO_CAPTURE to offscreen...");
        await chrome.runtime.sendMessage({
            type: "INIT_AUDIO_CAPTURE",
            data: { streamId }
        });

        isRecording = true;
        return { success: true };
    } catch (err: any) {
        console.error("Error starting recording:", err);
        return { success: false, error: err.message || "Unknown error starting capture" };
    }
}

// Helper to wait for offscreen readiness
async function waitForOffscreenReady() {
    if (offscreenReady) return;

    const timeoutMs = 5_000;
    const intervalMs = 200;
    const start = Date.now();

    while (Date.now() - start < timeoutMs) {
        try {
            const res = await chrome.runtime.sendMessage({ type: "OFFSCREEN_PING" });
            if (res?.ok) {
                offscreenReady = true;
                return;
            }
        } catch (err) {
            // Offscreen not ready yet
        }
        await new Promise(r => setTimeout(r, intervalMs));
    }

    throw new Error("Offscreen document did not become ready in time.");
}

async function stopRecording() {
    if (!isRecording) return;
    try {
        await chrome.runtime.sendMessage({ type: "STOP_CAPTURE" });
    } catch (e) {
        // Offscreen might be gone
    }

    try {
        await chrome.offscreen.closeDocument();
    } catch (e) {
        console.log("Offscreen already closed");
    }

    isRecording = false;
    offscreenReady = false;
}

async function setupOffscreenDocument(path: string) {
    const existing = await chrome.runtime.getContexts({
        contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT]
    });
    if (existing.length > 0) return;

    console.log("Creating Offscreen Document...");
    offscreenReady = false;
    await chrome.offscreen.createDocument({
        url: path,
        reasons: [chrome.offscreen.Reason.USER_MEDIA],
        justification: "Live Translator Audio Capture"
    });
}
