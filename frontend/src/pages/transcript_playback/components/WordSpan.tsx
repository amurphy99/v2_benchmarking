/* 
Wrap individual words for seeking and biomarker highlighting.
--------------------------------------------------------------------------------
`frontend/src/pages/transcript_playback/components/WordSpan`

Active    => word is underlined while it is being spoken
Biomarker => purple rgba background; opacity = 1 - score (score=0 -> full, score=1 -> none)
Both      => purple background + underline

To make the biomarker highlights look seemless across words, I add the space
between words here in the text, set the gap between them to 0 in the file that
contains the list of these objects, and don't use rounded corners. 

TODO: Might need to change the "active" highlight style

*/
import { CSSProperties, useEffect, useRef } from "react";
import { ChatWord                         } from "@/api";

interface Props {
    word          : ChatWord;
    sessionStartMs: number;
    currentTime   : number;
    biomarkerScore: number | null; // null = not in a biomarker region
    punct         : string | null; // trailing punctuation from utterance text (e.g. ",", ".")
    onSeek        : (sec: number) => void;
}

// --------------------------------------------------------------------------------
// Wraps individual words (click to seek to where the word is in the audio file)
// --------------------------------------------------------------------------------
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
    let cls = "cursor-pointer px-[2px] transition-colors hover:underline hover:decoration-3 hover:decoration-red-500";
    if (isActive) cls += " underline decoration-3 decoration-red-500";

    // Purple background with opacity proportional to severity (score=0 -> fully opaque)
    const style: CSSProperties = {};
    if (biomarkerScore !== null) {
        style.backgroundColor = `rgba(139, 92, 246, ${(1 - biomarkerScore).toFixed(2)})`;
    }

    // UI Component
    return (
        <span
            ref       = {ref}
            className = {cls}
            style     = {style}
            onClick   = {() => {onSeek(start); console.log(`${start.toFixed(2)}s - ${end.toFixed(2)}s`)}}
            title     = {`${start.toFixed(2)}s - ${end.toFixed(2)}s`}
        >
            {(word.index > 0) ? " " : ""}{word.word}{punct}
        </span>
    );
}
