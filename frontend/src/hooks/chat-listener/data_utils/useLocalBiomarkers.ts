import { useState } from "react";
import { toIsoTs  } from "./transforms";
import { ChatBiomarkerScore } from "@/api";

// --------------------------------------------------------------------------------
// Models for frontend display use only
// --------------------------------------------------------------------------------
export type BiomarkerScoreSet = {
    anomia         ? : number;
    alteredgrammar ? : number;
    pragmatic      ? : number;
    pronunciation  ? : number;
    prosody        ? : number;
    turntaking     ? : number;
};

// TODO: I'm not going to worry too much about this until we start doing the visualizations
export interface LocalBiomarkerPoint {
    id     : string;            // frontend-only id
    ts     : string;            // ISO string
    scores : BiomarkerScoreSet;
};
export interface LocalBiomarkerSeries {
    id      : string;                 // frontend-only id
    points  : LocalBiomarkerPoint[];
    started : string; 
};

// What the backend sends in the "data" field
export type BiomarkerInput = {
  ts     : string;            // ISO string
  scores : BiomarkerScoreSet;
};

// ================================================================================
// Handle local storage of biomarker stream data
// ================================================================================
export function useLocalBiomarkers() {
    // Initialize a ChatSession
    const makeEmpty = (): LocalBiomarkerSeries => ({id: crypto.randomUUID(), points: [], started: new Date().toISOString()});

    // State variable
    const [series, setSeries] = useState<LocalBiomarkerSeries>(makeEmpty());

    // Update the state (old, more "manual" method for doing it)
    const pushScores = (scores: BiomarkerScoreSet, ts: string = new Date().toISOString()) =>
        setSeries((s) => ({...s, points: [...s.points, { id: crypto.randomUUID(), ts, scores }],
    }));

    // --------------------------------------------------------------------------------
    // Handling the ChatListener WebSocket data
    // --------------------------------------------------------------------------------
    const pushScoreObj = ({ ts, scores }: BiomarkerInput) => {
        setSeries((s) => ({ ...s, points: [...s.points, { id: crypto.randomUUID(), ts: toIsoTs(ts), scores }] }));
    };

    // Replace all messages at once (for loading history)
    const setScores = (history: BiomarkerInput[]) => {
        setSeries((s) => ({
            ...s, points: history.map(({ ts, scores }) => ({ id: crypto.randomUUID(), ts: toIsoTs(ts), scores })),
        }));
    };

    // Clear session
    const reset = () => setSeries(makeEmpty());

    return { series, pushScores, pushScoreObj, setScores, reset };
}

export function ChatBiomarkerToLocalSeries(data: ChatBiomarkerScore[]): LocalBiomarkerSeries {
    const points = data.map(({ id, ts, score_type, score }) => ({
        id: String(id),
        ts: toIsoTs(ts),
        scores: { [score_type.toLowerCase()]: score },
    }));
    return { id: crypto.randomUUID(), points, started: points[0]?.ts ?? new Date().toISOString() };
}