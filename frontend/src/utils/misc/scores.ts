import { ChatSession, BiomarkerType } from "@/api";

export const biomarkerKeys = ["AlteredGrammar", "Anomia", "Pragmatic", "Pronunciation", "Prosody", "Turntaking",] as const;


// Get a list of all ChatSessions
export function getSessionsBefore(sessions: ChatSession[], cutoff: Date): ChatSession[] {
    return sessions.filter((s) => new Date(s.date) < cutoff);
}


// Get "average_scores" from each session and average each
export function averageScore(sessions: ChatSession[]): Record<BiomarkerType, number> {
    const work: Record<string, { sum: number; count: number }> = Object.create(null);

    // Get each score
    for (const s of sessions) {
        if (!s.average_scores) continue;
        for (const key in s.average_scores) {
            const val = s.average_scores[key as BiomarkerType];
            if (!work[key]) work[key] = { sum: 0, count: 0 };
            work[key].sum   += val;
            work[key].count += 1;
        }
    }

    // Now get the averages
    const result: Record<BiomarkerType, number> = {} as any;
    for (const key in work) {
        const { sum, count } = work[key as BiomarkerType];
        if (count) result[key as BiomarkerType] = sum / count;
    }

    return result;
}
