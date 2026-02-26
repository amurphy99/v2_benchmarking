
import { useCallback, useEffect, useRef, useState } from "react";
import { CommandAck, PendingKey, SendFn, ControlState, RegisterAckHandler } from "./types";

// ================================================================================
// Handler for sending commands to the backend & receiving "acks"
// ================================================================================
// "ack" refers to confirmation messages sent from the backend after a command. 
// This let's us know if the command succeeded (and we should change the button to 
// the opposite function) or if it failed (and we should put it back the way it was).
export function useCommandAcks({
    connected,                // Connection with the backend
    send,                     // Send data through the WebSocket
    controlState,             // State of the control buttons (e.g. "listeningPaused", "responsesPaused")
    setControlState,          // Apply state updates to the AdminControlPanel (listening or paused)
    registerAckHandler,       // Method that allows us to register something from here as the handler for an ack
    defaultTimeoutMs = 5_000, // Timeout until we "give up" on receiving an ack from the backend (5s)
}: {
    connected          : boolean; 
    send               : SendFn;
    controlState       : ControlState;
    setControlState    : (fn: (prev: ControlState) => ControlState) => void;
    registerAckHandler : RegisterAckHandler;
    defaultTimeoutMs?  : number;
}) {
    // --------------------------------------------------------------------------------
    // Pending Command / Lockout Handling
    // --------------------------------------------------------------------------------
    const [pending, setPending] = useState<Record<PendingKey, boolean>>({
        // Responses
        pause_listening : false,
        pause_responses : false,
        respond_now     : false,

        // Avatar or Robot controls
        robot_spin      : false,
        robot_excited   : false,
    });
    const pendingByIdRef = useRef<Map<string, { key: PendingKey; timeout: number }>>(new Map());

    // --------------------------------------------------------------------------------
    // Setup "ack" message receiver (only once per 'registerAckHandler' identity)
    // --------------------------------------------------------------------------------
    useEffect(() => {
        registerAckHandler((ack: CommandAck) => {
            const rec = pendingByIdRef.current.get(ack.id);
            if (!rec) return;

            // Clear exisitng ack
            window.clearTimeout(rec.timeout);
            pendingByIdRef.current.delete(ack.id);

            // Unlock the button when ack is received
            setPending((p) => ({ ...p, [rec.key]: false }));

            // Apply confirmed state updates (ONLY on success)
            if (ack.ok && ack.state) {
                setControlState((s) => ({
                    listeningPaused: ack.state.listeningPaused ?? s.listeningPaused,
                    responsesPaused: ack.state.responsesPaused ?? s.responsesPaused,
                }));
            }
        });
    }, [registerAckHandler, setControlState]);

    // --------------------------------------------------------------------------------
    // Send commands to the backend
    // --------------------------------------------------------------------------------
    const sendCommand = useCallback(
        (key: PendingKey, name: string, value?: any, timeoutMs: number = defaultTimeoutMs) => {
            if (!connected) return;

            // Lockout the caller's (key's) button immediately 
            setPending((p) => ({ ...p, [key]: true })); 

            // Generate an ID for this command
            const id = crypto.randomUUID();

            // Unlock the button after a timeout period (where no ack is received)
            const timeout = window.setTimeout(() => {
                pendingByIdRef.current.delete(id);
                setPending((p) => ({ ...p, [key]: false }));
            }, timeoutMs);
            pendingByIdRef.current.set(id, { key, timeout });

            // Send the command through the WebSocket 
            send({type: "command", data: {id, name, ...(value !== undefined ? { value } : {}),},});
        },
        [connected, send]
    );

    // --------------------------------------------------------------------------------
    // Button Actions (grouped so the components stay clean)
    // --------------------------------------------------------------------------------
    const actions = {
        // Control system response behavior
        toggleListening: () => {sendCommand("pause_listening", "pause_listening", !controlState.listeningPaused);},
        toggleResponses: () => {sendCommand("pause_responses", "pause_responses", !controlState.responsesPaused);},
        respondNow     : () => {sendCommand("respond_now",     "respond_now")},
        
        // Control avatar or robot actions
        robotSpin      : () => {sendCommand("robot_spin",      "robot_action", { action: "spin"    })},
        robotExcited   : () => {sendCommand("robot_excited",   "robot_action", { action: "excited" })},
    };

    return { pending, sendCommand, actions };
}
