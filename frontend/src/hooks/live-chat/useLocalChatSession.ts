import { useState } from "react";

// --------------------------------------------------------------------------------
// Models for frontend display use only
// --------------------------------------------------------------------------------
type Role = "user" | "assistant";

export interface LocalChatSession {
    id       : string;                // random UUID until backend assigns
    messages : LocalChatMessage[];
    started  : string; 
};
export interface LocalChatMessage {
    id      : string;
    ts      : string; // ISO string (?)
    role    : Role;
    content : string;
};

// What the backend sends in the "data" field
export type MessageInput = {
    ts      : string; // ISO string (?)
    role    : Role;
    content : string;
};

// ================================================================================
// Handle local storage of chat session data
// ================================================================================
// TODO: I mean we MIGHT want the `toIsoTs()` method from `adminChatTransforms`...?
export function useLocalChatSession () {
    // Initialize a ChatSession
    const makeEmpty = (): LocalChatSession => ({id: crypto.randomUUID(), messages: [], started: new Date().toISOString()});

    // State variable
    const [session, setSession] = useState<LocalChatSession>(makeEmpty());

    // Update the state (old, more "manual" method for doing it)
    const pushMessage = (role: "user" | "assistant", content: string, ts: string = new Date().toISOString()) =>
        setSession((s) => ({...s, messages: [...s.messages, { id: crypto.randomUUID(), ts, role, content }]
    }));

    // --------------------------------------------------------------------------------
    // Handling the ChatListener WebSocket data
    // --------------------------------------------------------------------------------
    const pushMessageObj = ({ ts, role, content }: MessageInput) => {
        setSession((s) => ({
            ...s, messages: [...s.messages, { id: crypto.randomUUID(), ts, role, content }],
        }));
    };

    // Replace all messages at once (for loading history)
    const setMessages = (messages: MessageInput[]) => {
        setSession((s) => ({
            ...s, messages: messages.map(({ ts, role, content }) => ({ id: crypto.randomUUID(), ts, role, content })),
        }));
    };

    // Clear session
    const reset = () => setSession(makeEmpty());

    return { session, pushMessage, pushMessageObj, setMessages, reset };
}
