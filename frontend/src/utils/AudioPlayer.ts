export default class AudioPlayer {
    private sampleRate: number;
    private numChannels: number;
    private bitsPerSample: number;
    private audioContext: AudioContext;

    constructor({ sampleRate, numChannels, bitsPerSample }) {
        this.sampleRate = sampleRate ?? 16_000;
        this.numChannels = numChannels ?? 1;
        this.bitsPerSample = bitsPerSample ?? 16;
        this.audioContext = new AudioContext();
    }

    public async sendAudio(data: Blob | null) {
        const arrayBuffer = await data.arrayBuffer(); // Convert to ArrayBuffer
        const wav = this.wrapPCMWithWAV(arrayBuffer); // Use the WAV wrapper function from before
        const audioBuffer = await this.audioContext.decodeAudioData(wav);
        
    }

    public playAudio() {
        const source = this.audioContext.createBufferSource();
        source.connect(this.audioContext.destination);
        source.start(source.buffer.duration);
    }

    public async playBlob(blob: Blob) {
        const arrayBuffer = await blob.arrayBuffer(); // Convert to ArrayBuffer
        const wav = this.wrapPCMWithWAV(arrayBuffer); // Use the WAV wrapper function from before
        const buffer = await this.audioContext.decodeAudioData(wav);
        const source = this.audioContext.createBufferSource();
        source.buffer = buffer;
        source.connect(this.audioContext.destination);
        source.start(source.buffer.duration);
    }

    public async playChunk(chunk: ArrayBuffer) {
        const wav = this.wrapPCMWithWAV(chunk); // Use the WAV wrapper function from before
        const buffer = await this.audioContext.decodeAudioData(wav);
        const source = this.audioContext.createBufferSource();
        source.buffer = buffer;
        source.connect(this.audioContext.destination);
        source.start(source.buffer.duration);
    }

    private appendBuffer(buffer1: AudioBuffer, buffer2: AudioBuffer) {
        var numberOfChannels = Math.min( buffer1.numberOfChannels, buffer2.numberOfChannels );
        var tmp = this.audioContext.createBuffer( numberOfChannels, (buffer1.length + buffer2.length), buffer1.sampleRate );
        for (var i = 0; i < numberOfChannels; i++) {
            var channel = tmp.getChannelData(i);
            channel.set( buffer1.getChannelData(i), 0);
            channel.set( buffer2.getChannelData(i), buffer1.length);
        }
        return tmp;
    }

    private wrapPCMWithWAV(pcmArrayBuffer: ArrayBuffer) : ArrayBuffer {
        const pcmLength = pcmArrayBuffer.byteLength;
        const blockAlign = this.numChannels * this.bitsPerSample / 8;
        const byteRate = this.sampleRate * blockAlign;
        const wavHeaderSize = 44;
        const totalSize = pcmLength + wavHeaderSize;

        const wavBuffer = new ArrayBuffer(totalSize);
        const view = new DataView(wavBuffer);

        // Write WAV header
        let offset = 0;

        // RIFF identifier
        this.writeString(view, offset, 'RIFF'); offset += 4;
        view.setUint32(offset, totalSize - 8, true); offset += 4; // file length - 8
        this.writeString(view, offset, 'WAVE'); offset += 4;

        // fmt chunk
        this.writeString(view, offset, 'fmt '); offset += 4;
        view.setUint32(offset, 16, true); offset += 4; // size of fmt chunk
        view.setUint16(offset, 1, true); offset += 2;  // audio format (1 = PCM)
        view.setUint16(offset, this.numChannels, true); offset += 2;
        view.setUint32(offset, this.sampleRate, true); offset += 4;
        view.setUint32(offset, byteRate, true); offset += 4;
        view.setUint16(offset, blockAlign, true); offset += 2;
        view.setUint16(offset, this.bitsPerSample, true); offset += 2;

        // data chunk
        this.writeString(view, offset, 'data'); offset += 4;
        view.setUint32(offset, pcmLength, true); offset += 4;

        // Copy PCM data
        new Uint8Array(wavBuffer, offset).set(new Uint8Array(pcmArrayBuffer));

        return wavBuffer;
    }

    private writeString(view: DataView, offset: number, string: string) {
        for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
        }
    }
}