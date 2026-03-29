import { useEffect, useRef } from "react";
import { ChatWord          } from "@/api";

interface Props {
    word          : ChatWord;
    sessionStartMs: number;
    currentTime   : number;
    isInBiomarker : boolean;
    onSeek        : (sec: number) => void;
}

// --------------------------------------------------------------------------------
// Wraps individual words (can click to seek; highlighted when active)
// --------------------------------------------------------------------------------
export default function WordSpan({ word, sessionStartMs, currentTime, isInBiomarker, onSeek }: Props) {
    const ref      = useRef<HTMLSpanElement>(null);
    // Convert the absolute time to relative (seconds since start); check if playback is on this word
    const start    = (new Date(word.start_ts).getTime() - sessionStartMs) / 1_000;
    const end      = (new Date(word.end_ts  ).getTime() - sessionStartMs) / 1_000;
    const isActive = currentTime >= start && currentTime < end;

    // Scroll the active word into view whenever it first becomes active
    useEffect(() => {
        if (isActive && ref.current) {
            ref.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }
    }, [isActive]);

    // Style modifier for different conditions
    //   active    => yellow highlight
    //   biomarker => purple underline
    let cls = "cursor-pointer rounded px-[2px] transition-colors";
    if      (isActive)      cls += " bg-yellow-300";
    else if (isInBiomarker) cls += " underline decoration-2 decoration-violet-500";

    return (
        <span
            ref       = {ref}
            className = {cls}
            onClick   = {() => onSeek(start)}
            title     = {`${start.toFixed(2)}s - ${end.toFixed(2)}s`}
        >
            {word.word}
        </span>
    );
}
