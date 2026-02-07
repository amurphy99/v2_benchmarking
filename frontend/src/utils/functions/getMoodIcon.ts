export default function getMoodIcon(sentiment: string) {
 const emoteMap: Record<string, string> = {
        Happy: "fluent-emoji:beaming-face-with-smiling-eyes",
        Sad: "fluent-emoji:sad-but-relieved-face",
        Surprised: "fluent-emoji:astonished-face",
        Scared: "fluent-emoji:anguished-face",
        Angry: "fluent-emoji:angry-face",
        Neutral: "fluent-emoji:face-with-diagonal-mouth",
        Negative: "fluent-emoji:confused-face",
        Positive: "fluent-emoji:beaming-face-with-smiling-eyes",
        NA: "fluent-color:question-circle-48"
    };
    const icon = emoteMap[sentiment] || emoteMap["NA"];
    return icon;
}