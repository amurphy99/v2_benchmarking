// --------------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------------
// Process backend "ack" responses
// TODO: Shouldn't this also be 
export type ControlState = {
    listeningPaused: boolean;
    responsesPaused: boolean;
};
export type CommandAck = {
    id        : string;
    ok        : boolean;
    message ? : string;
    state   ? : Partial<ControlState>;
};

// Key options for pending backend confirmations
export type PendingKey =
    | "pause_listening"
    | "pause_responses"
    | "respond_now"
    | "robot_spin"
    | "robot_excited";


// For passing methods between files
export type SendFn = (msg: any) => void;
export type RegisterAckHandler = (fn: (ack: CommandAck) => void) => void;
