/* Draw the smiley's animated extras: the tear, the sleep Zs, and the floating hearts.
--------------------------------------------------------------------------------
`@frontend/src/pages/common/avatar/smiley/render_2d/SmileyExtras2D`

Each extra shows only while its amount in the face state is above zero, and
animates from `face.timeSec` (see `faceDrawing2D`). Their gradient fills come
from `SmileyFace2D`.

*/
import type { ReactElement } from "react";

// From this project
import type { FaceState                            } from "../state/faceState";
import type { SmileyPaint, Sprite                  } from "./faceDrawing2D";
import      { SMILEY_HEART_PATH, SMILEY_TEAR_PATH  } from "./faceDrawing2D";
import      { heartSprites, tearSprite, zzzSprites } from "./faceDrawing2D";

// Small highlight inside the tear and each heart (sizes are in the shape's own unit size)
const SMILEY_EXTRA_SHINE_HEX     = "#ffffff";
const SMILEY_EXTRA_SHINE_OPACITY = 0.6;


// --------------------------------------------------------------------------------
// Smiley Extras (2D)
// --------------------------------------------------------------------------------
// Tear, Zs, and hearts, in the feature group's coordinates
export default function SmileyExtras2D({face, paint}: {
    face  : FaceState;     // Combined face for this frame
    paint : SmileyPaint;   // Gradient fills from `SmileyFace2D`
}): ReactElement {
    // Where the tear is in its drip
    const tear = tearSprite(face);

    return (
        <g>
            {/* Tear running down the right cheek */}
            {(face.tear > 0) ? (
                <g transform={`translate(${tear.x} ${tear.y}) scale(${tear.size})`} opacity={tear.opacity}>
                    <path d={SMILEY_TEAR_PATH} fill={paint.tear} />
                    <ellipse cx={-0.35} cy={-0.15} rx={0.2} ry={0.38} fill={SMILEY_EXTRA_SHINE_HEX} opacity={SMILEY_EXTRA_SHINE_OPACITY} />
                </g>
            ) : null}

            {/* Sleep Zs rising beside the head */}
            {(face.zzz > 0) ? zzzSprites(face).map((z: Sprite, i: number) => (
                <text key={i} x={z.x} y={z.y} fontSize={z.size} fontWeight={800} fontFamily="ui-rounded, system-ui, sans-serif" fill={paint.zzz} opacity={z.opacity}>z</text>
            )) : null}

            {/* Hearts floating around the head */}
            {(face.hearts > 0) ? heartSprites(face).map((heart: Sprite, i: number) => (
                <g key={i} transform={`translate(${heart.x} ${heart.y}) scale(${heart.size})`} opacity={heart.opacity}>
                    <path d={SMILEY_HEART_PATH} fill={paint.heart} />
                    <ellipse cx={-0.45} cy={-0.45} rx={0.18} ry={0.12} transform="rotate(-35 -0.45 -0.45)" fill={SMILEY_EXTRA_SHINE_HEX} opacity={SMILEY_EXTRA_SHINE_OPACITY} />
                </g>
            )) : null}
        </g>
    );
}
