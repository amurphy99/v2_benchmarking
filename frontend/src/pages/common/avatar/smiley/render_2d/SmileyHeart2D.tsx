/* Draw one of the smiley's floating hearts: a glossy heart that bobs and pulses on its own timing.
--------------------------------------------------------------------------------
`@frontend/src/pages/common/avatar/smiley/render_2d/SmileyHeart2D`

A heart is a placed object (`objects/faceObjects`) with its own size, bob,
pulse, and timing. It bobs and pulses from the face's running clock
(`heartPose` in `objectDrawing2D`), grows in as it fades in, and has a small
white shine at its upper left, like the tear's.

*/
import type { ReactElement } from "react";

// From this project
import type { HeartObject                                                                  } from "../objects/faceObjects";
import type { SmileyPaint                                                                  } from "./faceDrawing2D";
import      { heartPose, SMILEY_EXTRA_SHINE_HEX, SMILEY_EXTRA_SHINE_OPACITY, SMILEY_HEART_PATH } from "./objectDrawing2D";


// --------------------------------------------------------------------------------
// Smiley Heart (2D)
// --------------------------------------------------------------------------------
// One floating heart, in the feature group's coordinates
export default function SmileyHeart2D({heart, timeSec, paint}: {
    heart   : HeartObject;   // Its place, settings, and how much of it shows
    timeSec : number;        // The face's running clock (the bob and pulse follow it)
    paint   : SmileyPaint;   // Gradient fills from `SmileyFace2D`
}): ReactElement {
    // Where it is in its bob and pulse this frame
    const pose = heartPose(heart, timeSec);
    return (
        <g transform={`translate(${pose.x} ${pose.y}) rotate(${heart.angle}) scale(${pose.size})`} opacity={pose.opacity}>
            <path d={SMILEY_HEART_PATH} fill={paint.heart} />
            <ellipse cx={-0.45} cy={-0.45} rx={0.18} ry={0.12} transform="rotate(-35 -0.45 -0.45)" fill={SMILEY_EXTRA_SHINE_HEX} opacity={SMILEY_EXTRA_SHINE_OPACITY} />
        </g>
    );
}
