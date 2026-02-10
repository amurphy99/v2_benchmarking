
import {   MessageInput } from "../live-chat";
import { BiomarkerInput } from "./useLocalBiomarkers";

// --------------------------------------------------------------------------------
// Generate Sample Data
// --------------------------------------------------------------------------------
export function makeSampleMessage(isUserRole: boolean): MessageInput {
    return {
        ts      : new Date().toISOString(),
        role    : isUserRole ? "user" : "assistant",
        content : "This is a sample message.",
        
    };
}

export function makeSampleBiomarkerEvent(): BiomarkerInput {
    const rnd = () => Number(Math.random().toFixed(3));
    return {
        ts     : new Date().toISOString(),
        scores : {
            prosody       : rnd(),
            pronunciation : rnd(),
            turntaking    : rnd(),
            grammar       : rnd(),
            anomia        : rnd(),
            pragmatic     : rnd(),
        },
    };
}
