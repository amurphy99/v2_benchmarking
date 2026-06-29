/* Per-transcript-row biomarker statistics for the 'ScoreRail'.
--------------------------------------------------------------------------------
`frontend/src/pages/transcript_playback/biomarkers/useRailStats`

Statistics for filling out the data for the `ScoreRailItem.tsx` UI component.

TODO: The threshold used to flag scores can be adjusted.
TODO: We can also adjust what statistics we specifically want to use.

*/
// From this project
import { ChatBiomarkerScore, ChatWord } from "@/api";

// Threshold for a score to be "flagged" (arbitrarily set to 0.5 for now)
const FLAG_THRESH = 0.500;

// --------------------------------------------------------------------------------
// Per-utterance statistics derived from the word-level biomarker scores
// --------------------------------------------------------------------------------
export interface RailStats {
    worst        : number;  // Lowest (most severe) score in the utterance
    avg          : number;  // Mean score across flagged words
    spanCount    : number;  // Number of distinct biomarker windows touching the utterance
    flaggedCount : number;  // Number of scores below a threshold (e.g., <= 0.50)
}

// --------------------------------------------------------------------------------
// Format a row's word-level biomarker scores for the info rail
// --------------------------------------------------------------------------------
export function railStatsForWords(
    words      : ChatWord[] | null,
    wordScores : Map<number, ChatBiomarkerScore>,
): RailStats | null {
    if (!words || words.length === 0) return null;

    // Get scores for the given words only
    const found: ChatBiomarkerScore[] = [];
    for (const w of words) { const s = wordScores.get(w.id); if (s) found.push(s); }
    if (found.length === 0) return null;

    // Statistics
    const worst     = Math.min(...found.map(s => s.score));
    const avg       = found.reduce((a, s) => a + s.score, 0) / found.length;
    const spanCount = new Set(found.map(s => s.id)).size;

    // Filter for high scores first, then get unique IDs
    const flaggedCount = new Set(
        found.filter(s => s.score <= FLAG_THRESH).map(s => s.id)
    ).size;

    return { worst, avg, spanCount, flaggedCount };
}
