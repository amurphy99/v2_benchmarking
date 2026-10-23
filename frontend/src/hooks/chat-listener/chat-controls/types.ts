// --------------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------------
// Complete control state; the backend returns this in every ack and every control_state frame.
// Mirrors `get_control_state()` in backend/.../consumers/processing/commands.py
export type ListeningState = "active"    | "paused";
export type ResponseMode   = "automatic" | "manual";

export type ControlState = {
    listening         : ListeningState;
    response_mode     : ResponseMode;
    recording_enabled : boolean;
};

// Process backend "ack" responses
export type CommandAck = {
    id      : string;
    name    : string | null;
    ok      : boolean;
    message : string | null;
    state   : ControlState;
};

// Key options for pending backend confirmations
export type PendingKey =
    | "set_listening"
    | "set_response_mode"
    | "reply_now"
    | "robot_emotion"
    | "robot_animation"
    | "pause_and_listen"
    | "resume_and_respond"
    | "repeat_last"
    | "send_custom"
    | "set_recording";


// For passing methods between files
export type SendFn = (msg: any) => void;
export type RegisterAckHandler = (fn: (ack: CommandAck) => void) => void;
