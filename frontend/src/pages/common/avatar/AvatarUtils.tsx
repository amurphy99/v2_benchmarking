import { randInt } from "three/src/math/MathUtils.js";

export const buddyAnimations: Record<string, string> = {
    DANCE: "DANCE",
    "SHAKE NO": "SHAKE NO",
    EMBARRASSED: "EMBARRASSED",
    "HEAD TILT": "HEAD TILT",
};

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

export const qtAnimations: Record<string, string> = {
    Angry: "Angry",
    Celebration: "Celebration",
    Confused: "Confused",
    "Curious Head Tilt": "Curious Head Tilt",
    Dancing: "Dancing",
    "Error Confusion": "Error Confusion",
    Excited: "Excited",
    Happy: "Happy",
    Hello: "Hello",
    "Listening Mode": "Listening Mode",
    "Nodding Yes": "Nodding Yes",
    "Rolling Forward  Backward": "Rolling Forward  Backward",
    Sad: "Sad",
    "Shaking No": "Shaking No",
    Surprised: "Surprised",
    Thinking: "Thinking",
    "Tired  Sleeping": "Tired  Sleeping",
};

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