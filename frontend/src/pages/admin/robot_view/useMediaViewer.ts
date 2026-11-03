/* Admin viewer socket: one session's robot camera, telemetry, state, and head.
--------------------------------------------------------------------------------
`@frontend/src/pages/admin/robot_view/useMediaViewer`

Experimental (see `backend/chat_app/websocket/experimental/buddy/README.md`).
Opens `ws/chat/<id>/media/` beside the page's listener socket. It keeps only the
newest image (as an object URL, revoking the one it replaces so a long session
does not hold every frame), Buddy's newest state, and the newest reading per
sensor source. Head moves go out on the same socket, one at a time: the next
button press waits for Buddy's ack of the last one.

*/
import { useEffect, useRef, useState } from "react";

// From this project
import      { getAccess                                                                        } from "@/context/AuthProvider";
import      { useWsLatencyPing                                                                 } from "@/hooks/chat-listener/ws/useWsLatencyPing";
import type { HeadDirection, HeadMoveAck, ImageHeader, MediaSession, RobotState, TelemetrySample } from "./mediaFrames";
import      { parseImageMessage, parseViewerFrame                                              } from "./mediaFrames";

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

// Newest reading from one sensor source
export type SourceTelemetry = {
    sample    : TelemetrySample;
    changedAt : number;   // Browser time its `seq` last changed (Buddy resends a reading until the sensor reports again)
};

// The head move waiting for Buddy's ack, and Buddy's answer to the last one
export type HeadMoveState = {
    pending : HeadDirection | null;
    last    : {direction: HeadDirection; ok: boolean; message: string | null} | null;
};

// Everything the robot page reads from the viewer socket
export type MediaViewer = {
    connected   : boolean;
    session     : MediaSession;
    robotState  : RobotState | null;
    image       : ShownImage | null;
    measuredFps : number     | null;   // Images per second arriving here
    telemetry   : Record<string, SourceTelemetry>;
    headMove    : HeadMoveState;
    moveHead    : (direction: HeadDirection) => void;
    latencyMs   : number     | null;
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
// Watch one chat session's robot media, and move the robot's head
export function useMediaViewer(sessionId: string | undefined): MediaViewer {
    const [connected,   setConnected  ] = useState<boolean>(false);
    const [session,     setSession    ] = useState<MediaSession>({status: "none", media_session_id: null});
    const [robotState,  setRobotState ] = useState<RobotState | null>(null);
    const [image,       setImage      ] = useState<ShownImage | null>(null);
    const [measuredFps, setMeasuredFps] = useState<number     | null>(null);
    const [telemetry,   setTelemetry  ] = useState<Record<string, SourceTelemetry>>({});
    const [headMove,    setHeadMove   ] = useState<HeadMoveState>({pending: null, last: null});
    const [latencyMs,   setLatencyMs  ] = useState<number     | null>(null);

    // Read inside socket callbacks without reopening the socket
    const wsRef           = useRef<WebSocket | null>(null);
    const imageUrlRef     = useRef<string    | null>(null);   // Object URL now shown
    const arrivalsRef     = useRef<number[]       >([]  );   // Recent image arrival times
    const mediaSessionRef = useRef<string    | null>(null);   // Media session the cached data belongs to
    const moveCountRef    = useRef<number         >(0   );   // Head moves sent (for command IDs)
    const pendingMoveRef  = useRef<{id: string; direction: HeadDirection} | null>(null);

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
            setRobotState(null); setImage(null); setTelemetry({}); setMeasuredFps(null);
        };

        // Stop waiting for a head move's ack (the media socket it went to changed or closed)
        const dropPendingMove = (): void => {
            pendingMoveRef.current = null;
            setHeadMove((prev: HeadMoveState): HeadMoveState => ({...prev, pending: null}));
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

        // Keep the newest reading per source, noting when each source's `seq` last moved
        const takeSamples = (samples: TelemetrySample[]): void => {
            const now = Date.now();
            setTelemetry((prev: Record<string, SourceTelemetry>): Record<string, SourceTelemetry> => {
                const next = {...prev};
                for (const sample of samples) {
                    const before: SourceTelemetry | undefined = prev[sample.source];
                    const repeat = (before !== undefined) && (before.sample.seq === sample.seq);
                    next[sample.source] = {sample, changedAt: repeat ? before.changedAt : now};
                }
                return next;
            });
        };

        // Buddy's answer to this page's head move (other pages' acks never reach this socket)
        const takeHeadMoveAck = (ack: HeadMoveAck): void => {
            const move = pendingMoveRef.current;
            if ((move === null) || (move.id !== ack.id)) return;
            pendingMoveRef.current = null;
            setHeadMove({pending: null, last: {direction: move.direction, ok: ack.ok, message: ack.message}});
        };

        // Binary messages are images; text messages are JSON frames
        const onMessage = (event: MessageEvent): void => {
            if (event.data instanceof ArrayBuffer) { showImage(event.data); return; }

            const frame = parseViewerFrame(event.data);
            switch (frame.type) {
                case "media_session" : resetForSession(frame.data.media_session_id); dropPendingMove(); setSession(frame.data); break;
                case "media_status"  : setRobotState(frame.data.state);                                                       break;
                case "telemetry"     : takeSamples(frame.data.samples);                                                       break;
                case "command_ack"   : takeHeadMoveAck(frame.data);                                                          break;
                case "pong"          : setLatencyMs(Date.now() - frame.client_ts);                                            break;
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
                dropPendingMove();
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

    // --------------------------------------------------------------------------------
    // Head Moves
    // --------------------------------------------------------------------------------
    // Ask Buddy to look one way (a click that lands before the buttons re-render is ignored)
    const moveHead = (direction: HeadDirection): void => {
        const ws = wsRef.current;
        if ((ws === null) || (pendingMoveRef.current !== null)) return;

        // Wait for this move's ack before the next one
        moveCountRef.current += 1;
        const id = `move-${moveCountRef.current}`;
        pendingMoveRef.current = {id, direction};
        setHeadMove((prev: HeadMoveState): HeadMoveState => ({...prev, pending: direction}));
        ws.send(JSON.stringify({type: "command", data: {id, name: "move_head", data: {direction}}}));
    };

    return {connected, session, robotState, image, measuredFps, telemetry, headMove, moveHead, latencyMs};
}
