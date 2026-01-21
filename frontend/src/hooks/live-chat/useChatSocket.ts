import { useRef, useEffect, useState, useCallback } from "react";

import { getAccess } from "@/api";

interface WSMessage { type: string; data: unknown; }

// ====================================================================
// Handle the WebSocket Connection to the Backend
// ====================================================================
// ws://localhost:8000/ws/chat/?token=<ACCESS>&source=webapp
// ToDo: change typing to be done like in useAudioStreamer (do I actually NEED to ?)
export default function useChatSocket({ 
    recording, 
    onLLMResponse = (unknown)   => {}, 
    onScores      = (WSMessage) => {},
    onUserUtt     = (text) => {},
    onAudio       = (data) => {},
}) {
    // WebSocket setup    
    const [connected, setConnected] = useState(false);

    // Backend WebSocket URL 
    // ToDo: Need to add the token stuff to this (I think?)
    /*
    const protocol = window.location.protocol === "https:"    ? "wss:"  : "ws:";
    const hostName = window.location.hostname === "localhost" ? ":8000" : ""   ;
    const wsUrl    = `${protocol}//${window.location.host}${hostName}/ws/chat/`;
    */
    const wsUrlBase =
        location.hostname === "localhost"
            ? `ws://localhost:8000/ws/chat/`
            : `wss://${location.host}/ws/chat/`;
    const wsUrl = `${wsUrlBase}?token=${getAccess()}&source=webapp`;

    // Receive things from the backend: LLM messages, Biomarker scores (sometimes)
    const onMessage = useCallback((event: MessageEvent) => {
        const { type, data } = JSON.parse(event.data) as WSMessage;
        if (type === "llm_response") {
            onLLMResponse(data);
        } else if (type === "biomarker_scores") {
            console.log("On-Utterance scores received");
            onScores({ type, data });
        } else if (type === "audio_scores") {
            console.log("On-Audio scores received");
            onScores({ type, data });
        } else if (type === "periodic_scores") {
            console.log("Periodic scores received");
            onScores({ type, data });
        } else if (type === "user_utt") {
            console.log("User utterance received");
            onUserUtt(data);
        } else if (type === "audio_chunk") {
            onAudio(data);
        }
    }, [onLLMResponse, onScores]);

    // Open and close the websocket connection on change of the "recording" flag
    const wsRef = useRef<WebSocket | null>(null); 
    useEffect(() => {
        if (!recording) {wsRef.current?.close(); return;}

        wsRef.current = new WebSocket(wsUrl);
        wsRef.current.onopen    = (     ) => {setConnected(true ); console.log  ("WebSocket connected to:",              wsUrl);};
        wsRef.current.onclose   = (event) => {setConnected(false); console.log  ("WebSocket closed:",                    event);};
        wsRef.current.onerror   = (error) => {setConnected(false); console.error("WebSocket connection failed, error:",  error);};
        wsRef.current.onmessage = (event) => {onMessage(event);};
        
        return () => wsRef.current?.close(); // (clean up on unmount)
    }, [recording]);

    // Send helper
    const send = useCallback((msg: WSMessage) => {
        const ws = wsRef.current;
        if (ws?.readyState === WebSocket.OPEN) { ws.send(JSON.stringify(msg));                         }
        else                                   { console.warn("WebSocket not open; message not sent"); }
    }, []);

    // Expose
    return { send, connected };
}
