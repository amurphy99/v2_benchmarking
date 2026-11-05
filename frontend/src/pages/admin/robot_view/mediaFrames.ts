/* Frames on the admin media viewer socket, and the `BMV1` image reader.
--------------------------------------------------------------------------------
`@frontend/src/pages/admin/robot_view/mediaFrames`

Experimental (see `backend/chat_app/websocket/experimental/buddy/README.md`).
Mirrors `media_consumer.py` and `viewer_consumer.py` there, and Buddy's media
protocol for the robot state, telemetry, and image header it forwards. Field
names keep their wire spelling. Buddy sends what its protocol says, so frames
are read without field checks. Telemetry values are every field of Buddy's SDK
sensor classes, kept as plain records and shown as sent.

Images arrive as binary messages: the four bytes `BMV1`, a four-byte big-endian
header length, that many bytes of UTF-8 JSON, then the JPEG.

*/
// Bytes before an image's JSON header: `BMV1`, then the header length
const IMAGE_PREFIX_BYTES = 8;


// --------------------------------------------------------------------------------
// Media Session and Robot State
// --------------------------------------------------------------------------------
// Where Buddy's media socket is in its life: no socket, socket open, started, or closed
export type MediaSessionStatus = "none" | "connected" | "ready" | "ended";

// Buddy's media socket's lifecycle
export type MediaSession = {
    status           : MediaSessionStatus;
    media_session_id : string | null;
};

// Buddy's camera counters
export type RobotVideo = {
    requested_fps  : number;
    effective_fps  : number;
    measured_fps   : number | null;   // Frames sent over the last second (null for the first second)
    width          : number | null;   // Null until the first frame
    height         : number | null;
    frames_sent    : number;
    frames_dropped : number;
};

// Buddy's head, read from its SDK when it acks
export type RobotHead = {
    available : boolean;
    busy      : boolean;   // A look move is running
    pitch_deg : number;
    yaw_deg   : number;
};

// State Buddy reports in every ack
export type RobotState = {
    media_session_id : string;
    video            : RobotVideo;
    head             : RobotHead;
    last_error       : string | null;   // Most recent reason a frame was dropped
};


// --------------------------------------------------------------------------------
// Viewer Frames
// --------------------------------------------------------------------------------
// One look move Buddy can make
export type HeadDirection = "up" | "down" | "left" | "right" | "center";

// One sensor reading in a telemetry message
export type TelemetrySample = {
    source : string;                    // "body", "head", "motor_head", "motor_motion", "vocal"
    seq    : number;                    // Readings this source has sent since the app started
    values : Record<string, unknown>;   // Every public field of the SDK class
};

// One telemetry message from Buddy (newest reading per source)
export type TelemetryMessage = {
    media_session_id : string;
    samples          : TelemetrySample[];
};

// Buddy's answer to a head move (`state` is null when the backend refused it without asking Buddy)
export type HeadMoveAck = {
    id      : string;
    name    : string;
    ok      : boolean;
    message : string | null;
    state   : RobotState | null;
};

// Every frame the viewer socket sends as JSON
export type ViewerFrame =
    | {type: "media_session"; data: MediaSession         }
    | {type: "media_status";  data: {state: RobotState}  }
    | {type: "telemetry";     data: TelemetryMessage     }
    | {type: "command_ack";   data: HeadMoveAck          }
    | {type: "pong";          client_ts: number          };

// Header fields of one image message that the page reads
export type ImageHeader = {
    seq          : number;
    width        : number;
    height       : number;
    rotation_deg : number  | null;   // Display rotation still needed (null when unknown)
    mirrored     : boolean | null;   // Display mirroring still needed (null when unknown)
};

// One image, ready to show
export type ParsedImage = {
    header : ImageHeader;
    blob   : Blob;
};


// --------------------------------------------------------------------------------
// Read Frames
// --------------------------------------------------------------------------------
// Short text for one value (null or missing shows as a dash, never as zero)
export function formatValue(value: unknown): string {
    if ((value === null) || (value === undefined)) return "—";
    if (typeof value === "number")                 return Number.isInteger(value) ? String(value) : value.toFixed(2);
    if (typeof value === "string")                 return value;
    if (typeof value === "boolean")                return String(value);
    if (Array.isArray(value))                      return value.map(formatValue).join(", ");
    return JSON.stringify(value);
}

// One JSON frame from the viewer socket
export function parseViewerFrame(text: string): ViewerFrame {
    return JSON.parse(text);
}

// Split one `BMV1` message into its header and JPEG
export function parseImageMessage(buffer: ArrayBuffer): ParsedImage {
    const headerBytes         = new DataView(buffer).getUint32(4, false);
    const header: ImageHeader = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, IMAGE_PREFIX_BYTES, headerBytes)));
    const jpeg                = new Uint8Array(buffer, IMAGE_PREFIX_BYTES + headerBytes);
    return {header, blob: new Blob([jpeg], {type: "image/jpeg"})};
}
