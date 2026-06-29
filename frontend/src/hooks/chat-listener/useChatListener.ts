
import { useRef, useEffect, useState, useCallback, useMemo } from "react";

import { buildChatListenerWsUrl } from "./ws/buildWsUrl";
import { createWsRouter         } from "./ws/createWsRouter";
import { useWsLatencyPing       } from "./ws/useWsLatencyPing";
import { noopAny                } from "./ws/types";

// ================================================================================
// Handle the WebSocket Connection to the Backend
// ================================================================================
export default function useChatListener({ 
    session_id,                  // ID of the session we want to listen in on
    enabled        = true,       // Always true (does it matter?)
    pingIntervalMs = 3_000,      // Intervals at which to send pings to the backend to check for latency

    // Data sent from backend at the start of the connection 
    setSessionInfo    = noopAny, // General information about the chat you are listening to
    setHistMessages   = noopAny, // Current chat history (if you joined the session late)
    setHistBiomarkers = noopAny, // All biomarkers so far for the chat

    // Mid-chat updates from the backend
    addNewMessage     = noopAny, // Individual messages
    addNewBiomarkers  = noopAny, // Individual biomarker set (could be just one or all)

    // Handle commands sent to the backend (and the confirmation responses)
    onCommandAck      = noopAny, // Relay "acks" confirming commands were received
    onControlState    = noopAny, // Relay new control states (depending on result of commands)
    onStreamStatus    = noopAny, // Relay stream status changes ("active" | "paused" | "ended")
    onRecordingStatus = noopAny, // Relay recording toggle changes from the primary consumer
}) {
    // --------------------------------------------------------------------------------
    // Timing (header UI)
    // --------------------------------------------------------------------------------
    const [lastEventAt, setLastEventAt] = useState<Date   | null>(null);
    const [latencyMs,   setLatencyMs  ] = useState<number | null>(null);

    // Keep the last ping timestamp so pong can compute RTT
    const lastPingAtRef = useRef<number | null>(null);

    // --------------------------------------------------------------------------------
    // WebSocket Setup
    // --------------------------------------------------------------------------------
    // Connection Status & Reference
    const [connected, setConnected] = useState(false);
    const wsRef = useRef<WebSocket | null>(null); 

    // Build WebSocket URL
    const wsUrl = buildChatListenerWsUrl(session_id);

    // --------------------------------------------------------------------------------
    // Keep handler refs stable (avoid reconnect loops)
    // --------------------------------------------------------------------------------
    // Chat Updates
    const handlersRef = useRef({
        setSessionInfo, setHistMessages, setHistBiomarkers, addNewMessage, addNewBiomarkers,
    });

    useEffect(() => {
        handlersRef.current = {setSessionInfo, setHistMessages, setHistBiomarkers, addNewMessage, addNewBiomarkers};
    }, [setSessionInfo, setHistMessages, setHistBiomarkers, addNewMessage, addNewBiomarkers]);

    // Acks (command success/failure confirmation communications with the backend)
    const controlHandlersRef = useRef(            { onCommandAck, onControlState, onStreamStatus, onRecordingStatus });
    useEffect(() => {controlHandlersRef.current = { onCommandAck, onControlState, onStreamStatus, onRecordingStatus };
    },                                            [ onCommandAck, onControlState, onStreamStatus, onRecordingStatus ]);

    // --------------------------------------------------------------------------------
    // Message Handling
    // --------------------------------------------------------------------------------
    // Router parses messages received from the backend and handles consequences
    const onMessage = useMemo(() => {
        return createWsRouter({
            setLastEventAt    : (d  ) => setLastEventAt(d),
            setLatencyMs      : (n  ) => setLatencyMs(n),
            getHandlers       : (   ) => handlersRef.current,
            onCommandAck      : (ack) => controlHandlersRef.current.onCommandAck     (ack),
            onControlState    : (st ) => controlHandlersRef.current.onControlState   (st ),
            onStreamStatus    : (st ) => controlHandlersRef.current.onStreamStatus   (st ),
            onRecordingStatus : (st ) => controlHandlersRef.current.onRecordingStatus(st ),
        });
    }, []);

    // Ping loop for latency (JSON ping/pong)
    useWsLatencyPing({connected, wsRef, pingIntervalMs});

    // ================================================================================
    // Open or close connection
    // ================================================================================
    useEffect(() => {
        if (!enabled || !wsUrl) {wsRef.current?.close(); wsRef.current = null; setConnected(false); return;}

        const ws = new WebSocket(wsUrl); wsRef.current = ws;
        ws.onopen    = (     ) => {setConnected(true ); console.log  ("WebSocket connected to:",              wsUrl);};
        ws.onclose   = (event) => {setConnected(false); console.log  ("WebSocket closed:",                    event);};
        ws.onerror   = (error) => {setConnected(false); console.error("WebSocket connection failed, error:",  error);};
        ws.onmessage = onMessage;
        
        return () => {wsRef.current?.close(); wsRef.current = null;} // clean up on unmount
    }, [enabled, wsUrl, onMessage]);

    // ================================================================================
    // Send Helper (accepts object or string)
    // ================================================================================
    const send = useCallback((msg: any) => {
        const ws = wsRef.current;
        if (!ws || ws.readyState !== WebSocket.OPEN) {console.warn("WebSocket not open; message not sent");}
        else { ws.send(typeof msg === "string" ? msg : JSON.stringify(msg)); }
    }, []);

    // Expose
    return { send, connected, lastEventAt, latencyMs };
}
