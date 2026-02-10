import { getAccess } from "@/context/AuthProvider";
import { useRef, useEffect, useState, useCallback } from "react";

// ================================================================================
// Handle the WebSocket Connection to the Backend
// ================================================================================
export default function useChatListener({ 
    recording,
    session_id,
    onWSMessage = (event: any) => {},
}) {
    // WebSocket setup    
    const [connected, setConnected] = useState(false);

    // Backend WebSocket URL 
    const wsUrlBase =
        location.hostname === "localhost"
            ? `ws://localhost:8000/ws/chat/${session_id}/listen/`
            : `wss://${location.host}/ws/chat/${session_id}/listen/`;
    const wsUrl = `${wsUrlBase}?token=${getAccess()}&source=webapp`;

    // --------------------------------------------------------------------------------
    // Receive things from the backend: LLM messages, Biomarker scores (sometimes)
    // --------------------------------------------------------------------------------
    const onMessage = useCallback((event: MessageEvent) => {
        const response = JSON.parse(event.data);
        const type = response.type;
        const data = response.data;

        // We have a general handler method in the page right now
        if      (type === "message"         ) { console.log(`message received: ${data}`         ); }
        else if (type === "biomarker_scores") { console.log(`biomarker_scores received: ${data}`); }

        // Handler on the page (for now?)
        onWSMessage(event);

    }, [onWSMessage]);

    // ================================================================================
    // Open and close the websocket connection on change of the "recording" flag
    // ================================================================================
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

    // ================================================================================
    // Send helper
    // ================================================================================
    const send = useCallback((msg: any) => {
        const ws = wsRef.current;
        if (ws?.readyState === WebSocket.OPEN) { ws.send(JSON.stringify(msg));                         }
        else                                   { console.warn("WebSocket not open; message not sent"); }
    }, []);

    // Expose
    return { send, connected };
}
