import { ChatSession, BiomarkerType } from "@/api";

export const biomarkerKeys = ["AlteredGrammar", "Anomia", "Pragmatic", "Pronunciation", "Prosody", "Turntaking",] as const;


// Get a list of all ChatSessions
export function getSessionsBefore(sessions: ChatSession[], cutoff: Date): ChatSession[] {
    return sessions.filter((s) => new Date(s.date) < cutoff);
}


// Get "average_scores" from each session and average each; gets the average score of each biomarker across the whole week
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

export function sortScores(scores: Record<BiomarkerType, number>): [BiomarkerType, number][] {
    const entries = Object.entries(scores) as [BiomarkerType, number][];
    entries.sort((a, b) => b[1] - a[1]);
    return entries;
}

export function getFlaggedBiomarkers(scores: Record<BiomarkerType, number>, threshold: number = 0.35): BiomarkerType[] {
    const flagged: BiomarkerType[] = [];
    for (const biomarker in scores) {
        if (scores[biomarker as BiomarkerType] <= threshold) {
            flagged.push(biomarker as BiomarkerType);
        }
    }
    return flagged;
}

export function getExemplarBiomarkers(scores: Record<BiomarkerType, number>, threshold: number = 0.75): BiomarkerType[] {
    const exemplar: BiomarkerType[] = [];
    for (const biomarker in scores) {
        if (scores[biomarker as BiomarkerType] >= threshold) {
            exemplar.push(biomarker as BiomarkerType);
        }
    }
    return exemplar;
}


export function getFlaggedDays(sessions: ChatSession[], biomarker: BiomarkerType) : ChatSession[] {
    var flagged: ChatSession[] = []
    sessions.forEach((session) => {
        if (session.average_scores[biomarker] <= 0.35) {
            flagged.push(session);
        }
    })
    return flagged;
}

export function getExemplarDays(sessions: ChatSession[], biomarker: BiomarkerType) : ChatSession[] {
    var exemplar: ChatSession[] = []
    sessions.forEach((session) => {
        if (session.average_scores[biomarker] >= 0.75) {
            exemplar.push(session);
        }
    })
    return exemplar;
}

export function getPerformance(score: number) : string {
    if (score <= 0.30) {
        return "Poor";
    } else if (score <= 0.5) {
        return "Fair";
    } else if (score <= 0.75) {
        return "Good";
    } else {
        return "Excellent";
    }
}
