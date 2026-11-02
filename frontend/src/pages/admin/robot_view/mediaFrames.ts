/* Frames on the admin media viewer socket, and the `BMV1` image reader.
--------------------------------------------------------------------------------
`@frontend/src/pages/admin/robot_view/mediaFrames`

Experimental (see `backend/chat_app/websocket/experimental/buddy/README.md`).
Mirrors `media_consumer.py` and `viewer_consumer.py` there, and field names keep
the backend's spelling. Buddy sends what its contract says, so frames are read
without field checks. Robot state, capabilities, and telemetry values belong to
Buddy and are kept as plain records, shown as sent.

Images arrive as binary messages: the four bytes `BMV1`, a four-byte big-endian
header length, that many bytes of UTF-8 JSON, then the JPEG.

*/
// Bytes before an image's JSON header: `BMV1`, then the header length
const IMAGE_PREFIX_BYTES = 8;


// --------------------------------------------------------------------------------
// Frame Types
// --------------------------------------------------------------------------------
// Where Buddy's media socket is in its life: no socket, socket open, started, stopped, or closed
export type MediaSessionStatus = "none" | "connected" | "ready" | "stopped" | "ended";

// Any JSON object whose fields Buddy defines
export type JsonRecord = Record<string, unknown>;

// Buddy's media socket's lifecycle
export type MediaSession = {
    status           : MediaSessionStatus;
    media_session_id : string | null;
};

// Newest robot state and capabilities the backend has seen
export type MediaStatus = {
    state        : JsonRecord;          // `state_revision`, `robot_elapsed_ms`, `video`, `head`, `last_error`, ...
    capabilities : JsonRecord | null;   // `sensors`, `video`, `head` limits; null until Buddy sends them
};

// One sensor reading in a telemetry batch
export type TelemetrySample = {
    source : string;       // "motor_head", "body", ...
    seq    : number;       // Per-source counter
    values : JsonRecord;   // Raw SDK fields
};

// One telemetry batch from Buddy
export type TelemetryBatch = {
    batch_seq     : number;
    dropped_total : JsonRecord;          // Samples Buddy dropped so far, per source
    samples       : TelemetrySample[];
};

// Every frame the viewer socket sends as JSON
export type ViewerFrame =
    | {type: "media_session"; data: MediaSession  }
    | {type: "media_status";  data: MediaStatus   }
    | {type: "telemetry";     data: TelemetryBatch}
    | {type: "pong";          client_ts: number   };

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
// Reading Values
// --------------------------------------------------------------------------------
// A plain JSON object
function isRecord(value: unknown): value is JsonRecord {
    return (typeof value === "object") && (value !== null) && !Array.isArray(value);
}

// Follow a path of keys through Buddy's nested records (undefined when a step is missing)
export function pathValue(record: JsonRecord | null, ...keys: string[]): unknown {
    let current: unknown = record;
    for (const key of keys) {
        if (!isRecord(current)) return undefined;
        current = current[key];
    }
    return current;
}

// Short text for one value (null or missing shows as a dash, never as zero)
export function formatValue(value: unknown): string {
    if ((value === null) || (value === undefined)) return "—";
    if (typeof value === "number")                 return Number.isInteger(value) ? String(value) : value.toFixed(2);
    if (typeof value === "string")                 return value;
    if (typeof value === "boolean")                return String(value);
    if (Array.isArray(value))                      return value.map(formatValue).join(", ");
    return JSON.stringify(value);
}


// ================================================================================
// Read Frames
// ================================================================================
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
