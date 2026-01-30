import { defineConfig } from "vite";
import { resolve } from "path";
import react from "@vitejs/plugin-react";
import { crx } from "@crxjs/vite-plugin";
import manifest from "./manifest.json";

export default defineConfig({
    plugins: [
        react(),
        crx({ manifest }),
    ],
    server: {
        port: 5173,
        strictPort: true,
        hmr: {
            port: 5173,
        },
    },
    build: {
        assetsInlineLimit: 0,
        rollupOptions: {
            input: {
                sidepanel: resolve(__dirname, "src/sidepanel/index.html"),
                offscreen: resolve(__dirname, "src/offscreen/offscreen.html"),
            },
        },
    },
});