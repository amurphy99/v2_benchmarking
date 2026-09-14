import { randInt } from "three/src/math/MathUtils.js";

export const buddyAnimations: Record<string, string> = {
    DANCE: "DANCE",
    "SHAKE NO": "SHAKE NO",
    EMBARRASSED: "EMBARRASSED",
    "HEAD TILT": "HEAD TILT",
};

// Maps the backend's emotion vocabulary onto the clips this model actually has.
// The backend sends every frontend the same 10 LLM moods (see CLIENT_PROTOCOL.md); collapsing
// them onto 4 Buddy clips is this frontend's job. "Angry" is admin-only -- the LLM never sends it.
export const buddyEmotionMap: Record<string, string> = {
    // LLM mood vocabulary
    Neutral: "HEAD TILT",
    Grumpy: "EMBARRASSED",
    Happy: "DANCE",
    Love: "DANCE",
    Sad: "SHAKE NO",
    Scared: "SHAKE NO",
    Sick: "SHAKE NO",
    Surprised: "EMBARRASSED",
    Thinking: "HEAD TILT",
    Tired: "HEAD TILT",

    // Admin-only additions
    Angry: "EMBARRASSED",
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

// Same contract as buddyEmotionMap, but QT has 17 clips so the mapping collapses far less.
// One mood may list several clips; getAnimationFromEmotion picks one at random.
export const qtEmotionMap: Record<string, string[]> = {
    // LLM mood vocabulary
    Neutral: ["Hello", "Curious Head Tilt", "Error Confusion", "Nodding Yes", "Listening Mode"],
    Grumpy: ["Angry"],
    Happy: ["Celebration", "Dancing", "Rolling Forward  Backward", "Happy"],
    Love: ["Celebration", "Happy"],
    Sad: ["Sad", "Shaking No"],
    Scared: ["Excited", "Tired  Sleeping"],
    Sick: ["Tired  Sleeping", "Sad"],
    Surprised: ["Confused", "Surprised"],
    Thinking: ["Thinking", "Confused"],
    Tired: ["Tired  Sleeping"],

    // Admin-only additions
    Angry: ["Angry"],
}

export const qtZoomMap: Record<string, any> = {
    head: {scale: 12, position: [0, -17, 0]},
    body: {scale: 4, position: [0, -3, 0]},
}

// An unrecognized emotion falls back to that model's idle clip rather than failing; frontends
// are expected to handle vocabulary they do not implement (see FRONTEND_CAPABILITIES.md).
export const getAnimationFromEmotion = (emotion: string, model: string) => {
    if (model == "qt") {
        const clips = qtEmotionMap[emotion];
        // randInt is inclusive on both ends, so the top index is length - 1
        return clips ? clips[randInt(0, clips.length - 1)] : "Hello";
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