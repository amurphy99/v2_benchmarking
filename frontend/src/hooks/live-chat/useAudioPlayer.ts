export default class PCMStreamer {
	private numChannels: number;
	private sampleRate: number;
	private audioContext: AudioContext;
    private playTime: number;

    constructor({ numChannels=1, sampleRate=24_000 }) {
        this.numChannels = numChannels;
        this.sampleRate = sampleRate;
        this.audioContext = new AudioContext();
    }

    public async sendAudio(audioBytes: Blob) {
        this.playTime = this.audioContext.currentTime;
        const buffer = await audioBytes.arrayBuffer();
        const pcmData = new Int16Array(buffer);
        const float32 = this.int16ToFloat32(pcmData);
        this.playPCM(float32);
    }

	private int16ToFloat32(int16Array: Int16Array): Float32Array<ArrayBuffer> {
		const float32 = new Float32Array(int16Array.length);
		for (let i = 0; i < int16Array.length; i++) {
			float32[i] = int16Array[i] / 32768; // Normalize to [-1, 1]
		}
		return float32;
	};

	private playPCM(float32Samples: Float32Array<ArrayBuffer>): void {
		const buffer = this.audioContext.createBuffer(
			this.numChannels,
			float32Samples.length,
			this.sampleRate
		);

		buffer.copyToChannel(float32Samples, 0); // channel index 0 = mono or left

		const source = this.audioContext.createBufferSource();
		source.buffer = buffer;
		source.connect(this.audioContext.destination);
		source.start(this.playTime);
        this.playTime += buffer.duration
	};
}
