/* Tally a chat for its end bar: length, messages, and the participant's words.
--------------------------------------------------------------------------------
`@frontend/src/pages/chat/useChatStats`

Counted from the messages the backend saves, which it echoes to the page
(`message` frames), so the numbers match the saved transcript: speech the
backend joined into one message counts once. The length runs from the first
Start until the chat was over, pauses included.

*/
import { useCallback, useState } from "react";

// From this project
import type { ChatRole } from "@/api";

// What the end bar shows about a chat
export type ChatStats = {
    durationSec : number | null;   // From the first Start until the chat was over (null until it is)
    messages    : number;          // Saved messages, from both sides
    words       : number;          // Words in the participant's saved messages
};

// What the hook gives the page: the numbers so far, and what to call as the chat goes
type ChatStatsTally = {
    stats       : ChatStats;                                // The numbers so far
    noteStart   : () => void;                               // The chat started (a resume after a pause changes nothing)
    noteMessage : (role: ChatRole, content: string) => void;  // The backend saved a message
    noteEnd     : () => void;                               // The chat is over
};


// ================================================================================
// Chat Stats
// ================================================================================
// Tally the chat as it goes: its start, each saved message, and its end
export function useChatStats(): ChatStatsTally {
    const [startedAt, setStartedAt] = useState<number | null>(null);
    const [endedAt,   setEndedAt  ] = useState<number | null>(null);
    const [messages,  setMessages ] = useState(0);
    const [words,     setWords    ] = useState(0);

    // The first Start (resuming after a pause keeps it)
    const noteStart = useCallback((): void => setStartedAt((first: number | null) => first ?? Date.now()), []);

    // One saved message (only the participant's count toward their words)
    const noteMessage = useCallback((role: ChatRole, content: string): void => {
        setMessages((count: number) => count + 1);
        if (role === "user") setWords((count: number) => count + countWords(content));
    }, []);

    // The chat is over
    const noteEnd = useCallback((): void => setEndedAt(Date.now()), []);

    // The length, once the chat is over
    const durationSec = ((startedAt !== null) && (endedAt !== null)) ? ((endedAt - startedAt) / 1_000) : null;
    return {stats: {durationSec, messages, words}, noteStart, noteMessage, noteEnd};
}

// Words in one message: runs of anything but spaces
function countWords(text: string): number {
    return text.split(/\s+/).filter((word: string) => word.length > 0).length;
}
