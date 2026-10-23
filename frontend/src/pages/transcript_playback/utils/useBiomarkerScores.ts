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
// Precompute biomarker windows into plain seconds (sorted by start)
// --------------------------------------------------------------------------------
// A "window" is one biomarker score with a start/end time. Convert the ISO
// timestamps to seconds-from-start ONCE here so the per-word/per-message loops
// below never call `new Date(...)` again (this was adding a long, ~5-10+ second
// delay on loading scores for longer transcripts due to millions of Date calls).
type TimedWindow = { start: number; end: number; ref: ChatBiomarkerScore };

function buildWindows(
    biomarkers        : ChatBiomarkerScore[],
    selectedBiomarker : string | null,
    sessionStartMs    : number,
): TimedWindow[] {
    if (!selectedBiomarker) return [];
    const toSec = (ts: string) => (new Date(ts).getTime() - sessionStartMs) / 1_000;
    return biomarkers
        .filter(    b  => b.score_type === selectedBiomarker && b.start_ts && b.end_ts)
        .map   (    b  => ({ start: toSec(b.start_ts!), end: toSec(b.end_ts!), ref: b }))
        .sort  ((a, b) => a.start - b.start);
}


// --------------------------------------------------------------------------------
// Build a map of word ID -> most-severe biomarker score (for WORDS)
// --------------------------------------------------------------------------------
// "Most severe" = lowest score value (0 = worst). A word can fall inside many
// overlapping windows (sliding-window biomarkers); we keep the lowest score.
// Re-computed only when the biomarker selection or data changes (not on every timeupdate)
export function useBiomarkerWordScores(
    messages          : ChatMessage[],         // Messages from the session
    biomarkers        : ChatBiomarkerScore[],  // Biomarker scores for the session
    selectedBiomarker : string | null,         // Which type of scores to search for
    sessionStartMs    : number                 // Time anchor for reference
) {
    return useMemo(() => {
        const scores = new Map<number, ChatBiomarkerScore>();
        if (!selectedBiomarker) return scores;

        // Pre-compute windows in seconds-from-start format, sorted by start
        const windows = buildWindows(biomarkers, selectedBiomarker, sessionStartMs);
        if (windows.length === 0) return scores;

        // Some biomarkers have multiple scores for each word (e.g., the 'Prosody'
        // biomarker uses 3-second windows with a 0.5 second step size). For these
        // ones we pick the lowest score associated with that word.
        //
        // To keep the process of selecting a score to highlight each word with, 
        // we do a "bounded scan" where we look for biomarker scores that could be 
        // close enough in time to the word. Then we binary-search that list to find
        // all scores associated with the word.
  
        // First index whose window.start >= target -- a window that fully contains 
        // the word has `end >= wEnd`, hence `start = end - width >= wEnd - maxWidth`. 
        // Now we can forward-scan only while `start <= wStart` (a tiny slice: 
        // ~maxWidth/step windows per word).
        const lowerBound = (target: number) => {
            let lo = 0, hi = windows.length;
            while (lo < hi) {
                const mid = (lo + hi) >> 1;
                if (windows[mid].start < target) lo = mid + 1;
                else                             hi = mid;
            }
            return lo;
        };
        const maxWidth = windows.reduce((m, w) => Math.max(m, w.end - w.start), 0);

        for (const msg of messages) {
            for (const word of (msg.words ?? [])) {
                const wStart = (new Date(word.start_ts).getTime() - sessionStartMs) / 1_000;
                const wEnd   = (new Date(word.  end_ts).getTime() - sessionStartMs) / 1_000;

                // Worst (lowest score) window that fully contains [wStart, wEnd]
                let best: ChatBiomarkerScore | undefined;
                for (let i = lowerBound(wEnd - maxWidth); i < windows.length && windows[i].start <= wStart; i++) {
                    const w = windows[i];
                    if (w.end >= wEnd && (best === undefined || w.ref.score < best.score)) best = w.ref;
                }

                if (best) scores.set(word.id, best);
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
        const scores = new Map<number, number>();
        if (!selectedBiomarker) return scores;

        // Convert timestamps to seconds-from-start
        const _toSec = (ts: string) => (new Date(ts).getTime() - sessionStartMs) / 1_000;

        // Windows precomputed to seconds ONCE (no `new Date` inside the loop below)
        const windows = buildWindows(biomarkers, selectedBiomarker, sessionStartMs);
        if (windows.length === 0) return scores;

        // Map Message ID -> Lowest Score
        // Prefer the message's word-level start/end (when available) over msg.ts,
        // because msg.ts can be the DB insertion time instead of the speech window
        // that biomarker scores actually align to.
        for (const msg of messages) {
            const wordStart = msg.words?.length ? _toSec(msg.words[0                   ].start_ts) : null;
            const wordEnd   = msg.words?.length ? _toSec(msg.words[msg.words.length - 1].  end_ts) : null;

            // Fallback to 1s duration if no end_ts
            const mStart = wordStart ?? _toSec((msg as any).start_ts ?? msg.ts);
            const fallbackEnd = _toSec((msg as any).end_ts ?? msg.ts);
            const mEnd   = wordEnd ?? (fallbackEnd > mStart ? fallbackEnd : mStart + 1);

            for (const w of windows) {
                // Check if message overlaps with the biomarker window
                const isOverlapping = mStart < w.end && mEnd > w.start;
                if (isOverlapping) {
                    const prev = scores.get(msg.id);
                    if (prev === undefined || w.ref.score < prev) { scores.set(msg.id, w.ref.score); }
                }
            }
        }
        return scores;
    }, [selectedBiomarker, biomarkers, messages, sessionStartMs]);
}
