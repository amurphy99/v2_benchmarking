import { useState } from "react";

// From this project
import { toIsoTs  } from "../chat-listener/data_utils/transforms";
import { ChatRole } from "@/api";

// --------------------------------------------------------------------------------
// Models for frontend display use only
// --------------------------------------------------------------------------------
export interface LocalChatSession {
    id       : string;                // random UUID until backend assigns
    messages : LocalChatMessage[];
    started  : string; 
};
export interface LocalChatMessage {
    id         : string;
    role       : ChatRole;
    content    : string;
    ts         : string; // ISO string (?)
    start_ts ? : string | null;
    end_ts   ? : string | null;
};

// TODO: Figure out what the backend is actually sending for this....
// What the backend sends in the "data" field
export type MessageInput = {
    role       : ChatRole;
    content    : string;
    ts         : unknown; // ISO string (?)
    start_ts ? : unknown; // optional ISO-ish
    end_ts   ? : unknown; // optional ISO-ish
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
    const pushMessageObj = ({ role, content, ts, start_ts, end_ts }: MessageInput) => {
        setSession((s) => ({
            ...s, messages: [...s.messages, { 
                id       : crypto.randomUUID(), 
                role, 
                content, 
                ts       : toIsoTs(ts), 
                start_ts : (start_ts !== undefined ? toIsoTs(start_ts) : undefined),
                end_ts   : (  end_ts !== undefined ? toIsoTs(  end_ts) : undefined),
            }],
        }));
    };

    // Replace all messages at once (for loading history)
    const setMessages = (messages: MessageInput[]) => {
        setSession((s) => ({
            ...s, messages: messages.map(({ role, content, ts, start_ts, end_ts }) => ({ 
                id       : crypto.randomUUID(), 
                role, 
                content, 
                ts       : toIsoTs(ts),  
                start_ts : (start_ts !== undefined ? toIsoTs(start_ts) : undefined),
                end_ts   : (  end_ts !== undefined ? toIsoTs(  end_ts) : undefined),
            })),
        }));
    };

    // Clear session
    const reset = () => setSession(makeEmpty());

    return { session, pushMessage, pushMessageObj, setMessages, reset };
}
