/* Admin viewer socket for one chat session's robot camera, telemetry, and state.
--------------------------------------------------------------------------------
`@frontend/src/pages/admin/robot_view/useMediaViewer`

Experimental (see `backend/chat_app/websocket/experimental/buddy/README.md`).
Opens `ws/chat/<id>/media/` beside the page's listener socket. It keeps only the
newest image (as an object URL, revoking the one it replaces so a long session
does not hold every frame), Buddy's newest state, and the newest telemetry sample
per sensor source.

*/
import { useEffect, useRef, useState } from "react";

// From this project
import      { getAccess                                                         } from "@/context/AuthProvider";
import      { useWsLatencyPing                                                  } from "@/hooks/chat-listener/ws/useWsLatencyPing";
import type { ImageHeader, JsonRecord, MediaSession, MediaStatus, TelemetrySample } from "./mediaFrames";
import      { parseImageMessage, parseViewerFrame                               } from "./mediaFrames";

// Delay before reconnecting an interrupted viewer socket
const MEDIA_RECONNECT_DELAY_MS = 1_000;

// Close codes that end the socket for good: normal close, not signed in, no access, no such session
const MEDIA_FINAL_CLOSE_CODES = [1_000, 4_001, 4_003, 4_404];

// Latency ping interval (pings also keep the proxy from closing a quiet socket)
const MEDIA_PING_INTERVAL_MS = 3_000;

// Image arrival times kept for the measured frame rate
const MEDIA_FPS_WINDOW = 10;


// --------------------------------------------------------------------------------
// Viewer Types
// --------------------------------------------------------------------------------
// The newest image, ready for an <img>
export type ShownImage = {
    url        : string;        // Object URL (revoked when the next image replaces it)
    header     : ImageHeader;   // Sequence, size, and display transform
    receivedAt : number;        // Browser time it arrived (ms)
};

// Newest sample from one sensor source
export type SourceTelemetry = {
    sample     : TelemetrySample;
    receivedAt : number;   // Browser time it arrived (ms)
};

// Everything the robot page reads from the viewer socket
export type MediaViewer = {
    connected    : boolean;
    session      : MediaSession;
    status       : MediaStatus | null;
    image        : ShownImage  | null;
    measuredFps  : number      | null;   // Images per second arriving here
    telemetry    : Record<string, SourceTelemetry>;
    droppedTotal : JsonRecord;           // Samples Buddy reports dropping, per source
    latencyMs    : number      | null;
};


// Viewer socket URL for one session (it carries the access token, so it is never logged)
function buildMediaViewerWsUrl(sessionId: string | undefined): string | null {
    if (!sessionId) return null;
    const base = (location.hostname === "localhost")
        ? `ws://localhost:8000/ws/chat/${sessionId}/media/`
        : `wss://${location.host}/ws/chat/${sessionId}/media/`;
    return `${base}?token=${getAccess()}&source=webapp`;
}


// ================================================================================
// Media Viewer
// ================================================================================
// Watch one chat session's robot media
export function useMediaViewer(sessionId: string | undefined): MediaViewer {
    const [connected,    setConnected   ] = useState<boolean>(false);
    const [session,      setSession     ] = useState<MediaSession>({status: "none", media_session_id: null});
    const [status,       setStatus      ] = useState<MediaStatus | null>(null);
    const [image,        setImage       ] = useState<ShownImage  | null>(null);
    const [measuredFps,  setMeasuredFps ] = useState<number      | null>(null);
    const [telemetry,    setTelemetry   ] = useState<Record<string, SourceTelemetry>>({});
    const [droppedTotal, setDroppedTotal] = useState<JsonRecord>({});
    const [latencyMs,    setLatencyMs   ] = useState<number      | null>(null);

    // Read inside socket callbacks without reopening the socket
    const wsRef           = useRef<WebSocket | null>(null);
    const imageUrlRef     = useRef<string    | null>(null);   // Object URL now shown
    const arrivalsRef     = useRef<number[]       >([]  );   // Recent image arrival times
    const mediaSessionRef = useRef<string    | null>(null);   // Media session the cached data belongs to

    const wsUrl = buildMediaViewerWsUrl(sessionId);

    // --------------------------------------------------------------------------------
    // Socket
    // --------------------------------------------------------------------------------
    useEffect(() => {
        if (!wsUrl) return;
        let disposed       = false;
        let reconnectTimer : number | null = null;

        // A new media session (Video turned on again) replaces the old one's data and image
        const resetForSession = (mediaSessionId: string | null): void => {
            if (mediaSessionId === mediaSessionRef.current) return;
            mediaSessionRef.current = mediaSessionId;
            arrivalsRef.current     = [];
            if (imageUrlRef.current !== null) URL.revokeObjectURL(imageUrlRef.current);
            imageUrlRef.current = null;
            setStatus(null); setImage(null); setTelemetry({}); setDroppedTotal({}); setMeasuredFps(null);
        };

        // Show one image, freeing the memory of the one it replaces
        const showImage = (buffer: ArrayBuffer): void => {
            const parsed = parseImageMessage(buffer);
            const now    = Date.now();
            const url    = URL.createObjectURL(parsed.blob);
            if (imageUrlRef.current !== null) URL.revokeObjectURL(imageUrlRef.current);
            imageUrlRef.current = url;
            setImage({url, header: parsed.header, receivedAt: now});

            // Frame rate over the last few arrivals
            const arrivals = [...arrivalsRef.current, now].slice(-MEDIA_FPS_WINDOW);
            const spanMs   = arrivals[arrivals.length - 1] - arrivals[0];
            arrivalsRef.current = arrivals;
            setMeasuredFps(((arrivals.length > 1) && (spanMs > 0)) ? ((arrivals.length - 1) * 1_000 / spanMs) : null);
        };

        // Keep the newest sample per source (Buddy sends each source's samples oldest first)
        const takeSamples = (samples: TelemetrySample[]): void => {
            const now = Date.now();
            setTelemetry((prev: Record<string, SourceTelemetry>): Record<string, SourceTelemetry> => {
                const next = {...prev};
                for (const sample of samples) next[sample.source] = {sample, receivedAt: now};
                return next;
            });
        };

        // Binary messages are images; text messages are JSON frames
        const onMessage = (event: MessageEvent): void => {
            if (event.data instanceof ArrayBuffer) { showImage(event.data); return; }

            const frame = parseViewerFrame(event.data);
            switch (frame.type) {
                case "media_session" : resetForSession(frame.data.media_session_id); setSession(frame.data); break;
                case "media_status"  : setStatus(frame.data);                                               break;
                case "telemetry"     : setDroppedTotal(frame.data.dropped_total); takeSamples(frame.data.samples); break;
                case "pong"          : setLatencyMs(Date.now() - frame.client_ts);                         break;
            }
        };

        // Open one socket, and schedule a retry when it drops for a retryable reason
        const connect = (): void => {
            if (disposed) return;
            const ws = new WebSocket(wsUrl);
            ws.binaryType = "arraybuffer";
            wsRef.current = ws;
            ws.onopen     = (): void => setConnected(true);
            ws.onmessage  = onMessage;

            // `onclose` owns retries (browsers fire `error` and then `close`)
            ws.onerror = (): void => setConnected(false);
            ws.onclose = (event: CloseEvent): void => {
                if (wsRef.current === ws) wsRef.current = null;
                setConnected(false);
                if (!disposed && !MEDIA_FINAL_CLOSE_CODES.includes(event.code)) reconnectTimer = window.setTimeout(connect, MEDIA_RECONNECT_DELAY_MS);
            };
        };

        connect();
        return (): void => {
            disposed = true;
            if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
            wsRef.current?.close();
            wsRef.current = null;
        };
    }, [wsUrl]);

    // Free the last image when the page closes
    useEffect(() => (): void => { if (imageUrlRef.current !== null) URL.revokeObjectURL(imageUrlRef.current); }, []);

    // Latency pings (the replies arrive as `pong` frames above)
    useWsLatencyPing({connected, wsRef, pingIntervalMs: MEDIA_PING_INTERVAL_MS});

    return {connected, session, status, image, measuredFps, telemetry, droppedTotal, latencyMs};
}
