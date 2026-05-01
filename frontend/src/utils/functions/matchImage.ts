import { ChatSession } from "@/api";

export const defaultImage = {
    id: -1,
    topic: "N/A",
    url: "https://images.pexels.com/photos/356079/pexels-photo-356079.jpeg",
    photographer: "Pixabay",
    photographer_url: "https://www.pexels.com/@pixabay/"
};

export function matchImage(sessions: ChatSession[], topic: string) {
    for (var i = 0; i < sessions.length; i++) {
        var session: ChatSession = sessions[i];
        // If no topics, skip this session
        if (!session.topics) continue;
        // Handle case where topics is either an array or a string
        var sessionTopics: string[] = Array.isArray(session.topics)
            ? session.topics
            : (session.topics as unknown as string).replace(/[\[\]"']/g, "").split(",");
        if (sessionTopics[0].trim() === topic) {
            if (session.image) {
                return session.image;
            }
        }
    }
    return defaultImage;
}