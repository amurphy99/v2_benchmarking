// Audio streaming helper functions.

// ================================================================================
// Convert raw PCM audio data to a WAV Blob
// ================================================================================
// Not sure if we use this anywhere at the moment...
function createWavFromRawPcm(
    rawBuffer     : ArrayBuffer,
    numChannels   : number,
    bitsPerSample : number,
    sampleRate    : number
) {
    // --------------------------------------------------------------------------------
    // WAV header is always 44 bytes for PCM
    // --------------------------------------------------------------------------------
    const headerSize = 44;

    const bytesPerSample = bitsPerSample / 8;
    const blockAlign     = numChannels * bytesPerSample; // bytes per frame
    const byteRate       = sampleRate  * blockAlign;
    const dataSize       = rawBuffer.byteLength;

    // Allocate enough room for the header + PCM payload
    const buffer = new ArrayBuffer(headerSize + dataSize);
    const view   = new DataView(buffer);

    const writeString = (offset: number, str: string) => {
        for (let i = 0; i < str.length; i++) {
            view.setUint8(offset + i, str.charCodeAt(i));
        }
    };

    // --------------------------------------------------------------------------------
    // RIFF / WAVE header
    // --------------------------------------------------------------------------------
    writeString(0,  "RIFF");
    view.setUint32(4, 36 + dataSize, true);
    writeString(8,  "WAVE");

    // FMT chunk
    writeString(12, "fmt ");
    view.setUint32(16, 16, true); // PCM fmt chunk size
    view.setUint16(20, 1,  true); // format = PCM
    view.setUint16(22, numChannels,   true);
    view.setUint32(24, sampleRate,    true);
    view.setUint32(28, byteRate,      true);
    view.setUint16(32, blockAlign,    true);
    view.setUint16(34, bitsPerSample, true);

    // Data chunk
    writeString(36, "data");
    view.setUint32(40, dataSize, true);

    // --------------------------------------------------------------------------------
    // Copy PCM payload AFTER header (do NOT overwrite the header)
    // --------------------------------------------------------------------------------
    const wav = new Uint8Array(buffer);
    wav.set(new Uint8Array(rawBuffer), headerSize);

    return new Blob([wav], { type: "audio/wav" });
}


/** ===============================================================================
 * Converts an Array Buffer of PCM-encoded audio bytes into an Audio Buffer object.
 * ================================================================================
 * NOTE: This expects RAW PCM bytes (no WAV header).
 *
 * @param pcmData       The array buffer of PCM audio bytes.
 * @param sampleRate    The sample rate of the audio.
 * @param numChannels   The number of channels the audio has (1 for mono, 2 for stereo)
 * @param bitsPerSample The number of bits per sample of the audio, or the bit depth
 * @param ctx           The audio context to use to create the new Audio Buffer
 * @returns             An AudioBuffer object of the PCM audio
 */
function pcmToAudioBuffer(
    pcmData       : ArrayBuffer,
    sampleRate    : number,
    numChannels   : number,
    bitsPerSample : number,
    ctx           : AudioContext
) {
    const bytesPerSample = bitsPerSample / 8;
    const bytesPerFrame  = bytesPerSample * numChannels;
    // --------------------------------------------------------------------------------
    // IMPORTANT: For streaming/chunked PCM, we must be frame-aligned
    // --------------------------------------------------------------------------------
    // If there is a partial frame at the end, drop it (or carry it over at a higher level)
    const fullFrames  = Math.floor(pcmData.byteLength / bytesPerFrame);
    const usableBytes = fullFrames * bytesPerFrame;
    if (usableBytes <= 0) { return ctx.createBuffer(numChannels, 0, sampleRate); }

    // If the buffer isn't aligned, we ignore the trailing remainder to avoid pops/clicks
    const view = new DataView(pcmData, 0, usableBytes);

    // Allocate AudioBuffer (length measured in frames)
    const audioBuffer = ctx.createBuffer(numChannels, fullFrames, sampleRate);

    // Cache channel arrays to avoid repeated getChannelData calls
    const channels = Array.from({ length: numChannels }, (_, ch) => audioBuffer.getChannelData(ch));

    // --------------------------------------------------------------------------------
    // Loop through the frames
    // --------------------------------------------------------------------------------
    let offset = 0;
    for (let i = 0; i < fullFrames; i++) {
        for (let ch = 0; ch < numChannels; ch++) {
            let sample = 0;

            switch (bitsPerSample) {
                // 8-bit PCM (unsigned)
                case 8: sample = (view.getUint8(offset) - 128) / 128.0; break;

                // 16-bit PCM (signed little endian)
                case 16: sample = view.getInt16(offset, true) / 0x8000; break;

                // 24-bit PCM (signed little endian)
                case 24: { 
                    // Read 3 bytes manually since DataView has no getInt24
                    const b0 = view.getUint8(offset);
                    const b1 = view.getUint8(offset + 1);
                    const b2 = view.getUint8(offset + 2);

                    let intVal = (b2 << 16) | (b1 << 8) | b0;

                    // Sign extend 24-bit
                    if (intVal & 0x800000) intVal |= ~0xffffff;

                    sample = intVal / 0x800000; // 2^23
                    break;
                }

                // 32-bit PCM (signed little endian)
                case 32: sample = view.getInt32(offset, true) / 0x80000000; break;

                // Invalid case
                default: throw new Error(`Unsupported bitsPerSample: ${bitsPerSample}`);
            }

            channels[ch][i] = sample;
            offset += bytesPerSample;
        }
    }
    return audioBuffer;
}


export {createWavFromRawPcm, pcmToAudioBuffer}
