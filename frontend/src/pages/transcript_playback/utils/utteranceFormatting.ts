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
