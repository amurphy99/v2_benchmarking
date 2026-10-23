
import { useCallback, useEffect, useRef, useState } from "react";
import { CommandAck, PendingKey, SendFn, ControlState, RegisterAckHandler } from "./types";

// ================================================================================
// Handler for sending commands to the backend & receiving "acks"
// ================================================================================
// "ack" refers to confirmation messages sent from the backend after a command. 
// This let's us know if the command succeeded (and we should change the button to 
// the opposite function) or if it failed (and we should put it back the way it was).
export function useCommandAcks({
    connected,                 // Connection with the backend
    send,                      // Send data through the WebSocket
    controlState,              // State of the control buttons (e.g. "listening", "response_mode")
    setControlState,           // Apply state updates to the AdminControlPanel (listening or paused)
    registerAckHandler,        // Method that allows us to register something from here as the handler for an ack
    defaultTimeoutMs = 10_000, // Timeout until we give up on receiving an acknowledgement
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
        set_listening     : false,
        set_response_mode : false,
        reply_now         : false,

        // Avatar or Robot controls
        robot_emotion      : false,
        robot_animation    : false,

        // Manual Response Controls
        pause_and_listen   : false,
        resume_and_respond : false,
        repeat_last        : false,
        send_custom        : false,

        // Save the audio recording on chat completion
        set_recording      : false,
    });
    const pendingByIdRef = useRef<Map<string, { key: PendingKey; timeout: number }>>(new Map());

    // --------------------------------------------------------------------------------
    // Setup "ack" message receiver (only once per 'registerAckHandler' identity)
    // --------------------------------------------------------------------------------
    useEffect(() => {
        registerAckHandler((ack: CommandAck) => {
            console.log(ack);
            const rec = pendingByIdRef.current.get(ack.id);
            if (!rec) return;

            // Clear exisitng ack
            window.clearTimeout(rec.timeout);
            pendingByIdRef.current.delete(ack.id);

            // Unlock the button when ack is received
            setPending((p) => ({ ...p, [rec.key]: false }));

            // Apply confirmed state updates (ONLY on success)
            if (ack.ok) {
                setControlState((s) => ({
                    listening         : ack.state.listening         ?? s.listening,
                    response_mode     : ack.state.response_mode     ?? s.response_mode,
                    recording_enabled : ack.state.recording_enabled ?? s.recording_enabled,
                }));
            }
        });
    }, [registerAckHandler, setControlState]);

    // Clear command timeouts if the control panel unmounts before their acknowledgements
    useEffect(() => {
        return () => {
            for (const record of pendingByIdRef.current.values()) window.clearTimeout(record.timeout);
            pendingByIdRef.current.clear();
        };
    }, []);

    // --------------------------------------------------------------------------------
    // Send commands to the backend
    // --------------------------------------------------------------------------------
    const sendCommand = useCallback(
        (key: PendingKey, name: string, data?: any, timeoutMs: number = defaultTimeoutMs) => {
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
            send({type: "command", data: {id, name, ...(data !== undefined ? { data } : {}),},});
        },
        [connected, send, defaultTimeoutMs]
    );

    // --------------------------------------------------------------------------------
    // Button Actions (grouped so the components stay clean)
    // --------------------------------------------------------------------------------
    // Commands always state the target value explicitly; the backend never infers a toggle
    const actions = {
        // Control system response behavior
        toggleListening: () => {sendCommand("set_listening", "set_listening",
            { state: controlState.listening === "paused" ? "active" : "paused" });},
        toggleResponses: () => {sendCommand("set_response_mode", "set_response_mode",
            { mode:  controlState.response_mode === "manual" ? "automatic" : "manual" });},
        respondNow     : () => {sendCommand("reply_now", "reply_now")},

        // Control avatar or robot emotions or animations (values come from the capability profile)
        robotEmotion    : (emotion  : string) => {sendCommand("robot_emotion",   "robot_action", { kind: "emotion",   value: emotion   })},
        robotAnimation  : (animation: string) => {sendCommand("robot_animation", "robot_action", { kind: "animation", value: animation })},

        // Manual Response Controls
        pauseAndListen   : () => {sendCommand("pause_and_listen",   "pause_and_listen"  )},
        resumeAndRespond : () => {sendCommand("resume_and_respond", "resume_and_respond")},
        repeatLast       : () => {sendCommand("repeat_last",        "repeat_last"       )},
        sendCustom       : (text: string) => {sendCommand("send_custom", "send_custom", { message: text })},

        // Toggle session audio recording on/off
        toggleRecording  : (enabled: boolean) => {sendCommand("set_recording", "set_recording", { enabled })},
    };

    return { pending, sendCommand, actions };
}
