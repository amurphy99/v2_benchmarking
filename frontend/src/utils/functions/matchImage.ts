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
        var sessionTopics = session.topics.replace(/[\[\]"']/g, "").split(",");
        if (sessionTopics[0].trim() === topic) {
            if (session.image) {
                return session.image;
            }
        }
    }
    return defaultImage;
}