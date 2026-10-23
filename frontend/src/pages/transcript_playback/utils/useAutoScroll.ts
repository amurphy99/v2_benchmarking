/* Pause transcript auto-scroll while the user is manually scrolling.
--------------------------------------------------------------------------------
`frontend/src/pages/transcript_playback/utils/useAutoScroll`

WordSpan auto-scrolls the active word into view as audio plays. That is annoying
when the viewer scrolls away to look at something -- each new word yanks them
back. This shares a single "auto-scroll allowed" flag (as a ref, so flipping it
never re-renders the thousands of WordSpans): manual scrolling (wheel/touchmove)
disables it, and it re-enables after `idleMs` of no manual scrolling.

We listen for `wheel`/`touchmove` (real user gestures) rather than `scroll`, so
the programmatic `scrollIntoView` we trigger doesn't falsely count as the user
scrolling.
*/
import { createContext, useEffect, useRef, RefObject } from "react";

// Shared flag: true => auto-scroll is allowed. Default true when no provider.
export const AutoScrollContext = createContext<RefObject<boolean> | null>(null);

// Sets up the manual-scroll listeners and returns the "allowed" ref to provide.
export function useAutoScrollControl(idleMs: number = 5_000): RefObject<boolean> {
    const allowedRef = useRef(true);

    useEffect(() => {
        let timer: ReturnType<typeof setTimeout> | undefined;

        const onManualScroll = () => {
            allowedRef.current = false;                 // pause while the user scrolls
            if (timer) clearTimeout(timer);
            timer = setTimeout(() => { allowedRef.current = true; }, idleMs); // resume after idle
        };

        window.addEventListener("wheel",     onManualScroll, { passive: true });
        window.addEventListener("touchmove", onManualScroll, { passive: true });
        return () => {
            if (timer) clearTimeout(timer);
            window.removeEventListener("wheel",     onManualScroll);
            window.removeEventListener("touchmove", onManualScroll);
        };
    }, [idleMs]);

    return allowedRef;
}
