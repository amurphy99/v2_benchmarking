/* 
Different formatting operations to run on full utterances of the chat.
--------------------------------------------------------------------------------
`frontend/src/pages/transcript_playback/utils/utteranceFormatting`

*/
import { ChatMessage, ChatWord, ChatBiomarkerScore } from "@/api";


// --------------------------------------------------------------------------------
// Per-message wall-clock start/end (prefers word timestamps -> msg.start_ts/end_ts -> msg.ts)
// --------------------------------------------------------------------------------
export function getMessageTimespan(msg: ChatMessage): { start: string; end: string } {
    if (msg.words && msg.words.length > 0) {
        return { start: msg.words[0].start_ts, end: msg.words[msg.words.length - 1].end_ts };
    }
    return {
        start: msg.start_ts ?? msg.ts,
        end  : msg.  end_ts ?? msg.ts,
    };
}


// --------------------------------------------------------------------------------
// Split a turn into visual pieces wherever there is a long silent gap
// --------------------------------------------------------------------------------
// Turns are grouped by `uttID` in the backend, so a long uninterrupted monologue
// can arrive as one giant utterance. For display only, we split a word list into
// contiguous slices wherever the silence between consecutive words
// (word[i].start_ts - word[i-1].end_ts) exceeds `thresholdSec`. Word order is
// preserved and a turn with no long gaps yields a single slice (unchanged).
export const GAP_SPLIT_SECONDS = 1.5;

export function splitWordsByGap(words: ChatWord[], thresholdSec: number = GAP_SPLIT_SECONDS): ChatWord[][] {
    if (words.length === 0) return [];

    const pieces : ChatWord[][] = [];
    let   current: ChatWord[]   = [words[0]];

    for (let i = 1; i < words.length; i++) {
        const prevEnd   = new Date(words[i - 1].end_ts  ).getTime();
        const currStart = new Date(words[i    ].start_ts).getTime();
        const gapSec    = (currStart - prevEnd) / 1_000;

        if (gapSec > thresholdSec) { pieces.push(current); current   = [words[i]]; }
        else                       {                       current.push(words[i]); }
    }
    pieces.push(current);
    return pieces;
}


// --------------------------------------------------------------------------------
// "Segment" => consecutive words sharing the same biomarker window (or none)
// --------------------------------------------------------------------------------
export type WordSegment = { biomarker: ChatBiomarkerScore | null; words: ChatWord[] };

// Build WordSegments for the given list of ChatWords
export function buildSegments(words: ChatWord[], scores: Map<number, ChatBiomarkerScore>): WordSegment[] {
    const segments: WordSegment[] = [];
    let current: WordSegment | null = null;
    for (const word of words) {
        // Use the map of word -> ChatBiomarkerScore object to group all words for each biomarker
        const bm     = scores.get(word.id)    ?? null;
        const bmId   = bm?.id                 ?? null;
        const prevId = current?.biomarker?.id ?? null;

        if (!current || bmId !== prevId) { current = { biomarker: bm, words: [word] }; segments.push(current); } 
        else                             { current.words.push(word); }
    }
    return segments;
}


// --------------------------------------------------------------------------------
// Try to map utterance punctuation to the individual words
// --------------------------------------------------------------------------------
export function getPunctSuffixes(words: ChatWord[], content: string): (string | null)[] {
    // Match a word token followed by any non-word, non-space characters (punctuation)
    const regex  = /([A-Za-z0-9']+)([^A-Za-z0-9'\s]*)/g;
    const tokens: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = regex.exec(content)) !== null) tokens.push(m[2]);
    if (tokens.length !== words.length) return words.map(() => null);
    return tokens.map(t => t || null);
}


// --------------------------------------------------------------------------------
// Extract capitalization from the original content for each word
// --------------------------------------------------------------------------------
// Returns true for each word whose token in msg.content was uppercase-initial.
// Covers: first word, post-sentence words, and standalone "I".
export function getCapFlags(words: ChatWord[], content: string): boolean[] {
    const regex = /([A-Za-z0-9']+)([^A-Za-z0-9'\s]*)/g;
    const caps: boolean[] = [];
    let m: RegExpExecArray | null;
    while ((m = regex.exec(content)) !== null) {
        const ch = m[1].charCodeAt(0);
        caps.push(ch >= 65 && ch <= 90); // A-Z
    }
    if (caps.length !== words.length) return words.map(() => false);
    return caps;
}
