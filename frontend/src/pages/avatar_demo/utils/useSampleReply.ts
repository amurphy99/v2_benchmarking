/* Play the saved sample reply through the same audio player a live chat uses.
--------------------------------------------------------------------------------
`@frontend/src/pages/avatar_demo/utils/useSampleReply`

The clip ("That's really interesting. Is there anything else that you think I
should be able to do?") was made once with the backend's own Google TTS voice
and lives in `frontend/public/audio/`, so Vite and nginx serve it as a plain
static file. Playing it slices the WAV's PCM into the backend's chunk size and
hands each chunk to `sendAudio` with `sequence` and `last`, exactly as a live
reply arrives, so the mouth and the speech gaze run on the real code path. Each
play is its own reply (the caller picks its `responseId`, as each live reply has
its own), and its chunks number the clip's two sentences the way the backend
will (`AVATAR_PLANS.md` §10), so plan steps timed to a sentence can be tried.
An optional extra pause adds silence in the middle of the clip's sentence
break, so the pause behavior can be tried at different lengths.

*/
import { useCallback, useRef } from "react";

// Saved clip, and the chunk size the backend sends (`CHUNK_SIZE` in `tts_streaming.py`)
const DEMO_SAMPLE_REPLY_URL   = "/audio/sample_reply.wav";
const DEMO_SAMPLE_CHUNK_BYTES = 8_192;

// Where the clip's second sentence's voice starts (`sentence` 2 from the chunk holding it on)
// (the way the backend will number them, `AVATAR_PLANS.md` §10)
const DEMO_SAMPLE_SENTENCE_2_AT_SEC = 1.52;

// Middle of the clip's silence between its two sentences (0.96 to 1.52 s), where an extra pause goes
const DEMO_SAMPLE_PAUSE_AT_SEC = 1.24;

// One chunk as `useAudioPlayer().sendAudio` takes it
type SampleChunk = {b64: string; responseId: number; sampleRate: number; channels: number; bitsPerSample: number; sequence: number; last: boolean; sentence: number};

// The clip's raw PCM and its format
type SampleAudio = {pcm: Uint8Array; sampleRate: number; channels: number; bitsPerSample: number};


// ================================================================================
// Sample Reply
// ================================================================================
// Return a function that plays the sample reply from the start (by default on a fresh timeline, cutting off any reply still playing)
export function useSampleReply(
    cancelAudio : () => void,                               // The player's "drop buffered audio and open a fresh timeline"
    sendAudio   : (chunk: SampleChunk) => Promise<void>,    // The player's chunk scheduler
): (extraPauseSec: number, freshTimeline: boolean, responseId: number) => Promise<void> {
    // The clip, fetched on the first play
    const audioRef = useRef<SampleAudio | null>(null);

    return useCallback(async (extraPauseSec: number, freshTimeline: boolean, responseId: number): Promise<void> => {
        // A fresh timeline first, while the click still counts as a user gesture (a delayed play reuses one opened at its click)
        if (freshTimeline) cancelAudio();

        // Fetch the clip once
        if (audioRef.current === null) {
            const response = await fetch(DEMO_SAMPLE_REPLY_URL);
            if (!response.ok) throw new Error(`Could not load the sample reply (${response.status})`);
            audioRef.current = readWav(await response.arrayBuffer());
        }

        // Lengthen the sentence break with silence, cutting on a whole sample frame
        const {pcm: clip, sampleRate, channels, bitsPerSample} = audioRef.current;
        const frameBytes   = channels * (bitsPerSample / 8);
        const cutAt        = Math.round(DEMO_SAMPLE_PAUSE_AT_SEC * sampleRate) * frameBytes;
        const silenceBytes = Math.round(extraPauseSec * sampleRate) * frameBytes;
        const pcm          = new Uint8Array(clip.length + silenceBytes);   // Starts as silence
        pcm.set(clip.subarray(0, cutAt));
        pcm.set(clip.subarray(cutAt), cutAt + silenceBytes);

        // Send it as the backend does, numbering its sentences (2 from the chunk where its voice starts)
        const count    = Math.ceil(pcm.length / DEMO_SAMPLE_CHUNK_BYTES);
        const secondAt = Math.round((DEMO_SAMPLE_SENTENCE_2_AT_SEC + extraPauseSec) * sampleRate) * frameBytes;
        for (let i = 0; i < count; i++) {
            const bytes    = pcm.subarray(i * DEMO_SAMPLE_CHUNK_BYTES, (i + 1) * DEMO_SAMPLE_CHUNK_BYTES);
            const sentence = (((i + 1) * DEMO_SAMPLE_CHUNK_BYTES) > secondAt) ? 2 : 1;
            await sendAudio({b64: btoa(String.fromCharCode(...bytes)), responseId, sampleRate, channels, bitsPerSample, sequence: i, last: i === count - 1, sentence});
        }
    }, [cancelAudio, sendAudio]);
}


// --------------------------------------------------------------------------------
// WAV Reading
// --------------------------------------------------------------------------------
// Find the PCM format ("fmt ") and samples ("data") in a WAV file
function readWav(buffer: ArrayBuffer): SampleAudio {
    const view   = new DataView(buffer);
    let format   = {sampleRate: 0, channels: 0, bitsPerSample: 0};
    let offset   = 12;   // After "RIFF", the file size, and "WAVE"

    // Walk the chunks (each is padded to an even length)
    while (offset + 8 <= view.byteLength) {
        const id   = String.fromCharCode(...new Uint8Array(buffer, offset, 4));
        const size = view.getUint32(offset + 4, true);
        if (id === "fmt ") format = {channels: view.getUint16(offset + 10, true), sampleRate: view.getUint32(offset + 12, true), bitsPerSample: view.getUint16(offset + 22, true)};
        if (id === "data") return {pcm: new Uint8Array(buffer, offset + 8, size), ...format};
        offset += 8 + size + (size % 2);
    }
    throw new Error("The sample reply has no audio data");
}
