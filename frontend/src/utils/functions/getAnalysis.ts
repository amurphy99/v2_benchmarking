import { BiomarkerType, ChatSession } from "@/api";
import { ChatWeek } from "./getChatWeeks";
import { averageScore } from "../misc/scores";

interface Analysis {
    Flagged: string,
    Exemplar: string,
}

const speechAnalysis: Record<BiomarkerType, Analysis> = {
    "anomia": {
        "Flagged": `You sometimes forgot words or phrases, such as going "uh" "mmm" while trying to think of what you wanted to say.`,
        "Exemplar": `You found just the right word! It’s wonderful to see how easily the words are coming to you.`,
    },
    "prosody": {
        "Flagged": `Your conversation feels a bit plain (monotone) without a variety of stress and rhythm. It might be hard for other people to understand how you feel, and what’s important in a sentence.`,
        "Exemplar": `You sounded so expressive! Your voice rose and fell in just the right way, and it really brought your words to life.`,
    },
    "turntaking": {
        "Flagged": `You seem to have trouble knowing when it’s your turn or when to stop in a conversation. If someone always talks too much, interrupts, or doesn’t respond, it can feel uncomfortable or confusing.`,
        "Exemplar": `You took turns so nicely and waited to listen before sharing your thoughts. That made our conversation feel really smooth and connected.`,
    },
    "pragmatic": {
        "Flagged": `You seem to have difficulty using language in social situations such as understanding jokes, sarcasm or social rules. Your attention also drifts and did not stay on topic as usual.`,
        "Exemplar": `You listened, took your turn, focused on topic and responded so naturally. That shows great communication skills.`,
    },
    "alteredgrammar": {
        "Flagged": `You were using words in the wrong order, leaving out parts of a sentence, or mixing up verb tenses, word endings, or small grammar words like "is," "the," or "a.",`,
        "Exemplar": `You spoke so clearly and your sentences were perfectly put together. Your grammar was spot on! That shows how strong your language skills still are.`,
    },
    "pronunciation": {
        "Flagged": `The way you say words seem to be not clearly and correctly enough. You might have slurred words, or mispronounced things.`,
        "Exemplar": `You said words so clearly and every sound was just right! Your pronunciation today was excellent, and it helped people to understand you well. `,
    }
}

export function getDailyAnalysis(session: ChatSession): string[] {
    var analysis: string[] = [];
    for (const [biomarker, score] of Object.entries(session.average_scores)) {
        if (score < 0.35) {
            analysis.push(speechAnalysis[biomarker].Flagged);
        } else if (score > 0.75) {
            analysis.push(speechAnalysis[biomarker].Exemplar);
        }
    }
    return analysis;
}

export function getWeeklyAnalysis(week: ChatWeek): string[] {
    var analysis: string[] = [];
    const average_scores = averageScore(week.sessions);
    for (const [biomarker, score] of Object.entries(average_scores)) {
        if (score < 0.35) {
            analysis.push(speechAnalysis[biomarker].Flagged);
        } else if (score > 0.75) {
            analysis.push(speechAnalysis[biomarker].Exemplar);
        }
    }
    return analysis;
}