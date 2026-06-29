import { getAccess } from "@/context/AuthProvider";
import { useRef, useEffect, useState, useCallback } from "react";

// ================================================================================
// Handle the WebSocket Connection to the Backend
// ================================================================================
// ws://localhost:8000/ws/chat/?token=<ACCESS>&source=webapp
// ToDo: change typing to be done like in useAudioStreamer (do I actually NEED to ?)
export default function useChatSocket({
    recording,
    wsPath            = "/ws/chat/", 
    onLLMResponse     = (unknown            ) => {}, 
    onScores          = (WSMessage : any    ) => {},
    onUserUtt         = (text      : string ) => {},
    onAudio           = (data               ) => {},
    onError           = (_                  ) => {},
    onExpression      = (data               ) => {},
    onStreamStatus    = (status    : string ) => {},
    onChatClosed      = (                   ) => {},
    onRecordingStatus = (enabled   : boolean) => {},
}) {
    // WebSocket setup    
    const [connected, setConnected] = useState(false);

    // Backend WebSocket URL 
    const wsUrlBase =
        location.hostname === "localhost"
            ? `ws://localhost:8000${wsPath}`
            : `wss://${location.host}${wsPath}`;
    const wsUrl = `${wsUrlBase}?token=${getAccess()}&source=webapp`;

    // --------------------------------------------------------------------------------
    // Receive things from the backend: LLM messages, Biomarker scores (sometimes)
    // --------------------------------------------------------------------------------
    const onMessage = useCallback((event: MessageEvent) => {
        const response = JSON.parse(event.data);
        const type = response.type;
        const data = response.data;

        // Basic LLM response received through the WebSocket
        if      (type === "llm_response"    ) { onLLMResponse(response); }
        else if (type === "user_utt"        ) { console.log("User utterance received"     ); onUserUtt(        data  ); } 
        else if (type === "audio_chunk"     ) {                                              onAudio  (        data  ); } 
        
        // Old biomarker-score-specific message types
        else if (type === "biomarker_scores") { console.log("On-Utterance scores received"); onScores ({ type, data }); } 
        else if (type === "audio_scores"    ) { console.log("On-Audio scores received"    ); onScores ({ type, data }); } 
        else if (type === "periodic_scores" ) { console.log("Periodic scores received"    ); onScores ({ type, data }); } 
        else if (type === "user_utt"        ) { console.log("User utterance received"     ); onUserUtt(        data  ); } 
        else if (type === "audio_chunk"     ) {                                              onAudio  (        data  ); } 
        else if (type === "lipsync_data"    ) { console.log("Received lipsync data"); } 
        else if (type === "expression"      ) { console.log("Received expression:", data  ); onExpression(data);}

        // Backend chat controls (chats can be paused or ended through the backend)
        else if (type === "stream_status"   ) { console.log("Backend paused chat"     ); onStreamStatus   (data           ); }
        else if (type === "chat_ended"      ) { console.log("Backend ended chat"      ); onChatClosed     (               ); }
        else if (type === "recording_status") { console.log("Recording status updated"); onRecordingStatus(!!data?.enabled); }

        // Miscellaneous 
        else if (type === "lipsync_data"    ) { console.log("Received lipsync data"); } 
        else if (type === "rag_parse_error" || type === "chat_error") { console.log("Json Parsing Error Occured"); onError(response); }

    }, [onLLMResponse, onScores, onUserUtt, onAudio, onError, onStreamStatus, onChatClosed]);

    // --------------------------------------------------------------------------------
    // Open and close the websocket connection on change of the "recording" flag
    // --------------------------------------------------------------------------------
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
    const send = useCallback((msg: any) => {
        const ws = wsRef.current;
        if (ws?.readyState === WebSocket.OPEN) { ws.send(JSON.stringify(msg));                         }
        else                                   { console.warn("WebSocket not open; message not sent"); }
    }, []);

    // Expose
    return { send, connected };
}
