import type { WsEnvelope } from "./types";

// ================================================================================
// Handle incoming messages from the backend
// ================================================================================
export function createWsRouter({
    // State setters (owned by the main hook)
    setLastEventAt,
    setLatencyMs,

    // Handlers (from handlersRef.current + onCommandAck/onControlState)
    getHandlers,
    onCommandAck,
    onControlState,
}: {
    setLastEventAt : (d: Date         ) => void;
    setLatencyMs   : (n: number | null) => void;

    getHandlers: () => {
        setSessionInfo    : (d: any) => void;
        setHistMessages   : (d: any) => void;
        setHistBiomarkers : (d: any) => void;
        addNewMessage     : (d: any) => void;
        addNewBiomarkers  : (d: any) => void;
    };

    onCommandAck  : (ack   : any) => void;
    onControlState: (state : any) => void;
}) {
    return function onMessage(event: MessageEvent) {
        // Parse the initial event
        let response: WsEnvelope<any>;
        try   { response = JSON.parse(event.data); } 
        catch { console.warn("WS message not JSON:", event.data); return; }
        const { type, data } = response;

        // Handle latency pong
        if (type === "pong") {
              const clientTs = typeof response.client_ts === "number"
                    ? response     .client_ts : typeof (data as any)?.client_ts === "number"
                    ? (data as any).client_ts : null;
            if (clientTs != null) setLatencyMs(Date.now() - clientTs);
            return;
        }

        // console.log(event);

        // Update the last event (for real data or acks only)
        setLastEventAt(new Date());

        // Current handlers
        const h = getHandlers();

        // Call the respective method based on the event type
        if      (type === "session_info"     ) h.setSessionInfo   (data);
        else if (type === "message_history"  ) h.setHistMessages  (data);
        else if (type === "biomarker_history") h.setHistBiomarkers(data);
        else if (type === "message"          ) h.addNewMessage    (data);
        else if (type === "biomarker_scores" ) h.addNewBiomarkers (data);

        // Confirmations from the backend following commands
        else if (type === "command_ack"      )   onCommandAck     (data);
        else if (type === "control_state"    )   onControlState   (data);

        // Unhandled events
        else { console.debug("Unhandled WS event type:", type, response); }
    };
}
