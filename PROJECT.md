# Project Scope: Live Translator (Hybrid AI Transcription & Translation)

## 1. Project Overview

**Goal:** Develop a Chrome Extension that captures tab audio (specifically targeting YouTube/Twitch live streams), streams it to a local backend for processing (ASR + Translation), and displays synchronized subtitles in a side panel overlay.

**Core Philosophy:**
- **Low Latency:** Optimized for real-time viewing.
- **Privacy-First:** Local ASR processing.
- **Scalable Quality:** Cloud-ready Translation (initially Async LLM).
- **Automated Delivery:** CI/CD pipeline.

## 2. System Architecture

The system follows a **Client-Server** model within a Monorepo.

### 2.1. Hybrid Processing Flow

We employ a **Parallel Execution Strategy** to minimize latency:

1.  **ASR (Local):** Audio -> **Custom VAD Pipeline** -> **Faster-Whisper** -> **Immediate Display** (Original Language).
2.  **Translation (Cloud/Local):** Text -> LLM (Async) -> **Update UI** (Target Language).

### 2.2. Data Flow

1.  **Chrome Browser (Client):** Captures 48kHz Float32 audio via `Tab Capture`, resamples to 16kHz Int16 in `AudioWorklet`, and streams via WebSocket to the server.
2.  **Local Server (Backend):**
    -   Receives audio chunks via `FastAPI`.
    -   `VAD Sequencer (Silero)` detects speech segments.
    -   Triggers `Faster-Whisper` for transcription upon silence/buffer full.
    -   Sends "Transcript Event" back to UI.
    -   Asynchronously sends text to `LLM Translator`.
    -   Sends "Translation Update" back to UI.

## 3. Monorepo Structure & Tech Stack

**Root Path:** `r:\repos\live-translator`

| Component | Path | Tech Stack |
| :--- | :--- | :--- |
| **Extension** | `apps/extension` | **React 18**, **Vite**, **CRXJS**, **AudioWorklet**, **shadcn/ui**, **Zustand**, **Lucide React**. |
| **Backend** | `apps/server` | **Python 3.10+**, **FastAPI**, **Uvicorn**, **Poetry**, **Faster-Whisper**, **Silero-VAD**, **Numpy**. |
| **CI/CD** | `.github/workflows` | **GitHub Actions**. |

## 4. Feature Specifications

### 4.1. Audio Pipeline (Client)
-   **Input:** AudioContext (48kHz, Float32).
-   **Processing:** Downsample to 16kHz, convert to Int16 PCM.
-   **Protocol:** WebSocket (Binary Int16 chunks + JSON Sync metadata).

### 4.2. Backend Logic (Server)
-   **VAD Sequencer (`vad_sequencer.py`):**
    -   Uses `silero-vad` (ONNX).
    -   Maintains audio RingBuffer.
    -   **States:** `WAITING_START` -> `RECORDING` -> `WAITING_END` (Flush to ASR).
    -   Purpose: Removes `RealtimeSTT` dependency, optimizes for background music.

## 5. Development Roadmap

### Phase 1: Foundation & Structure
-   [ ] Repo Setup (Scaffold).
-   [ ] Backend Skeleton (Poetry, FastAPI, VADSequencer class).
-   [ ] Frontend Skeleton (Vite, React, AudioWorklet).
-   [ ] Verify Loop: Client Audio -> Server VAD detection.

### Phase 2: Core MVP (The "Ear")
-   [ ] ASR Integration (FasterWhisper).
-   [ ] Player Sync (Content Script).
-   [ ] UI Rendering (Virtualized Subtitles).

### Phase 3: Intelligence (The "Brain")
-   [ ] Translation Layer (Async OpenAI).
-   [ ] Settings UI.

### Phase 4: CI/CD & Release
-   [ ] Packaging (PyInstaller, Zip).
-   [ ] GitHub Actions.
