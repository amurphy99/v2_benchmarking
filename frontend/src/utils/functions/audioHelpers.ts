// Converts raw PCM audio data to a WAV Blob
function createWavFromRawPcm(
	rawBuffer: ArrayBuffer,
	numChannels: number,
	bitsPerSample: number,
	sampleRate: number
) {
	const blockAlign = (numChannels * bitsPerSample) / 8;
	const byteRate = sampleRate * blockAlign;
	const dataSize = rawBuffer.byteLength;

	const buffer = new ArrayBuffer(dataSize);
	const view = new DataView(buffer);

	const writeString = (offset: number, str: string) => {
		for (let i = 0; i < str.length; i++) {
			view.setUint8(offset + i, str.charCodeAt(i));
		}
	};

	writeString(0, "RIFF");
	view.setUint32(4, 36 + dataSize, true);
	writeString(8, "WAVE");
	writeString(12, "fmt ");
	view.setUint32(16, 16, true); // PCM
	view.setUint16(20, 1, true); // format = PCM
	view.setUint16(22, numChannels, true);
	view.setUint32(24, sampleRate, true);
	view.setUint32(28, byteRate, true);
	view.setUint16(32, blockAlign, true);
	view.setUint16(34, bitsPerSample, true);
	writeString(36, "data");
	view.setUint32(40, dataSize, true);

	const wav = new Uint8Array(buffer);
	wav.set(new Uint8Array(rawBuffer));
	return new Blob([wav], { type: "audio/wav" });
}

/**
 * Converts an Array Buffer of PCM-encoded 16 bit audio bytes into an Audio Buffer object.
 * @param pcmData The array buffer of PCM audio bytes.
 * @param sampleRate The sample rate of the audio.
 * @param numChannels The number of channels the audio has (1 for mono, 2 for stereo)
 * @param bitsPerSample The number of bits per sample of the audio, or the bit depth
 * @param ctx The audio context to use to create the new Audio Buffer
 * @returns An AudioBuffer object of the PCM audio
 */
function pcmToAudioBuffer(pcmData: ArrayBuffer, sampleRate: number, numChannels: number, bitsPerSample: number, ctx: AudioContext) {
  const bytesPerSample = bitsPerSample / 8;
  const totalSamples = pcmData.byteLength / (bytesPerSample * numChannels);

  const audioBuffer = ctx.createBuffer(numChannels, totalSamples, sampleRate);
  const view = new DataView(pcmData);
  let offset = 0;

  for (let i = 0; i < totalSamples; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      let sample;

      switch (bitsPerSample) {
        case 8: // 8-bit PCM (unsigned)
          sample = (view.getUint8(offset) - 128) / 128.0;
          break;

        case 16: // 16-bit PCM (signed little endian)
          sample = view.getInt16(offset, true) / 0x8000;
          break;

        case 24: { // 24-bit PCM (signed little endian)
          // Read 3 bytes manually since DataView has no getInt24
          const b0 = view.getUint8(offset);
          const b1 = view.getUint8(offset + 1);
          const b2 = view.getUint8(offset + 2);
          let intVal = (b2 << 16) | (b1 << 8) | b0;
          // Sign extend 24-bit
          if (intVal & 0x800000) intVal |= ~0xffffff;
          sample = intVal / 0x800000;
          break;
        }

        case 32: // 32-bit PCM (signed little endian)
          sample = view.getInt32(offset, true) / 0x80000000;
          break;

        default:
          throw new Error(`Unsupported bitsPerSample: ${bitsPerSample}`);
      }

      audioBuffer.getChannelData(ch)[i] = sample;
      offset += bytesPerSample;
    }
  }

  return audioBuffer;
}


export {createWavFromRawPcm, pcmToAudioBuffer}
