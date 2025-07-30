export async function playAudio(data: Blob) {
    const arrayBuffer = await data.arrayBuffer(); // Convert to ArrayBuffer
    const wav = wrapPCMWithWAV(arrayBuffer, 16000); // Use the WAV wrapper function from before
    const audioContext = new AudioContext();
    const audioBuffer = await audioContext.decodeAudioData(wav);

    const source = audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioContext.destination);
    source.start();
}

function wrapPCMWithWAV(pcmArrayBuffer: ArrayBuffer, sampleRate: number = 16000, numChannels: number = 1, bitsPerSample: number = 16) {
    const pcmLength = pcmArrayBuffer.byteLength;
    const blockAlign = numChannels * bitsPerSample / 8;
    const byteRate = sampleRate * blockAlign;
    const wavHeaderSize = 44;
    const totalSize = pcmLength + wavHeaderSize;

    const wavBuffer = new ArrayBuffer(totalSize);
    const view = new DataView(wavBuffer);

    // Write WAV header
    let offset = 0;

    // RIFF identifier
    writeString(view, offset, 'RIFF'); offset += 4;
    view.setUint32(offset, totalSize - 8, true); offset += 4; // file length - 8
    writeString(view, offset, 'WAVE'); offset += 4;

    // fmt chunk
    writeString(view, offset, 'fmt '); offset += 4;
    view.setUint32(offset, 16, true); offset += 4; // size of fmt chunk
    view.setUint16(offset, 1, true); offset += 2;  // audio format (1 = PCM)
    view.setUint16(offset, numChannels, true); offset += 2;
    view.setUint32(offset, sampleRate, true); offset += 4;
    view.setUint32(offset, byteRate, true); offset += 4;
    view.setUint16(offset, blockAlign, true); offset += 2;
    view.setUint16(offset, bitsPerSample, true); offset += 2;

    // data chunk
    writeString(view, offset, 'data'); offset += 4;
    view.setUint32(offset, pcmLength, true); offset += 4;

    // Copy PCM data
    new Uint8Array(wavBuffer, offset).set(new Uint8Array(pcmArrayBuffer));

    return wavBuffer;
}

function writeString(view: DataView, offset: number, string: string) {
    for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
    }
}

export default class AudioPlayer {
    private sampleRate: number;
    private numChannels: number;
    private bitsPerSample: number;
    private audioBuffer: Blob[];
    private playing: boolean;

    constructor({ sampleRate, numChannels, bitsPerSample }) {
        this.sampleRate = sampleRate ?? 16_000;
        this.numChannels = numChannels ?? 1;
        this.bitsPerSample = bitsPerSample ?? 16;
        this.playing = false;
    }

    public sendAudio(data: Blob) : void {
        this.audioBuffer.push(data);
        if (this.playing) {
            this.playAudio();
        } else {
            if (this.audioBuffer.length >= 3) {
                this.playing = true;
                this.playAudio();
            }
        }
    }

    public async playAudio() {
        while (this.audioBuffer.length > 0) {
            const data: Blob = this.audioBuffer.pop();
            const arrayBuffer = await data.arrayBuffer(); // Convert to ArrayBuffer
            const wav = wrapPCMWithWAV(arrayBuffer, 16000); // Use the WAV wrapper function from before
            const audioContext = new AudioContext();
            const audioBuffer = await audioContext.decodeAudioData(wav);

            const source = audioContext.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(audioContext.destination);
            source.start();
        }
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