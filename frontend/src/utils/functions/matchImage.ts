import { ChatSession } from "@/api";

export const defaultImage = {
    id: -1,
    topic: "N/A",
    url: "https://images.pexels.com/photos/356079/pexels-photo-356079.jpeg",
    photographer: "Pixabay",
    photographer_url: "https://www.pexels.com/@pixabay/"
};

/**
 * Will return the image associated with the topic if it exists, otherwise returns a default image.
 * @param sessions The sessions to search through for the topic and associated image
 * @param topic The topic to find the associated image for
 * @returns  The image associated with the topic if it exists, or the default image otherwise
 */
export function matchImage(sessions: ChatSession[], topic: string) {
    for (var i = 0; i < sessions.length; i++) {
        var session = sessions[i];
        var sessionTopics = session.topics;
        if (!sessionTopics) continue;
        if (sessionTopics[0].trim() == topic) {
            if (session.image) {
                return session.image;
            }
        }
    }
    return defaultImage;
}