import { ChatWeek } from "./getChatWeeks";

export function getCognitiveScore(week: ChatWeek): number {
    var totalScore = 0;
    var count = 0;
    for (var session of week.sessions) {
        for (var value of Object.values(session.average_scores)) {
            totalScore += value;
            count++;
        }
    }
    return Math.round((totalScore / count) * 100);
}