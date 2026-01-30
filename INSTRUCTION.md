# **Technical Specification: Chrome Extension for Hybrid AI Transcription & Translation (v5 Custom Pipeline)**

## **1\. Project Overview**

**Goal:** Develop a Chrome Extension that captures tab audio (specifically targeting YouTube/Twitch live streams), streams it to a local backend for processing (ASR \+ Translation), and displays synchronized subtitles in a side panel overlay.

**Core Philosophy:** Low latency, privacy-first (Local ASR), scalable high-quality (Cloud Translation), and automated delivery (CI/CD).

## **2\. System Architecture**

The system follows a **Client-Server** model within a Monorepo.

### **2.1. Hybrid Processing Flow**

To minimize latency for the user, we employ a **Parallel Execution Strategy**:

1. **ASR (Local):** Audio \-\> **Custom VAD Pipeline** \-\> **Faster-Whisper** \-\> **Immediate Display** (Original Language).  
2. **Translation (Cloud/Local):** Text \-\> LLM (Async) \-\> **Update UI** (Target Language).

graph LR  
    subgraph "Chrome Browser (Client)"  
        A\[SidePanel UI\]  
        B\[Tab Capture\]  
        C\[AudioWorklet\]  
    end

    subgraph "Local Server (Backend)"  
        D\[FastAPI Gateway\]  
        E\[VAD Sequencer (Silero)\]  
        F\[Faster-Whisper Engine\]  
        G\[LLM Translator\]  
    end

    B \-- 48kHz Float32 \--\> C  
    C \-- Resample \-\> 16kHz Int16 \--\> C  
    C \-- WebSocket (Binary \+ Time Metadata) \--\> D  
    D \-- Feed Audio Chunks \--\> E  
    E \-- Detect Speech/Silence \--\> E  
    E \-- Trigger Buffer Flush \--\> F  
    F \-- Transcript Event \--\> D  
    D \-- WebSocket Response \--\> A  
    F \-.-\> G  
    G \-- Translation Update \--\> A

## **3\. Monorepo Structure & Tech Stack**

**Root Directory:** ai-streaming-captions/

| **Path** | **Description** | **Tech Stack** |

| apps/extension | The Chrome Extension source code. | **React 18**, **Vite**, **CRXJS**. **Audio:** **AudioWorklet**. **UI:** **shadcn/ui**, **Lucide React**, **Zustand**. |

| apps/server | The Local Python Backend. | **Python 3.10+**, **FastAPI**, **Uvicorn**, **Poetry**. **Core:** **Faster-Whisper**, **Silero-VAD**, **Numpy**. |

| .github/workflows | CI/CD Pipelines. | **GitHub Actions**. |

### **3.1. Detailed Directory Tree**

/  
├── .github/workflows/  
├── apps/  
│   ├── extension/  
│   │   ├── src/  
│   │   │   ├── background/      \# Tab Capture logic  
│   │   │   ├── sidepanel/       \# UI (React)  
│   │   │   ├── lib/  
│   │   │   │   ├── audio-processor.js \# AudioWorklet (Resampling)  
│   │   │   │   └── websocket-client.ts  
│   │   ├── manifest.json  
│   │   └── vite.config.ts  
│   └── server/  
│       ├── core/  
│       │   ├── vad\_sequencer.py \# Custom VAD logic (replacing RealtimeSTT)  
│       │   └── asr\_engine.py    \# Wrapper for Faster-Whisper  
│       ├── api/                 \# Routes  
│       ├── main.py  
│       └── pyproject.toml  
├── package.json  
└── README.md

## **4\. Feature Specifications**

### **4.1. Audio Pipeline (Critical Path)**

* **Client Side (AudioWorklet):**  
  * **Input:** AudioContext from tabCapture (48kHz, Float32).  
  * **Processing:** Downsample to **16kHz**, convert to **Int16 PCM**.  
  * **Output:** Send raw Int16 binary chunks via WebSocket.  
* **Protocol (WebSocket):**  
  * **Binary Message:** Raw Audio Data (Int16).  
  * **JSON Message:** {"type": "sync", "video\_time": 124.5} (Sent periodically).

### **4.2. Backend Logic (Custom Pipeline)**

* **VAD Sequencer (vad\_sequencer.py):**  
  * Uses silero-vad (lightweight ONNX model).  
  * Maintains a RingBuffer of audio chunks.  
  * **State Machine:**  
    * WAITING\_START: Accumulating audio until speech probability \> threshold.  
    * RECORDING: Accumulating speech chunks.  
    * WAITING\_END: Speech probability drops. If silence \> 500ms, flush buffer to ASR.  
  * **Reason:** This removes the dependency on RealtimeSTT and allows fine-tuning for YouTube background music.

## **5\. Development Roadmap (Checklist)**

### **Phase 1: Foundation & Structure**

* **Repo Setup:** Run scaffold.py to create folders and config files.  
* **Backend Skeleton:**  
  * Poetry init with fastapi, uvicorn, faster-whisper, silero-vad.  
  * Implement VADSequencer class (The core replacement).  
  * Create WebSocket Echo that prints "Voice Detected" logs.  
* **Frontend Skeleton:**  
  * Vite \+ React \+ CRXJS init.  
  * Implement AudioWorklet for resampling.  
  * Verify Client Audio \-\> Server VAD detection loop.

### **Phase 2: Core MVP (The "Ear")**

* **ASR Integration:** Connect VADSequencer output to FasterWhisper.  
* **Player Sync:** Inject content script to read video.currentTime and sync with subtitles.  
* **UI Rendering:** Virtualized list for subtitle stream.

### **Phase 3: Intelligence (The "Brain")**

* **Translation Layer:** Async task queue for OpenAI translation.  
* **Settings UI:** Model selection and API key storage.

### **Phase 4: CI/CD & Release**

* **Packaging:** PyInstaller (Server) & Zip (Extension).  
* **GitHub Actions:** Automated release workflow.