function createWavFromRawPcm(rawBuffer) {
    const numChannels = 1;
    const sampleRate = 24000;
    const bitsPerSample = 16;
    const blockAlign = numChannels * bitsPerSample / 8;
    const byteRate = sampleRate * blockAlign;
    const dataSize = rawBuffer.byteLength;

    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);

    const writeString = (offset, str) => {
        for (let i = 0; i < str.length; i++) {
        view.setUint8(offset + i, str.charCodeAt(i));
        }
    };

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true); // PCM
    view.setUint16(20, 1, true);  // format = PCM
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);
    writeString(36, 'data');
    view.setUint32(40, dataSize, true);

    const wav = new Uint8Array(buffer);
    wav.set(new Uint8Array(rawBuffer), 44);
    return new Blob([wav], { type: 'audio/wav' });
}

function playL16Audio(base64Data) {
    const raw = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
    const wavBlob = createWavFromRawPcm(raw.buffer);
    const audio = new Audio(URL.createObjectURL(wavBlob));
    audio.play().catch(err => console.error('Playback error:', err));
}

export { createWavFromRawPcm, playL16Audio }