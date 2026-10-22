/* Draw the smiley's animated extras: the tear, the sleep Zs, and the floating hearts.
--------------------------------------------------------------------------------
`@frontend/src/pages/common/avatar/smiley/SmileyExtras2D`

Each extra shows only while its amount in the face state is above zero, and
animates from `face.timeSec` (see `faceDrawing2D`).

*/
import type { ReactElement } from "react";

// From this project
import type { Sprite                                                } from "./faceDrawing2D";
import      { SMILEY_HEART_HEX, SMILEY_HEART_PATH, SMILEY_TEAR_PATH } from "./faceDrawing2D";
import      { heartSprites, tearSprite, zzzSprites                  } from "./faceDrawing2D";
import type { FaceState                                             } from "./faceState";

// Extra colors
const SMILEY_TEAR_HEX       = "#5ab4f0";   // Tear fill
const SMILEY_TEAR_SHINE_HEX = "#ffffff";   // Small highlight inside the tear
const SMILEY_ZZZ_HEX        = "#4f6bd8";   // Sleep Zs


// --------------------------------------------------------------------------------
// Smiley Extras (2D)
// --------------------------------------------------------------------------------
// Tear, Zs, and hearts, in the feature group's coordinates
export default function SmileyExtras2D({face}: {
    face : FaceState;   // Combined face for this frame
}): ReactElement {
    // Where the tear is in its drip
    const tear = tearSprite(face);

    return (
        <g>
            {/* Tear running down the right cheek (the highlight is in the tear's own unit size) */}
            {(face.tear > 0) ? (
                <g transform={`translate(${tear.x} ${tear.y}) scale(${tear.size})`} opacity={tear.opacity}>
                    <path d={SMILEY_TEAR_PATH} fill={SMILEY_TEAR_HEX} />
                    <ellipse cx={-0.35} cy={-0.1} rx={0.22} ry={0.38} fill={SMILEY_TEAR_SHINE_HEX} opacity={0.7} />
                </g>
            ) : null}

            {/* Sleep Zs rising beside the head */}
            {(face.zzz > 0) ? zzzSprites(face).map((z: Sprite, i: number) => (
                <text key={i} x={z.x} y={z.y} fontSize={z.size} fontWeight={800} fontFamily="ui-rounded, system-ui, sans-serif" fill={SMILEY_ZZZ_HEX} opacity={z.opacity}>z</text>
            )) : null}

            {/* Hearts floating around the head */}
            {(face.hearts > 0) ? heartSprites(face).map((heart: Sprite, i: number) => (
                <path key={i} d={SMILEY_HEART_PATH} transform={`translate(${heart.x} ${heart.y}) scale(${heart.size})`} fill={SMILEY_HEART_HEX} opacity={heart.opacity} />
            )) : null}
        </g>
    );
}
