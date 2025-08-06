export default class AudioPlayer {
	private sampleRate: number;
	private numChannels: number;
	private audioContext: AudioContext;
	private lastScheduledTime: number;

	constructor({ sampleRate = 16_000, numChannels = 1 } = {}) {
		this.sampleRate = sampleRate;
		this.numChannels = numChannels;
		this.audioContext = new AudioContext({ sampleRate });
		this.lastScheduledTime = this.audioContext.currentTime;
	}

	/**
	 * Accepts a buffer of raw 16-bit PCM bytes and plays it
	 * @param {ArrayBuffer} pcmBytes
	 */
	public playChunk(pcmBytes: ArrayBuffer) {
		const float32 = this._convert16BitPCMToFloat32(pcmBytes);
		const buffer = this.audioContext.createBuffer(
			this.numChannels,
			float32.length,
			this.sampleRate
		);
		try {
			buffer.getChannelData(0).set(float32);
		} catch (err) {
			console.error("Buffer conversion error:", err);
			return;
		}

		const source = this.audioContext.createBufferSource();
		source.buffer = buffer;
		source.connect(this.audioContext.destination);

		const startTime = Math.max(
			this.audioContext.currentTime,
			this.lastScheduledTime
		);
		source.start(startTime);
		this.lastScheduledTime = startTime + buffer.duration;
	}

	private _convert16BitPCMToFloat32(buffer: ArrayBuffer): Float32Array {
		const view = new DataView(buffer);
		const float32 = new Float32Array(buffer.byteLength / 2);

		if (buffer.byteLength % 2 !== 0) {
			console.warn("Unaligned PCM data size:", buffer.byteLength);
			return new Float32Array(); // return silence
		}

		for (let i = 0; i < float32.length; i++) {
			float32[i] = view.getInt16(i * 2, true) / 32768;
		}

		return float32;
	}
}