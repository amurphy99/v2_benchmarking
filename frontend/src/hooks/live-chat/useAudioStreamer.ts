import { useRef, useEffect } from "react";
import   AudioStreamer       from "@/utils/AudioStreamer";
import   toBase64            from "@/utils/toBase64";

// Typing for the WebSocket message
interface AudioChunkMessage {
    type        : "audio_data";
    timestamp   : number;
    sampleRate  : number;
    data        : string;  // base64 payload
    duration    : number;
}
type WSMessage = AudioChunkMessage;

// --------------------------------------------------------------------
// Audio streamer hook for sending audio data to the backend
// --------------------------------------------------------------------
export default function useAudioStreamer({
    sampleRate = 16_000,
    chunkMs    =  64,
    dataType   = "audio_data",
    sendToServer,
}: {
    sampleRate? : number;
    chunkMs?    : number;
    dataType?   : AudioChunkMessage["type"];
    sendToServer: (msg: WSMessage) => void;
}) {
    // Setup AudioStreamer reference with the sendToServer function
    const audioRef = useRef<AudioStreamer | null>(null);
    useEffect(() => {
        audioRef.current = new AudioStreamer({
            sampleRate : sampleRate,
            chunkMs    : chunkMs,
            onError    : (err: unknown) => console.error("Audio error:", err),
            onChunk    : (int16: Int16Array, timestamp: number) => {
                sendToServer({
                    type       : dataType, 
                    timestamp  : timestamp, 
                    data       : toBase64(int16), 
                    sampleRate : sampleRate,
                    duration   : chunkMs,
                });
            },
        });
        return () => audioRef.current?.stop(); // (clean up on unmount)
    }, [sendToServer]);

    // Start & Stop
    const start = () => { audioRef.current?.start(); }
    const  stop = () => { audioRef.current?.stop (); }

    return { start, stop };
}
