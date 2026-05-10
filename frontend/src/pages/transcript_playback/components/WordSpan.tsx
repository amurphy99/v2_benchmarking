/* Wrap individual words for seeking and biomarker highlighting.
--------------------------------------------------------------------------------
`frontend/src/pages/transcript_playback/components/WordSpan.tsx`

Active     => soft outline (rectangular, no fill rounding)
Biomarker  => severity-colored fill (red/amber/lime), opacity scales with score.
              No rounded corners so consecutive words in the same biomarker
              group read as a single highlighted span.
Both       => fill + outline (different visual channels, no clash).

To make the biomarker highlights look seemless across words, I add the space
between words here in the text, set the gap between them to 0 in the file that
contains the list of these objects, and don't use rounded corners. 

TODO: I need to try removing that little space

*/
import { CSSProperties, useEffect, useRef } from "react";
import { ChatWord                         } from "@/api";
import { severityStyle                    } from "../biomarkers/severity";

interface Props {
    word          : ChatWord;
    sessionStartMs: number;
    currentTime   : number;
    biomarkerScore: number | null;
    punct         : string | null;
    onSeek        : (sec: number) => void;
}

// ================================================================================
// Wraps individual words (click to seek to where the word is in the audio file)
// ================================================================================
export default function WordSpan({ word, sessionStartMs, currentTime, biomarkerScore, punct, onSeek }: Props) {
    const ref      = useRef<HTMLSpanElement>(null);

    // Convert the absolute time to relative (seconds since start); check if playback is on this word
    const start    = (new Date(word.start_ts).getTime() - sessionStartMs) / 1_000;
    const end      = (new Date(word.  end_ts).getTime() - sessionStartMs) / 1_000;
    const isActive = currentTime >= start && currentTime < end;

    // Scroll the active word into view whenever it first becomes active
    useEffect(() => {
        if (isActive && ref.current) {
            ref.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }
    }, [isActive]);

    // Style modifiers for different conditions
    const sev = severityStyle(biomarkerScore);
    const style: CSSProperties = {};
    if (sev.bgColor)   style.backgroundColor = sev.bgColor;
    if (sev.textColor) style.color           = sev.textColor;

    // No `rounded-*` tag here -- consecutive words in the same group look like they share a highlight
    // Outline on hover/active uses outline-* (a separate visual channel from background-color) so it doesn't fight the biomarker fill.
    let cls = "cursor-pointer px-[0px] transition-colors hover:outline hover:outline-2 hover:outline-offset-1 hover:outline-admin-text/30";
    if (isActive) cls += " outline outline-2 outline-offset-1 outline-admin-text/70";

    // If the word is from the user, then do the word replacement thing
    const show_word = word.word.replace(/[^A-Za-z0-9']+$/, "");

    // UI Component
    return (
        <span
            ref       = {ref}
            className = {cls}
            style     = {style}
            onClick   = {() => onSeek(start)}
            title     = {`${start.toFixed(2)}s - ${end.toFixed(2)}s`}
        >
            {(word.index > 0) ? " " : ""}{show_word}{punct}
        </span>
    );
}
