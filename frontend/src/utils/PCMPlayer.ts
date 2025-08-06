export default class PCMPlayer {
    private encoding: string;
    private channels: number;
    private sampleRate: number;
    private flushingTime: number;
    private interval: number;
    private maxValue: number;
    private typedArray: any;
    private audioCtx: AudioContext;
    private gainNode: GainNode;
    private startTime: number;
    private samples: Float32Array;


    constructor( {encoding, channels, sampleRate, flushingTime} ) {
        this.encoding = encoding ?? '16bitInt';
        this.channels = channels ?? 1;
        this.sampleRate = sampleRate ?? 24_000;
        this.flushingTime = flushingTime ?? 64;
        this.flush = this.flush.bind(this);
        this.interval = setInterval(this.flush, this.flushingTime);
        this.maxValue = this.getMaxValue();
        this.typedArray = this.getTypedArray();
        this.createContext();
        this.samples = new Float32Array();
    }


    getMaxValue() : number {
        var encodings = {
            '8bitInt': 128,
            '16bitInt': 32768,
            '32bitInt': 2147483648,
            '32bitFloat': 1
        }

        return encodings[this.encoding] ? encodings[this.encoding] : encodings['16bitInt'];
    };

    getTypedArray() : Int8ArrayConstructor | Int16ArrayConstructor | Int32ArrayConstructor | Float32ArrayConstructor {
        var typedArrays = {
            '8bitInt': Int8Array,
            '16bitInt': Int16Array,
            '32bitInt': Int32Array,
            '32bitFloat': Float32Array
        }

        return typedArrays[this.encoding] ? typedArrays[this.encoding] : typedArrays['16bitInt'];
    };

    createContext() : void {
        this.audioCtx = new AudioContext();

        // context needs to be resumed on iOS and Safari (or it will stay in "suspended" state)
        this.audioCtx.resume();
        this.audioCtx.onstatechange = () => console.log(this.audioCtx.state);   // if you want to see "Running" state in console and be happy about it
        
        this.gainNode = this.audioCtx.createGain();
        this.gainNode.gain.value = 1;
        this.gainNode.connect(this.audioCtx.destination);
        this.startTime = this.audioCtx.currentTime;
    };

    isTypedArray(data) : boolean {
        return (data.byteLength && data.buffer && data.buffer.constructor == ArrayBuffer);
    };

    async feed(blob: Blob) {
        console.log("feed called: ", blob);
        const buffer = await blob.arrayBuffer();
        var data = new Float32Array(buffer);
        if (!this.isTypedArray(data)) return;
        data = this.getFormatedValue(data);
        var tmp = new Float32Array(this.samples.length + data.length);
        tmp.set(this.samples, 0);
        tmp.set(data, this.samples.length);
        this.samples = tmp;
        console.log("samples length: ", this.samples.length)
    };

    getFormatedValue(data) {
        var data = new this.typedArray(data.buffer),
            float32 = new Float32Array(data.length),
            i;

        for (i = 0; i < data.length; i++) {
            float32[i] = data[i] / this.maxValue;
        }
        return float32;
    };

    volume(volume) {
        this.gainNode.gain.value = volume;
    };

    destroy() {
        if (this.interval) {
            clearInterval(this.interval);
        }
        this.samples = null;
        this.audioCtx.close();
        this.audioCtx = null;
    };

    flush() {
        if (!this.samples.length) return;
        console.log("Flushing")
        var bufferSource = this.audioCtx.createBufferSource(),
            length = this.samples.length / this.channels,
            audioBuffer = this.audioCtx.createBuffer(this.channels, length, this.sampleRate),
            audioData,
            channel,
            offset,
            i,
            decrement;

        for (channel = 0; channel < this.channels; channel++) {
            audioData = audioBuffer.getChannelData(channel);
            offset = channel;
            decrement = 50;
            for (i = 0; i < length; i++) {
                audioData[i] = this.samples[offset];
                /* fadein */
                if (i < 50) {
                    audioData[i] =  (audioData[i] * i) / 50;
                }
                /* fadeout*/
                if (i >= (length - 51)) {
                    audioData[i] =  (audioData[i] * decrement--) / 50;
                }
                offset += this.channels;
            }
        }
        console.log("Audio buffer created")
        
        if (this.startTime < this.audioCtx.currentTime) {
            this.startTime = this.audioCtx.currentTime;
        }
        console.log('start vs current '+this.startTime+' vs '+this.audioCtx.currentTime+' duration: '+audioBuffer.duration);
        bufferSource.buffer = audioBuffer;
        bufferSource.connect(this.gainNode);
        console.log("Playing audio")
        bufferSource.start(this.startTime);
        this.startTime += audioBuffer.duration;
        this.samples = new Float32Array();
    };
}