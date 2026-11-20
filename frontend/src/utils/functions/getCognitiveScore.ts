import { ChatSessionSummary } from "@/api";

export function getCognitiveScore(sessions: ChatSessionSummary[]): number {
    var totalScore = 0;
    var count = 0;
    for (var session of sessions) {
        for (var value of Object.values(session.average_scores)) {
            totalScore += value;
            count++;
        }
    }
    return Math.round((totalScore / count) * 100);
}