/*  ====================================================================
 *  AudioStreamer
 *  ====================================================================
 *  Captures mic input -> chunks -> Int16 PCM -> calls onChunk().
 *
 *  new AudioStreamer({
 *    sampleRate : 16_000,                   // target output rate
 *    chunkMs    : 64,                    // chunk length in ms
 *    onChunk    : (int16, ts) => { ... },   // required
 *    onError    : err => {}                 // optional
 *  })
 *
 *  streamer.start();
 *  streamer.stop();
 * ==================================================================== */
export default class AudioStreamer {
    constructor({ sampleRate, chunkMs, onChunk, onError }) {
        this.sampleRate = sampleRate ?? 16_000;
        this.chunkMs    = chunkMs ?? 64;
        this.chunkSize  = Math.round((sampleRate * (this.chunkMs ?? 1_000)) / 1_000); // samples
        this.onChunk    = onChunk;
        this.onError    = onError ?? console.error;
    
        this.buffer     = new Float32Array(this.chunkSize);
        this.bufIndex   = 0;
    
        this.ctx        = null;
        this.source     = null;
        this.worklet    = null;
        this.stream     = null;
        this.running    = false;
    }
    
    // --------------------------------------------------------------------
    // Start Streaming Audio
    // --------------------------------------------------------------------
    async start() {if (this.running) return; // already running
        try {
            this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this.ctx    = new AudioContext({ sampleRate: this.sampleRate });
    
            // Fallback
            this.actualRate = this.ctx.sampleRate;
            if (this.actualRate !== this.sampleRate) {console.warn(`Requested ${this.sampleRate} Hz but got ${this.actualRate} Hz; will resample.`);}
    
            await this.ctx.audioWorklet.addModule('/audio-worklet-raw.js');
    
            this.source  = this.ctx.createMediaStreamSource(this.stream);
            this.worklet = new AudioWorkletNode(this.ctx, 'raw-audio-processor');
            this.worklet.port.onmessage = (e) => this._handleFrame(e.data);
    
            this.source.connect(this.worklet); 
            this.running = true;
    
            console.log('AudioStreamer started');

        } catch (err) {this.onError(err);}
    }
    
    // --------------------------------------------------------------------
    // Stop Stream
    // --------------------------------------------------------------------
    stop() {
        if (!this.running) return;
        this.running = false;
    
        this.worklet?.port.postMessage('stop');
        this.worklet?.disconnect();
        this.source ?.disconnect();
        this.ctx    ?.close();
        this.stream ?.getTracks().forEach(t => t.stop());
    
        this.buffer   = new Float32Array(this.chunkSize);
        this.bufIndex = 0;
        console.log('AudioStreamer stopped');
    }
    
    // --------------------------------------------------------------------
    // Internal Helpers
    // --------------------------------------------------------------------
    _handleFrame(float32) {if (!this.running) return;
        // Down-sample if needed (linear interpolation)
        const data = this.actualRate === this.sampleRate
            ? float32
            : this._resample(float32, this.actualRate, this.sampleRate);
    
        // Copy into rolling buffer
        const remaining = this.chunkSize - this.bufIndex;
        const slice     = data.subarray(0, remaining);
        this.buffer.set(slice, this.bufIndex);
        this.bufIndex += slice.length;
    
        // When buffer is filled -> emit chunk
        if (this.bufIndex >= this.chunkSize) {
            const int16 = this._floatToInt16(this.buffer);
            this.onChunk(int16, Date.now());
            this.bufIndex = 0; // reset
        }
    
        // If any leftover samples -> start next buffer
        const leftovers = data.subarray(slice.length);
        if (leftovers.length) {this._handleFrame(leftovers);} // recursive
    }
  

    _floatToInt16(float32) {
        const out = new Int16Array(float32.length);
        for (let i = 0; i < float32.length; i++) {out[i] = Math.max(-32768, Math.min(32767, Math.round(float32[i] * 32767)));}
        return out;
    }
  
    _resample(input, inRate, outRate) {
        const ratio  = inRate / outRate;
        const newLen = Math.round(input.length / ratio);

        const out = new Float32Array(newLen);
        for (let i = 0; i < newLen; i++) {
            const idx  = i * ratio;
            const j    = Math.floor(idx);
            const frac = idx - j;
            out[i] = (1 - frac) * input[j] + frac * (input[j + 1] || 0);
        }
        return out;
    }
}
  