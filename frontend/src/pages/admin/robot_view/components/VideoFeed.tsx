/* Robot camera image, with the camera's status, frame age, and frame rate.
--------------------------------------------------------------------------------
`@frontend/src/pages/admin/robot_view/components/VideoFeed`

Experimental (see `backend/chat_app/websocket/experimental/buddy/README.md`).
Shows the newest image the robot sent. Before the first image, and after the
camera stops, a message says what the camera is waiting for, so a problem during
testing is visible without reading the backend logs.

*/
import type { CSSProperties, ReactElement } from "react";

// From this project
import type { PillVariant                     } from "@/pages/admin/components/ui/Pill";
import      { Pill                            } from "@/pages/admin/components/ui/Pill";
import type { MediaSession, MediaSessionStatus } from "../mediaFrames";
import type { ShownImage                      } from "../useMediaViewer";
import      { useNow                          } from "../useNow";

// How often the frame-age label refreshes
const FRAME_AGE_TICK_MS = 1_000;

// Frame age past which the image is dimmed as stale
const FRAME_STALE_MS = 5_000;

// What the camera area says when it has no current image
const EMPTY_MESSAGE: Record<MediaSessionStatus, string> = {
    none      : "Camera not connected. Turn on Video on the robot.",
    connected : "Robot connected. Waiting for its camera to start.",
    ready     : "Camera started. Waiting for the first image.",
    stopped   : "Camera stopped on the robot.",
    ended     : "Camera disconnected.",
};

// Pill color for each camera status
const STATUS_VARIANT: Record<MediaSessionStatus, PillVariant> = {
    none      : "offline",
    connected : "accent",
    ready     : "live",
    stopped   : "paused",
    ended     : "offline",
};


// ================================================================================
// Video Feed
// ================================================================================
// Newest camera image with its status pills
export default function VideoFeed({connected, session, image, measuredFps}: {
    connected   : boolean;              // Viewer socket is open
    session     : MediaSession;         // Robot media socket's lifecycle
    image       : ShownImage | null;    // Newest image (null before the first)
    measuredFps : number     | null;    // Images per second arriving here
}): ReactElement {
    // Frame age, refreshed every second even when no image arrives
    const now   = useNow(FRAME_AGE_TICK_MS);
    const ageMs = (image !== null) ? Math.max(0, now - image.receivedAt) : null;
    const stale = (ageMs !== null) && (ageMs > FRAME_STALE_MS);

    // Rotation and mirroring the robot says the image still needs
    const transforms: string[] = [];
    if ((image !== null) && (image.header.rotation_deg !== null) && (image.header.rotation_deg !== 0)) transforms.push(`rotate(${image.header.rotation_deg}deg)`);
    if ((image !== null) && (image.header.mirrored === true))                                          transforms.push("scaleX(-1)");
    const imageStyle: CSSProperties | undefined = (transforms.length > 0) ? {transform: transforms.join(" ")} : undefined;

    // Message over the image area when there is no current image
    const live    = (image !== null) && (session.status === "ready");
    const message = connected ? EMPTY_MESSAGE[session.status] : "Viewer disconnected. Reconnecting…";

    return (
        <section className="shrink-0 rounded-xl border border-admin-border bg-admin-panel shadow-sm overflow-hidden">
            {/* Status row */}
            <header className="flex items-center justify-between gap-3 px-4 py-2 border-b border-admin-border flex-wrap">
                <div className="text-sm font-semibold text-admin-text">Robot Camera</div>
                <div className="flex items-center gap-2 flex-wrap justify-end">
                    <Pill dot variant={STATUS_VARIANT[session.status]} label="Camera" value={session.status} />
                    <Pill variant={stale ? "paused" : "info"} label="Last image" value={(ageMs !== null) ? `${(ageMs / 1_000).toFixed(1)} s ago` : "—"} />
                    <Pill label="FPS"  value={(measuredFps !== null) ? measuredFps.toFixed(1) : "—"} />
                    <Pill label="Size" value={(image !== null) ? `${image.header.width}×${image.header.height}` : "—"} />
                </div>
            </header>

            {/* Image, dimmed when stale or no longer live, with a message when there is nothing current */}
            <div className="relative h-[40vh] min-h-[240px] w-full bg-black flex items-center justify-center overflow-hidden">
                {(image !== null) ? (
                    <img
                        src       = {image.url}
                        alt       = "Robot camera"
                        className = {`h-full w-full object-contain ${(live && !stale) ? "" : "opacity-50"}`}
                        style     = {imageStyle}
                    />
                ) : null}
                {!live ? (
                    <div className="absolute inset-0 flex items-center justify-center p-4 text-center text-sm text-white/80">{message}</div>
                ) : null}
            </div>
        </section>
    );
}
