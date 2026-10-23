export default function getMoodIcon(sentiment: string) {

 const emoteMap: Record<string, string> = {
        happy: "fluent-emoji:beaming-face-with-smiling-eyes",
        sad: "fluent-emoji:sad-but-relieved-face",
        surprised: "fluent-emoji:astonished-face",
        scared: "fluent-emoji:anguished-face",
        angry: "fluent-emoji:angry-face",
        neutral: "fluent-emoji:face-with-diagonal-mouth",
        negative: "fluent-emoji:confused-face",
        positive: "fluent-emoji:beaming-face-with-smiling-eyes",
        NA: "fluent-color:question-circle-48"
    };
    const icon = emoteMap[sentiment.toLowerCase()] || emoteMap["NA"];
    return icon;
}