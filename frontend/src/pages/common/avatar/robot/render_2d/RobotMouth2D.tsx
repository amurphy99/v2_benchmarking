/* Draw the robot's mouth in light on its screen: a line or an outlined opening.
--------------------------------------------------------------------------------
`@frontend/src/pages/common/avatar/robot/render_2d/RobotMouth2D`

The mouth's shapes come from the smiley's shape math (`mouthShape`) at the
robot's layout, so every mouth field means the same on both avatars. They are
drawn the way a screen shows them. A closed mouth is one line of even width
with round ends. As the mouth opens, an outline of the same light fades in over
that line, see-through inside, with the tongue when the face shows one.
`mouthEyeFill` fills the opening with the light instead.

Teeth are flat, pale light with no shading, and the lines between them are the
outline's light, so a full set reads as a lit grille. The cold face's lip
icicles are left out: at this size they read as fangs.

*/
import type { ReactElement } from "react";
import      { useId        } from "react";

// From this project
import type { SmileyPaint       } from "@/pages/common/avatar/smiley/render_2d/faceDrawing2D";
import      { mouthShape        } from "@/pages/common/avatar/smiley/render_2d/faceDrawing2D";
import type { FaceState         } from "@/pages/common/avatar/smiley/state/faceState";
import      { ROBOT_FACE_LAYOUT } from "./robotDrawing2D";

// Openness below which the opening is not drawn (the closed-mouth line covers it)
const ROBOT_MOUTH_MIN_OPEN = 0.02;

// Lines between the teeth and between the two rows (thinner than the outline, so a small grille stays open)
const ROBOT_TEETH_LINE_W = 2.2;


// --------------------------------------------------------------------------------
// Robot Mouth (2D)
// --------------------------------------------------------------------------------
// The mouth, in the feature group's coordinates
export default function RobotMouth2D({face, paint, teeth}: {
    face  : FaceState;     // Combined face for this frame
    paint : SmileyPaint;   // Fills from `RobotFace2D` (`feature` is the screen's light, `mouth` the see-through inside)
    teeth : string;        // Teeth color (a pale shade of the light)
}): ReactElement {
    // Clip id, unique per avatar on the page (React's ids may hold characters `url(#...)` rejects)
    const clipId = `robot-mouth-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
    const layout = ROBOT_FACE_LAYOUT;
    const mouth  = mouthShape(face, layout);

    return (
        <g transform={`translate(${face.mouthSide * layout.unit} ${layout.mouthY + (face.mouthShift * layout.unit)})`}>
            {/* Closed-mouth line, under any small opening until the opening covers it */}
            {(mouth.lineFade > 0) ? (
                <path d={mouth.lineCenter} fill="none" stroke={paint.feature} strokeWidth={layout.mouthLineW} strokeLinecap="round" strokeLinejoin="round" opacity={mouth.lineFade} />
            ) : null}

            {/* Opening, with the tongue and teeth clipped inside it, then its outline on top (all fading in together) */}
            {(face.mouthOpen > ROBOT_MOUTH_MIN_OPEN) ? (
                <g opacity={mouth.openFade}>
                    <clipPath id={clipId}>
                        <path d={mouth.opening} />
                    </clipPath>
                    <path d={mouth.opening} fill={paint.mouth} />
                    {(face.mouthEyeFill > 0) ? <path d={mouth.opening} fill={paint.feature} opacity={face.mouthEyeFill} /> : null}
                    <g clipPath={`url(#${clipId})`}>
                        {(face.tongue      > 0) ? <ellipse {...mouth.tongue} fill={paint.tongue} opacity={face.tongue} /> : null}
                        {(face.teethTop    > 0) ? <path d={mouth.topTeeth}    fill={teeth} /> : null}
                        {(face.teethBottom > 0) ? <path d={mouth.bottomTeeth} fill={teeth} /> : null}
                        {(face.teethGaps   > 0) ? <path d={mouth.toothGaps}   fill="none" stroke={paint.feature} strokeWidth={ROBOT_TEETH_LINE_W} opacity={face.teethGaps} /> : null}
                        {((face.teethTop > 0) && (face.teethBottom > 0)) ? (
                            <path d={mouth.rowLine} fill="none" stroke={paint.feature} strokeWidth={ROBOT_TEETH_LINE_W} strokeLinecap="round" opacity={Math.min(face.teethTop, face.teethBottom)} />
                        ) : null}
                    </g>
                    <path d={mouth.opening} fill="none" stroke={paint.feature} strokeWidth={layout.mouthOutlineW} strokeLinejoin="round" />
                </g>
            ) : null}
        </g>
    );
}
