import { randInt } from "three/src/math/MathUtils.js";

export const buddyEmotionMap: Record<string, string> = {
    Happy: "DANCE",
    Sad: "SHAKE NO",
    Surprised: "EMBARRASSED",
    Scared: "SHAKE NO",
    Angry: "EMBARRASSED",
    Neutral: "HEAD TILT",
};

export const buddyZoomMap: Record<string, any> = {
    head: {scale: 345, position: [0, -23.5, 0]},
    body: {scale: 100, position: [0, -4, 0]},
}

export const qtEmotionMap: Record<string, string[]> = {
    Happy: ["Celebration", "Dancing", "Rolling Forward  Backward", "Happy"],
    Sad: ["Sad", "Shaking No"],
    Surprised: ["Confused", "Surprised"],
    Scared: ["Excited", "Tired  Sleeping"],
    Angry: ["Angry"],
    Neutral: ["Hello", "Curious Head Tilt", "Error Confusion", "Nodding Yes", "Thinking", "Listening Mode"]
}

export const qtZoomMap: Record<string, any> = {
    head: {scale: 12, position: [0, -17, 0]},
    body: {scale: 4, position: [0, -3, 0]},
}

export const getAnimationFromEmotion = (emotion: string, model: string) => {
    if (model == "qt") {
        return qtEmotionMap[emotion] ? qtEmotionMap[emotion][randInt(0, qtEmotionMap[emotion].length)] : "Hello";
    } else if (model == "buddy") {
        return buddyEmotionMap[emotion] ? buddyEmotionMap[emotion] : "HEAD TILT";
    }
}

export const getZoom = (zoom: string, model: string) => {
    if (model == "qt") {
        return qtZoomMap[zoom] || qtZoomMap['body'];
    } else {
        return buddyZoomMap[zoom] || buddyZoomMap['body'];
    }
}