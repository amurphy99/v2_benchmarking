/* 
Map word/message IDs to biomarker scores for transcript highlighting.
--------------------------------------------------------------------------------
`frontend/src/pages/transcript_playback/utils/useBiomarkerScores`

TODO: I think we still need to do the new mapping change for the message-wide
      version...

*/
import { useMemo } from "react";
import { ChatMessage, ChatBiomarkerScore } from "@/api";


// --------------------------------------------------------------------------------
// Build a map of word ID -> most-severe biomarker score (for WORDS)
// --------------------------------------------------------------------------------
// "Most severe" = lowest score value (0 = worst)
// Re-computed only when the biomarker selection or data changes (not on every timeupdate)
export function useBiomarkerWordScores(
    messages          : ChatMessage[],         // Messages from the session
    biomarkers        : ChatBiomarkerScore[],  // Biomarker scores for the session
    selectedBiomarker : string | null,         // Which type of scores to search for
    sessionStartMs    : number                 // Time anchor for reference
) {
    return useMemo(() => {
        if (!selectedBiomarker) return new Map<number, ChatBiomarkerScore>();

        // Convert timestamps to seconds-from-start
        const _toSec = (ts: string) => (new Date(ts).getTime() - sessionStartMs) / 1_000;
        const windows = biomarkers.filter(b =>
            b.score_type === selectedBiomarker && b.start_ts && b.end_ts
        );

        // Word ID -> most-severe (lowest score) ChatBiomarkerScore window the word falls into
        const scores = new Map<number, ChatBiomarkerScore>();
        for (const msg of messages) {
            for (const word of (msg.words ?? [])) {
                const wStart = _toSec(word.start_ts);
                const wEnd   = _toSec(word.  end_ts);
                for (const w of windows) {
                    if (wStart >= _toSec(w.start_ts!) && wEnd <= _toSec(w.end_ts!)) {
                        const prev = scores.get(word.id);
                        if (prev === undefined || w.score < prev.score) scores.set(word.id, w);
                    }
                }
            }
        }
        return scores;
    }, [selectedBiomarker, biomarkers, messages, sessionStartMs]);
}

// --------------------------------------------------------------------------------
// Build a map of message ID -> most-severe biomarker score (for MESSAGES)
// --------------------------------------------------------------------------------
export function useBiomarkerMessageScores(
    messages          : ChatMessage[],         // Messages from the session
    biomarkers        : ChatBiomarkerScore[],  // Biomarker scores for the session
    selectedBiomarker : string | null,         // Which type of scores to search for
    sessionStartMs    : number                 // Time anchor for reference
) {
    return useMemo(() => {
        if (!selectedBiomarker) return new Map<number, number>();

        // Convert timestamps to seconds-from-start
        const _toSec = (ts: string) => (new Date(ts).getTime() - sessionStartMs) / 1_000;
        const windows = biomarkers.filter(b => 
            b.score_type === selectedBiomarker && b.start_ts && b.end_ts
        );

        // Map Message ID -> Lowest Score
        // Prefer the message's word-level start/end (when available) over msg.ts,
        // because msg.ts can be the DB insertion time instead of the speech window
        // that biomarker scores actually align to.
        const scores = new Map<number, number>();
        for (const msg of messages) {
            const wordStart = msg.words?.length ? _toSec(msg.words[0                   ].start_ts) : null;
            const wordEnd   = msg.words?.length ? _toSec(msg.words[msg.words.length - 1].  end_ts) : null;

            // Fallback to 1s duration if no end_ts
            const mStart = wordStart ?? _toSec((msg as any).start_ts ?? msg.ts);
            const fallbackEnd = _toSec((msg as any).end_ts ?? msg.ts);
            const mEnd   = wordEnd ?? (fallbackEnd > mStart ? fallbackEnd : mStart + 1);

            for (const w of windows) {
                const wStart = _toSec(w.start_ts!);
                const wEnd   = _toSec(w.  end_ts!);

                // Check if message overlaps with the biomarker window
                const isOverlapping = mStart < wEnd && mEnd > wStart;
                if (isOverlapping) {
                    const prev = scores.get(msg.id);
                    if (prev === undefined || w.score < prev) { scores.set(msg.id, w.score); }
                }
            }
        }
        return scores;
    }, [selectedBiomarker, biomarkers, messages, sessionStartMs]);
}
