class AudioProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        // Default sampleRate is available in AudioWorkletGlobalScope
        this.targetSampleRate = 16000;
        this.ratio = sampleRate / this.targetSampleRate;
        this.accumulatedProcessTime = 0;
    }

    process(inputs, outputs, parameters) {
        const input = inputs[0];
        if (!input || !input.length) return true;

        const channelData = input[0]; // Process only first channel (Mono)
        const outputSamples = [];

        // Simple downsampling state machine
        for (let i = 0; i < channelData.length; i++) {
            this.accumulatedProcessTime += 1;

            if (this.accumulatedProcessTime >= this.ratio) {
                this.accumulatedProcessTime -= this.ratio;

                // Take the sample (Point sampling / Decimation)
                // Ideally we should average or filter before this to avoid aliasing,
                // but for speech VAD purposes this simple decimation is often sufficient MVP.
                let s = channelData[i];

                // Convert Float32 (-1.0 to 1.0) to Int16
                s = Math.max(-1, Math.min(1, s));
                const int16 = s < 0 ? s * 0x8000 : s * 0x7FFF;
                outputSamples.push(int16);
            }
        }

        if (outputSamples.length > 0) {
            // Post Int16Array to the main thread (node)
            this.port.postMessage(new Int16Array(outputSamples));
        }

        return true;
    }
}

registerProcessor('audio-processor', AudioProcessor);
