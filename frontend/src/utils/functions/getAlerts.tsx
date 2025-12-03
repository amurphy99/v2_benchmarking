import { ChatSession } from "@/api";

export interface WordAlert {
    date: Date,
    words: string[],
}

export function getMoodAlert(sessions: ChatSession[]): Date[] {
    var days: Date[] = [];
    for (let session of sessions) {
        if (session.sentiment == "Negative") {
            days.push(new Date(session.date));
        }
    }
    return days;
}

export function getWordAlert(sessions: ChatSession[]): WordAlert[] {
    var alerts: WordAlert[] = [];
    const flagged = ["confused", "lost", "useless", "burden", "scared", "depressed", "lonely", "helpless", "hopeless", "cry"]
    for (let session of sessions) {
        for (let message of session.messages) {
            if (message.role == "user") {
                if (flagged.some(word => message.content.toLowerCase().includes(word))) {
                    const existingAlert = alerts.find(alert => alert.date.toDateString() === new Date(session.date).toDateString());
                    if (existingAlert) {
                        // Add new words to existing alert
                        for (let word of flagged) {
                            if (message.content.toLowerCase().includes(word) && !existingAlert.words.includes(word)) {
                                existingAlert.words.push(titleCase(word));
                            }
                        }
                    } else {
                        // Create new alert
                        const wordsFound = flagged.filter(word => message.content.toLowerCase().includes(word));
                        for (let i = 0; i < wordsFound.length; i++) {
                            wordsFound[i] = titleCase(wordsFound[i]);
                        }
                        alerts.push({ date: new Date(session.date), words: wordsFound });
                    }
                }
            }
        }
    }
    return alerts;
}

function titleCase(s: string): string {
    return s.toLowerCase()
            .split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
}
