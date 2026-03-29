import { useMemo } from "react";

// From this project
import { ChatMessage, ChatBiomarkerScore } from "@/api";
import { blockStyle                      } from "@/utils/styling/sharedStyles";
import   UtteranceLine                     from "./UtteranceLine";

interface Props {
    messages         : ChatMessage[];
    biomarkers       : ChatBiomarkerScore[];
    sessionStartMs   : number;
    currentTime      : number;
    selectedBiomarker: string;
    userName         : string;
    onSeek           : (sec: number) => void;
}

// ================================================================================
// Display the transcript (sorted messages with highlighted word IDs)
// ================================================================================
export default function PlaybackTranscript({ messages, biomarkers, sessionStartMs, currentTime, selectedBiomarker, userName, onSeek }: Props) {

    // --------------------------------------------------------------------------------
    // Build the set of word IDs that fall inside the selected biomarker's time windows
    // --------------------------------------------------------------------------------
    // Re-computed only when the biomarker selection or data changes (not on every timeupdate)
    const biomarkerWordIds = useMemo(() => {
        if (!selectedBiomarker) return new Set<number>();

        // Change timestamps to seconds-from-start
        const _toSec = (ts: string) => (new Date(ts).getTime() - sessionStartMs) / 1_000;
        const windows = biomarkers.filter(b =>
            b.score_type === selectedBiomarker && b.start_ts && b.end_ts
        );
        
        // Word ID set
        const ids = new Set<number>();
        for (const msg of messages) {
            for (const word of (msg.words ?? [])) {
                const wStart = _toSec(word.start_ts);
                const wEnd   = _toSec(word.  end_ts);
                if (windows.some(w => wStart >= _toSec(w.start_ts!) && wEnd <= _toSec(w.end_ts!))) {
                    ids.add(word.id);
                }
            }
        }
        return ids;
    }, [selectedBiomarker, biomarkers, messages, sessionStartMs]);

    // --------------------------------------------------------------------------------
    // Sort the messages and display; including the list of words to highlight
    // --------------------------------------------------------------------------------
    const sorted = [...messages].sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());

    // TODO: Not sure if I should keep this: max-h-[60vh]
    return (
        <div className={`${blockStyle} overflow-y-auto`}>
            {sorted.map(msg => (
                <UtteranceLine
                    key             ={msg.id}
                    msg             ={msg}
                    userName        ={userName}
                    sessionStartMs  ={sessionStartMs}
                    currentTime     ={currentTime}
                    biomarkerWordIds={biomarkerWordIds}
                    onSeek          ={onSeek}
                />
            ))}
        </div>
    );
}
