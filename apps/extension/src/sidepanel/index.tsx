import React, { useEffect, useState, useRef } from "react";
import ReactDOM from "react-dom/client";
import { Mic, MicOff, Settings, RefreshCw } from "lucide-react";
import "../index.css";

interface TranscriptSegment {
    text: string;
    start: number;
    end: number;
    duration_ms?: number;
}

function App() {
    const [isRecording, setIsRecording] = useState(false);
    const [status, setStatus] = useState("Ready");
    const [transcripts, setTranscripts] = useState<TranscriptSegment[]>([]);
    const [activeTab, setActiveTab] = useState<chrome.tabs.Tab | null>(null);
    const [pendingStreamId, setPendingStreamId] = useState<string | null>(null);
    const bottomRef = useRef<HTMLDivElement>(null);

    // Request cached streamId when SidePanel opens
    useEffect(() => {
        (async () => {
            try {
                const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
                if (!tab?.id) {
                    setStatus("No active tab detected");
                    return;
                }

                setActiveTab(tab);

                // Check for restricted pages
                if (tab.url?.startsWith("chrome://") || tab.url?.startsWith("edge://") || tab.url?.includes("webstore")) {
                    setStatus("Cannot capture this system page");
                    return;
                }

                chrome.runtime.sendMessage({ type: "GET_STREAM_ID", tabId: tab.id }, (res) => {
                    if (res?.success && res.streamId) {
                        console.log("SidePanel received cached streamId");
                        setPendingStreamId(res.streamId);
                        setStatus("Ready to start");
                    } else {
                        setPendingStreamId(null);
                        setStatus(res?.error || "Click the extension icon on a valid page first.");
                    }
                });
            } catch (err: any) {
                console.error("Error capturing streamId:", err);
                setStatus("Failed to capture stream: " + err.message);
            }
        })();
    }, []);

    // Refresh function to reload streamId
    const handleRefresh = async () => {
        try {
            setStatus("Refreshing...");
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab?.id) {
                setStatus("No active tab detected");
                return;
            }

            setActiveTab(tab);

            if (tab.url?.startsWith("chrome://") || tab.url?.startsWith("edge://") || tab.url?.includes("webstore")) {
                setStatus("Cannot capture this system page");
                setPendingStreamId(null);
                return;
            }

            chrome.runtime.sendMessage({ type: "GET_STREAM_ID", tabId: tab.id }, (res) => {
                if (res?.success && res.streamId) {
                    console.log("Refreshed: received cached streamId");
                    setPendingStreamId(res.streamId);
                    setStatus("Ready to start");
                } else {
                    setPendingStreamId(null);
                    setStatus(res?.error || "Click the extension icon on a valid page first.");
                }
            });
        } catch (err: any) {
            console.error("Error refreshing:", err);
            setStatus("Failed to refresh: " + err.message);
        }
    };

    // Monitor active tab
    useEffect(() => {
        const updateActiveTab = async () => {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            setActiveTab(tab || null);
        };

        updateActiveTab();

        const onActivated = () => updateActiveTab();
        const onUpdated = () => updateActiveTab();

        chrome.tabs.onActivated.addListener(onActivated);
        chrome.tabs.onUpdated.addListener(onUpdated);

        return () => {
            chrome.tabs.onActivated.removeListener(onActivated);
            chrome.tabs.onUpdated.removeListener(onUpdated);
        };
    }, []);

    // Auto-scroll
    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [transcripts]);

    // Listen for server messages relayed from offscreen via chrome.runtime
    useEffect(() => {
        const messageListener = (message: any) => {
            if (message.type === "SERVER_MESSAGE") {
                const data = message.payload;
                if (data.type === "transcript") {
                    setTranscripts(prev => [...prev, data]);
                } else if (data.type === "vad_start") {
                    setStatus("Listening...");
                } else if (data.type === "vad_commit") {
                    setStatus("Processing...");
                }
            } else if (message.type === "WS_CONNECTED") {
                console.log("Offscreen WS connected to server");
            } else if (message.type === "WS_DISCONNECTED") {
                console.log("Offscreen WS disconnected from server");
                if (isRecording) {
                    setStatus("Server disconnected");
                }
            }
        };

        chrome.runtime.onMessage.addListener(messageListener);

        return () => {
            chrome.runtime.onMessage.removeListener(messageListener);
        };
    }, [isRecording]);

    const toggleRecording = async () => {
        if (isRecording) {
            chrome.runtime.sendMessage({ type: "STOP_RECORDING" }, (res) => {
                if (res?.status === "stopped") {
                    setIsRecording(false);
                    setStatus("Stopped");
                }
            });
        } else {
            const startWithStreamId = (streamId: string | null) => {
                if (!streamId) {
                    alert("No stream captured. Please click the extension icon on a valid webpage first, then try again.");
                    return;
                }

                chrome.runtime.sendMessage({
                    type: "START_RECORDING",
                    streamId
                }, (res) => {
                    if (res?.success) {
                        setIsRecording(true);
                        setStatus("Listening...");
                        setPendingStreamId(null); // Clear after use
                    } else {
                        console.error("Failed to start:", res?.error);
                        alert("Error: " + (res?.error || "Failed to start recording"));
                    }
                });
            };

            if (pendingStreamId) {
                startWithStreamId(pendingStreamId);
                return;
            }

            const tabId = activeTab?.id;
            if (!tabId) {
                alert("No active tab detected.");
                return;
            }

            chrome.runtime.sendMessage({ type: "GET_STREAM_ID", tabId }, (res) => {
                if (res?.success && res.streamId) {
                    setPendingStreamId(res.streamId);
                    startWithStreamId(res.streamId);
                } else {
                    alert(res?.error || "Click the extension icon on the target tab first.");
                }
            });
        }
    };

    return (
        <div className="flex flex-col h-screen bg-gray-900 text-white p-4 font-sans">
            <header className="flex justify-between items-center mb-2 border-b border-gray-700 pb-2">
                <h1 className="text-lg font-bold">Live Translator</h1>
                <div className="flex gap-1">
                    <button
                        onClick={handleRefresh}
                        className="p-2 hover:bg-gray-800 rounded transition-colors"
                        title="Refresh stream"
                    >
                        <RefreshCw size={18} className={status === "Refreshing..." ? "animate-spin" : ""} />
                    </button>
                    <button className="p-2 hover:bg-gray-800 rounded">
                        <Settings size={20} />
                    </button>
                </div>
            </header>

            {/* Debug Info: Active Tab */}
            <div className="mb-2 px-2 py-1 bg-gray-800 rounded text-xs text-gray-400 border border-gray-700">
                <div className="truncate">
                    <span className="font-semibold text-gray-300">Target:</span> {activeTab?.title || "Unknown"}
                </div>
                <div className="truncate text-gray-500">
                    {activeTab?.url || "No URL"}
                </div>
                {pendingStreamId && (
                    <div className="text-green-400 mt-1">✓ Stream ready</div>
                )}
            </div>

            <div className="flex-1 overflow-y-auto space-y-4 pr-2">
                {transcripts.length === 0 && (
                    <div className="text-gray-500 text-center mt-10">
                        {pendingStreamId
                            ? "Click Start to begin transcription."
                            : "Click the extension icon on a valid page first."}
                    </div>
                )}

                {transcripts.map((t, i) => (
                    <div key={i} className="bg-gray-800 p-3 rounded-lg animate-in fade-in slide-in-from-bottom-2">
                        <p className="text-gray-100">{t.text}</p>
                        <span className="text-xs text-gray-500 mt-1 block">
                            {t.start.toFixed(1)}s - {t.end.toFixed(1)}s
                        </span>
                    </div>
                ))}
                <div ref={bottomRef} />
            </div>

            <footer className="mt-4 pt-2 border-t border-gray-700">
                <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-400 capitalize">{status}</span>
                    <button
                        onClick={toggleRecording}
                        disabled={!pendingStreamId && !isRecording}
                        className={`flex items-center gap-2 px-4 py-2 rounded-full font-medium transition-colors ${isRecording
                            ? "bg-red-500 hover:bg-red-600 text-white"
                            : pendingStreamId
                                ? "bg-green-500 hover:bg-green-600 text-white"
                                : "bg-gray-600 text-gray-400 cursor-not-allowed"
                            }`}
                    >
                        {isRecording ? <MicOff size={16} /> : <Mic size={16} />}
                        {isRecording ? "Stop" : "Start"}
                    </button>
                </div>
            </footer>
        </div>
    );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>
);
