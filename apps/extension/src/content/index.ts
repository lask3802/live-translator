console.log("Live Translator Content Script Loaded");

// Poll for video element
const interval = setInterval(() => {
    const video = document.querySelector("video");
    if (video) {
        console.log("Video element found");
        clearInterval(interval);
        attachListener(video);
    }
}, 1000);

function attachListener(video: HTMLVideoElement) {
    video.addEventListener("timeupdate", () => {
        // Check if context is valid
        if (!chrome.runtime?.id) {
            // Context invalidated (extension reloaded), script is orphaned.
            // Silent return or detach listener could be better.
            return;
        }

        try {
            chrome.runtime.sendMessage({
                type: "VIDEO_TIME",
                currentTime: video.currentTime
            }).catch(() => {
                // Ignore connection errors (e.g. sidepanel closed)
            });
        } catch (e) {
            // Context invalidated sync error
        }
    });
}
