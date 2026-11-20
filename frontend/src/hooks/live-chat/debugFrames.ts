/* The command acks and debug-mode frames the chat page reads, checked on arrival.
--------------------------------------------------------------------------------
`@frontend/src/hooks/live-chat/debugFrames`

Every command the page sends gets a `command_ack` carrying the complete control
state. In debug mode the backend also sends each reply's timing (`reply_timing`)
and any control state an admin's command changed (`control_state`), and the page's
pings get a `pong`. The shapes are in
`backend/chat_app/websocket/consumers/CLIENT_PROTOCOL.md` (§2.7, §3.6, §3.9).
Each is checked here, where it arrives: one that doesn't match comes back as
null, for the socket to drop with a warning.

*/
// From this project
import type { ReplyTiming              } from "@/api";
import type { CommandAck, ControlState } from "@/hooks/chat-listener/chat-controls/types";

// One reply's timing as its frame carries it: the record, and the reply it belongs to
export type ReplyTimingFrame = ReplyTiming & {response_id: number};


// --------------------------------------------------------------------------------
// Field Checks
// --------------------------------------------------------------------------------
// A plain object
function isRecord(value: unknown): value is Record<string, unknown> {
    return (typeof value === "object") && (value !== null) && !Array.isArray(value);
}

// A finite number, or (where a field allows it) null
function isNumber(value: unknown): value is number {
    return (typeof value === "number") && Number.isFinite(value);
}
function isNumberOrNull(value: unknown): value is number | null {
    return (value === null) || isNumber(value);
}

// An object whose every value is a boolean (the shared features, by name)
function isFlags(value: unknown): value is Record<string, boolean> {
    return isRecord(value) && Object.values(value).every((flag: unknown) => typeof flag === "boolean");
}

// One model call in a reply's timing (null when it doesn't match)
function readCall(value: unknown): ReplyTiming["calls"][number] | null {
    if (!isRecord(value) || (typeof value.label !== "string") || !isNumber(value.at_ms) || !isNumber(value.ms)) return null;
    return {label: value.label, at_ms: value.at_ms, ms: value.ms};
}


// ================================================================================
// Frame Checks
// ================================================================================
// A `reply_timing` frame's data
export function parseReplyTiming(data: unknown): ReplyTimingFrame | null {
    if (!isRecord(data) || !Array.isArray(data.calls)) return null;

    // Which reply, its stages, and the features switched on for it
    const {response_id, stt_ms, generate_ms, hold_ms, tts_ms, delay_ms, features} = data;
    if ((typeof response_id !== "number") || !Number.isInteger(response_id) || !isFlags(features))                          return null;
    if (!isNumberOrNull(stt_ms) || !isNumber(generate_ms) || !isNumberOrNull(hold_ms) || !isNumberOrNull(tts_ms) || !isNumberOrNull(delay_ms)) return null;

    // Every model call, or none of the frame
    const calls: ReplyTiming["calls"] = [];
    for (const value of data.calls) {
        const call = readCall(value);
        if (call === null) return null;
        calls.push(call);
    }
    return {response_id, stt_ms, generate_ms, calls, hold_ms, tts_ms, delay_ms, features};
}

// The complete control state, from an ack or a `control_state` frame
export function parseControlState(data: unknown): ControlState | null {
    if (!isRecord(data)) return null;
    const {listening, response_mode, recording_enabled, features} = data;
    if (((listening !== "active") && (listening !== "paused")) || ((response_mode !== "automatic") && (response_mode !== "manual"))) return null;
    if ((typeof recording_enabled !== "boolean") || !isFlags(features))                                                          return null;
    return {listening, response_mode, recording_enabled, features};
}

// A `command_ack` frame's data
export function parseCommandAck(data: unknown): CommandAck | null {
    if (!isRecord(data)) return null;
    const {id, name, ok, message} = data;
    const state = parseControlState(data.state);
    if ((typeof id !== "string") || ((name !== null) && (typeof name !== "string")) || (typeof ok !== "boolean")) return null;
    if (((message !== null) && (typeof message !== "string")) || (state === null))                               return null;
    return {id, name, ok, message, state};
}

// The client timestamp a `pong` echoes (the whole frame: `client_ts` sits at its top level)
export function parsePong(frame: unknown): number | null {
    return (isRecord(frame) && isNumber(frame.client_ts)) ? frame.client_ts : null;
}
