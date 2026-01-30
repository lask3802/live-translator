<div align="center">

# 🌐 Live Translator

**Real-time AI-powered transcription and translation for live streams**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Chrome Extension](https://img.shields.io/badge/Platform-Chrome%20Extension-4285F4?logo=googlechrome)](https://developer.chrome.com/docs/extensions/)
[![Python 3.10+](https://img.shields.io/badge/Python-3.10+-3776AB?logo=python&logoColor=white)](https://www.python.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.100+-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![React](https://img.shields.io/badge/React-18+-61DAFB?logo=react&logoColor=black)](https://reactjs.org/)

[Features](#-features) • [Installation](#-installation) • [Quick Start](#-quick-start) • [Architecture](#-architecture) • [Contributing](#-contributing)

</div>

---

## ✨ Features

- 🎙️ **Real-time Transcription** - Local ASR processing using Faster-Whisper for low latency
- 🌍 **Live Translation** - Async LLM-powered translation to your target language
- 🔒 **Privacy-First** - Audio processing runs locally on your machine
- 🎯 **Platform Support** - Optimized for YouTube and Twitch live streams
- ⚡ **Low Latency** - Parallel execution strategy for minimal delay
- 🎨 **Clean UI** - Elegant side panel with synchronized subtitles

## 📋 Prerequisites

Before you begin, ensure you have the following installed:

| Requirement | Version | Installation Guide |
|-------------|---------|-------------------|
| **Node.js** | 18.x or higher | [nodejs.org](https://nodejs.org/) |
| **Python** | 3.10 or higher | [python.org](https://www.python.org/) |
| **Poetry** | Latest | [python-poetry.org](https://python-poetry.org/docs/#installation) |
| **Git** | Latest | [git-scm.com](https://git-scm.com/) |

### GPU Support (Recommended)

For optimal ASR performance, CUDA-enabled GPU is recommended:
- NVIDIA GPU with CUDA 11.x or 12.x
- [cuDNN](https://developer.nvidia.com/cudnn) installed

## 🚀 Installation

### 1. Clone the Repository

```bash
git clone https://github.com/YOUR_USERNAME/live-translator.git
cd live-translator
```

### 2. Set Up the Backend Server

```bash
# Navigate to server directory
cd apps/server

# Install dependencies with Poetry
poetry install

# Download required models (first run will auto-download)
# - Faster-Whisper model (~1GB)
# - Silero VAD model (~2MB)
```

### 3. Set Up the Chrome Extension

```bash
# Navigate to extension directory
cd apps/extension

# Install dependencies
npm install

# Build the extension
npm run build
```

### 4. Load the Extension in Chrome

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable **Developer mode** (toggle in top-right corner)
3. Click **Load unpacked**
4. Select the `apps/extension/dist` folder

## 🎮 Quick Start

### Starting the Backend Server

**Windows (PowerShell):**
```powershell
cd apps/server
.\start.ps1
```

**Linux/macOS:**
```bash
cd apps/server
./start.sh
```

**Or manually:**
```bash
cd apps/server
poetry run uvicorn main:app --host 127.0.0.1 --port 8765 --reload
```

The server will start at `ws://127.0.0.1:8765`

### Using the Extension

1. Navigate to a YouTube or Twitch live stream
2. Click the Live Translator extension icon
3. Click **Start Capture** to begin transcription
4. View real-time subtitles in the side panel

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Chrome Browser                            │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────┐   │
│  │   Content    │    │  Background  │    │    Side Panel    │   │
│  │   Script     │───▶│   Service    │───▶│   (React UI)     │   │
│  │              │    │   Worker     │    │                  │   │
│  └──────────────┘    └──────┬───────┘    └──────────────────┘   │
│                             │ WebSocket                          │
└─────────────────────────────┼───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Local Backend Server                        │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────┐   │
│  │   FastAPI    │───▶│ VAD Sequencer│───▶│  Faster-Whisper  │   │
│  │  WebSocket   │    │  (Silero)    │    │     (ASR)        │   │
│  └──────────────┘    └──────────────┘    └────────┬─────────┘   │
│                                                    │             │
│                                          ┌────────▼─────────┐   │
│                                          │  LLM Translator  │   │
│                                          │    (Async)       │   │
│                                          └──────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### Data Flow

1. **Audio Capture**: Tab audio captured at 48kHz Float32
2. **Preprocessing**: Downsampled to 16kHz Int16 in AudioWorklet
3. **Streaming**: Binary chunks sent via WebSocket
4. **VAD Processing**: Silero VAD detects speech segments
5. **Transcription**: Faster-Whisper generates text
6. **Translation**: Async LLM translates to target language
7. **Display**: Synchronized subtitles rendered in side panel

## 📁 Project Structure

```
live-translator/
├── apps/
│   ├── extension/          # Chrome Extension (React + TypeScript)
│   │   ├── src/
│   │   │   ├── background/ # Service Worker
│   │   │   ├── content/    # Content Scripts
│   │   │   ├── sidepanel/  # React Side Panel UI
│   │   │   ├── offscreen/  # Offscreen Document (Audio)
│   │   │   └── lib/        # Audio Processing
│   │   ├── manifest.json   # Extension Manifest V3
│   │   └── package.json
│   │
│   └── server/             # Backend Server (Python + FastAPI)
│       ├── api/            # API Routes
│       ├── core/           # Core Logic
│       │   ├── asr_engine.py
│       │   └── vad_sequencer.py
│       ├── main.py         # FastAPI Entry Point
│       └── pyproject.toml  # Poetry Config
│
├── .github/
│   ├── workflows/          # CI/CD Pipelines
│   └── ISSUE_TEMPLATE/     # Issue Templates
│
├── CONTRIBUTING.md         # Contribution Guidelines
├── LICENSE                 # MIT License
└── README.md
```

## 🛠️ Development

### Extension Development

```bash
cd apps/extension

# Development mode with hot reload
npm run dev

# Build for production
npm run build

# Type checking
npx tsc --noEmit
```

### Server Development

```bash
cd apps/server

# Run with auto-reload
poetry run uvicorn main:app --reload

# Run tests
poetry run pytest

# Format code
poetry run black .
poetry run isort .
```

### Testing the Connection

```bash
cd apps/server

# Run test client
poetry run python test_client.py
```

## ⚙️ Configuration

### Environment Variables

Create a `.env` file in `apps/server/`:

```env
# ASR Settings
WHISPER_MODEL=base           # tiny, base, small, medium, large-v2
WHISPER_DEVICE=cuda          # cuda, cpu
WHISPER_COMPUTE_TYPE=float16 # float16, int8

# Translation (Optional)
OPENAI_API_KEY=your_api_key
TRANSLATION_MODEL=gpt-4o-mini

# Server
HOST=127.0.0.1
PORT=8765
```

### Extension Settings

Settings can be configured through the extension's options page:
- Source Language
- Target Language
- Subtitle Display Style
- Server Connection URL

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'feat: add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Faster-Whisper](https://github.com/guillaumekln/faster-whisper) - Fast ASR inference
- [Silero VAD](https://github.com/snakers4/silero-vad) - Voice Activity Detection
- [CRXJS](https://crxjs.dev/vite-plugin) - Chrome Extension Vite Plugin

---

<div align="center">

**[⬆ Back to Top](#-live-translator)**

Made with ❤️ by the Live Translator Team

</div>