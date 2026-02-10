import { getAccess } from "@/context/AuthProvider";
import { useRef, useEffect, useState, useCallback } from "react";

// ================================================================================
// Handle the WebSocket Connection to the Backend
// ================================================================================
export default function useChatListener({ 
    session_id,
    enabled        = true,
    pingIntervalMs = 3_000,

    // Updates from the backend
    setSessionInfo    = (data : any) => {},
    setHistMessages   = (data : any) => {},
    setHistBiomarkers = (data : any) => {},
    addNewMessage     = (data : any) => {},
    addNewBiomarkers  = (data : any) => {},
}) {
    // --------------------------------------------------------------------------------
    // Timing
    // --------------------------------------------------------------------------------
    // For header UI
    const [lastEventAt, setLastEventAt] = useState<Date   | null>(null);
    const [latencyMs,   setLatencyMs  ] = useState<number | null>(null);

    // Keep the last ping timestamp so pong can compute RTT
    const lastPingAtRef = useRef<number | null>(null);

    // --------------------------------------------------------------------------------
    // WebSocket Setup
    // --------------------------------------------------------------------------------
    const [connected, setConnected] = useState(false);

    // Backend WebSocket URL 
    const wsUrlBase =
        location.hostname === "localhost"
            ? `ws://localhost:8000/ws/chat/${session_id}/listen/`
            : `wss://${location.host}/ws/chat/${session_id}/listen/`;
    const wsUrl = `${wsUrlBase}?token=${getAccess()}&source=webapp`;

    // --------------------------------------------------------------------------------
    // Message Handlers (avoid spammed reconnect attempts)
    // --------------------------------------------------------------------------------
    const handlersRef = useRef({
        setSessionInfo, setHistMessages, setHistBiomarkers, addNewMessage, addNewBiomarkers,
    });

    useEffect(() => {
        handlersRef.current = {setSessionInfo, setHistMessages, setHistBiomarkers, addNewMessage, addNewBiomarkers};
    }, [setSessionInfo, setHistMessages, setHistBiomarkers, addNewMessage, addNewBiomarkers]);

    // --------------------------------------------------------------------------------
    // Receive data from the backend
    // --------------------------------------------------------------------------------
    const onMessage = useCallback((event: MessageEvent) => {
        // Parse the initial event
        let response: any
        try   { response = JSON.parse(event.data); } 
        catch { console.warn("WS message not JSON:", event.data); return; }
        const type = response.type;
        const data = response.data; 

        // Update the last event (for real data only)
        if (type !== "pong") { setLastEventAt(new Date()); }

        // Handle latency pong
        if (type === "pong") {
            const clientTs = response.client_ts;
            if (typeof clientTs === "number") { setLatencyMs(Date.now() - clientTs); }
            return;
        }

        // Current handlers
        const {setSessionInfo, setHistMessages, setHistBiomarkers, addNewMessage, addNewBiomarkers} = handlersRef.current;

        // Call the respective method based on the event type
        if      (type === "session_info"     ) { setSessionInfo   (data); }
        else if (type === "message_history"  ) { setHistMessages  (data); }
        else if (type === "biomarker_history") { setHistBiomarkers(data); }
        else if (type === "message"          ) { addNewMessage    (data); }
        else if (type === "biomarker_scores" ) { addNewBiomarkers (data); }
        else { console.debug("Unhandled WS event type:", type, response); }

    }, []);


    // ================================================================================
    // Open and close based on "enabled"
    // ================================================================================
    const wsRef = useRef<WebSocket | null>(null); 
    useEffect(() => {
        if (!enabled || !wsUrl) {wsRef.current?.close(); wsRef.current = null; setConnected(false); return;}

        const ws = new WebSocket(wsUrl); wsRef.current = ws;
        ws.onopen    = (     ) => {setConnected(true ); console.log  ("WebSocket connected to:",              wsUrl);};
        ws.onclose   = (event) => {setConnected(false); console.log  ("WebSocket closed:",                    event);};
        ws.onerror   = (error) => {setConnected(false); console.error("WebSocket connection failed, error:",  error);};
        ws.onmessage = onMessage;
        
        return () => {wsRef.current?.close(); wsRef.current = null;} // clean up on unmount
    }, [enabled, wsUrl, onMessage]);


    // --------------------------------------------------------------------------------
    // Ping loop for latency (JSON ping/pong)
    // --------------------------------------------------------------------------------
    useEffect(() => {
        // Connection checks
        if (!connected) return;
        const ws = wsRef.current; if (!ws) return;

        // Ping the backend at intervals
        const id = window.setInterval(() => {
            if (ws.readyState !== WebSocket.OPEN) return;
            const t = Date.now(); lastPingAtRef.current = t;
            ws.send(JSON.stringify({ type: "ping", client_ts: t }));
        }, pingIntervalMs);

        return () => window.clearInterval(id); // clean up on unmount
    }, [connected, pingIntervalMs]);

    // ================================================================================
    // Send Helper (accepts object or string)
    // ================================================================================
    const send = useCallback((msg: any) => {
        const ws = wsRef.current;
        if (!ws || ws.readyState !== WebSocket.OPEN) {console.warn("WebSocket not open; message not sent");}
        else { ws.send(typeof msg === "string" ? msg : JSON.stringify(msg));  }
    }, []);

    // Expose
    return { send, connected, lastEventAt, latencyMs };
}
