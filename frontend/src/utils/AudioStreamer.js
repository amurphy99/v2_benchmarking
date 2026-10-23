/**
 * Capture microphone audio and emit fixed-size, signed 16-bit PCM chunks.
 * --------------------------------------------------------------------------------
 * `frontend.src.utils.AudioStreamer`
 *
 * The browser may ignore the requested AudioContext rate. When that happens, this
 * class resamples the worklet frames while preserving interpolation state between
 * frames so the output remains continuous and averages the requested sample rate.
 *
 */


// ================================================================================
// Audio Streamer
// ================================================================================
export default class AudioStreamer {
    // Initialize the chunk buffer, resampler state, and browser audio resources
    constructor({ sampleRate, chunkMs, onChunk, onError }) {
        // Output chunk configuration
        this.sampleRate = sampleRate ?? 16_000;
        this.chunkMs    = chunkMs    ?? 64;
        this.chunkSize  = Math.round((this.sampleRate * this.chunkMs) / 1_000);
        this.onChunk    = onChunk;
        this.onError    = onError ?? console.error;

        // Fixed-size network chunk state
        this.buffer   = new Float32Array(this.chunkSize);
        this.bufIndex = 0;

        // Stateful resampling boundary and fractional phase
        this.resamplePending  = new Float32Array(0);
        this.resamplePosition = 0;

        // Browser audio resources
        this.ctx     = null;
        this.source  = null;
        this.worklet = null;
        this.stream  = null;
        this.running = false;
    }

    // ================================================================================
    // Start Audio Streaming
    // ================================================================================
    async start() {
        if (this.running) return;

        try {
            // Request the microphone and preferred output sample rate
            this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this.ctx    = new AudioContext({ sampleRate: this.sampleRate });

            // Prepare fallback resampling when the browser chooses another rate
            this.actualRate = this.ctx.sampleRate;
            this._resetResampler();
            if (this.actualRate !== this.sampleRate) {
                console.warn(`Requested ${this.sampleRate} Hz but got ${this.actualRate} Hz; will resample.`);
            }

            // Route raw worklet frames back to the main thread
            await this.ctx.audioWorklet.addModule("/audio-worklet-raw.js");
            this.source  = this.ctx.createMediaStreamSource(this.stream);
            this.worklet = new AudioWorkletNode(this.ctx, "raw-audio-processor");
            this.worklet.port.onmessage = (event) => this._handleFrame(event.data);

            this.source.connect(this.worklet);
            this.running = true;
            console.log("AudioStreamer started");

        } catch (error) {
            this.onError(error);
        }
    }

    // ================================================================================
    // Stop Audio Streaming
    // ================================================================================
    stop() {
        if (!this.running) return;
        this.running = false;

        // Release browser audio resources
        this.worklet?.port.postMessage("stop");
        this.worklet?.disconnect();
        this.source ?.disconnect();
        this.ctx    ?.close();
        this.stream ?.getTracks().forEach((track) => track.stop());

        // Drop the incomplete network chunk and reset interpolation state
        this.buffer   = new Float32Array(this.chunkSize);
        this.bufIndex = 0;
        this._resetResampler();
        console.log("AudioStreamer stopped");
    }

    // Convert one raw worklet frame to the configured output rate
    _handleFrame(float32) {
        if (!this.running) return;

        const data = (this.actualRate === this.sampleRate)
            ? float32
            : this._resample(float32, this.actualRate, this.sampleRate);
        this._appendSamples(data);
    }

    // Copy resampled samples into fixed-size network chunks
    _appendSamples(data) {
        let offset = 0;

        while (offset < data.length) {
            const copyCount = Math.min(this.chunkSize - this.bufIndex, data.length - offset);
            this.buffer.set(data.subarray(offset, offset + copyCount), this.bufIndex);
            this.bufIndex += copyCount;
            offset        += copyCount;

            if (this.bufIndex === this.chunkSize) {
                this.onChunk(this._floatToInt16(this.buffer), Date.now());
                this.bufIndex = 0;
            }
        }
    }

    // Convert normalized floating-point samples to signed 16-bit PCM
    _floatToInt16(float32) {
        const int16 = new Int16Array(float32.length);
        for (let i = 0; i < float32.length; i++) {
            int16[i] = Math.max(-32_768, Math.min(32_767, Math.round(float32[i] * 32_767)));
        }
        return int16;
    }

    // Linearly resample one frame while retaining the cross-frame boundary
    _resample(input, inRate, outRate) {
        const combined = new Float32Array(this.resamplePending.length + input.length);
        combined.set(this.resamplePending, 0);
        combined.set(input, this.resamplePending.length);

        const ratio   = inRate / outRate;
        const samples = [];
        let position  = this.resamplePosition;

        while (position + 1 < combined.length) {
            const index    = Math.floor(position);
            const fraction = position - index;
            samples.push((1 - fraction) * combined[index] + fraction * combined[index + 1]);
            position += ratio;
        }

        // Preserve the interpolation boundary and fractional phase for the next frame
        const retainIndex     = Math.min(Math.floor(position), combined.length);
        this.resamplePending  = combined.slice(retainIndex);
        this.resamplePosition = position - retainIndex;
        return Float32Array.from(samples);
    }

    // Clear every value carried between independent microphone streams
    _resetResampler() {
        this.resamplePending  = new Float32Array(0);
        this.resamplePosition = 0;
    }
}
