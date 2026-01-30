import os
import pathlib

def create_structure(base_path):
    directories = [
        ".github/workflows",
        "apps/extension/src/background",
        "apps/extension/src/sidepanel",
        "apps/extension/src/lib",
        "apps/server/core",
        "apps/server/api",
    ]

    files = {
        "apps/extension/manifest.json": '{\n  "manifest_version": 3,\n  "name": "Live Translator",\n  "version": "1.0.0"\n}',
        "apps/extension/vite.config.ts": 'import { defineConfig } from "vite";\nimport react from "@vitejs/plugin-react";\nimport { crx } from "@crxjs/vite-plugin";\n// manifest will be imported here\n\nexport default defineConfig({});',
        "apps/server/pyproject.toml": '[tool.poetry]\nname = "live-translator-server"\nversion = "0.1.0"\ndescription = ""\nauthors = []\n\n[tool.poetry.dependencies]\npython = "^3.10"\nfastapi = "^0.100.0"\nuvicorn = "^0.23.0"\nfaster-whisper = "^0.7.0"\nsilero-vad = "^4.0.0"\n',
        "apps/server/main.py": 'from fastapi import FastAPI\n\napp = FastAPI()\n\n@app.get("/")\ndef read_root():\n    return {"Hello": "World"}',
        "apps/server/core/vad_sequencer.py": '# VAD Sequencer Logic Placeholder\nclass VADSequencer:\n    pass',
        "apps/server/core/asr_engine.py": '# Faster Whisper Wrapper Placeholder\nclass ASREngine:\n    pass',
        "README.md": "# Live Translator\n\nSee gemini.md for project scope."
    }

    base = pathlib.Path(base_path)

    print(f"Creating structure in {base}...")

    # Create directories
    for start_dir in directories:
        dir_path = base / start_dir
        dir_path.mkdir(parents=True, exist_ok=True)
        print(f"Created directory: {dir_path}")

    # Create files
    for file_path, content in files.items():
        f_path = base / file_path
        if not f_path.exists():
            f_path.write_text(content, encoding="utf-8")
            print(f"Created file: {f_path}")
        else:
            print(f"File already exists: {f_path}")

    print("Scaffolding complete.")

if __name__ == "__main__":
    create_structure(".")
