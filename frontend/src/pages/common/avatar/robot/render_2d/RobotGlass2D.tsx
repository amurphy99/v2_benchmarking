/* Draw the robot's screen without its face: the bezel, glass, and reflections.
--------------------------------------------------------------------------------
`@frontend/src/pages/common/avatar/robot/render_2d/RobotGlass2D`

The screen is set into the front of the head, and slides a share of the head
turn (`screenCenter`). A dark bezel and a lighter lip frame the glass. On the
glass are the soft light the face throws on it, in the robot's light color, and
two faint reflections: a curve across the top and a slanted streak down the
left side. `RobotFace2D` draws the face itself over this.

The glass also shows the looks that cover the shell (`RobotOverlays2D`), its own
way: a blue shade down from its top edge (fearful), and frost creeping in from
its edges with the middle left clear (cold).

*/
import type { ReactElement } from "react";
import      { useId        } from "react";

// From this project
import type { Point                                                            } from "@/pages/common/avatar/smiley/render_2d/faceDrawing2D";
import      { topOverlayGradient, verticalGradient                             } from "@/pages/common/avatar/smiley/render_2d/gradients2D";
import type { FaceState                                                        } from "@/pages/common/avatar/smiley/state/faceState";
import      { headBox, ROBOT_SCREEN_H, ROBOT_SCREEN_W, screenBox, screenCenter } from "./robotDrawing2D";

// Frame around the glass
const ROBOT_BEZEL_W     = 5;   // Dark outer bezel, past the glass
const ROBOT_BEZEL_LIP_W = 3;   // Lighter lip between the bezel and the glass

// Glass, top to bottom
const ROBOT_GLASS_HEXES = ["#0a1019", "#1c293c"] as const;

// On the glass, as shares of its half-width and half-height from its center: the light the face throws on it, and a
// curved reflection across its top (both ellipses), then the corners of a slanted streak down its left side
const ROBOT_AMBIENT         = {y:  0.25, rx: 0.95, ry: 0.9, opacity: 0.2 };
const ROBOT_ARC             = {y: -1.12, rx: 0.86, ry: 0.5, opacity: 0.06};
const ROBOT_STREAK: Point[] = [[-0.5, -1], [0.02, -1], [-0.62, 1], [-1, 1], [-1, 0.3]];
const ROBOT_STREAK_OPACITY  = 0.04;
const ROBOT_REFLECTION_HEX  = "#ffffff";

// Fearful shade down the glass (strong at its top edge and gone by `END`)
const ROBOT_GLASS_FEAR_HEX     = "#5a74ff";
const ROBOT_GLASS_FEAR_END     = "70%";
const ROBOT_GLASS_FEAR_OPACITY = 0.5;    // At a full `fearShade`

// Frost on the glass: clear out to `CLEAR` of the way from its center to its edge, then thickening to the edge
const ROBOT_GLASS_FROST_HEX     = "#eaf6ff";
const ROBOT_GLASS_FROST_CLEAR   = "58%";
const ROBOT_GLASS_FROST_OPACITY = 0.75;  // At the edge, at a full `frost`


// --------------------------------------------------------------------------------
// Robot Glass (2D)
// --------------------------------------------------------------------------------
// The screen's bezel, glass, and reflections, in the head group's coordinates
export default function RobotGlass2D({face, light, bezel, lip}: {
    face  : FaceState;   // Combined face for this frame (the screen slides with its head turn, and shows its fear shade and frost)
    light : string;      // The robot's light color this frame
    bezel : string;      // Outer bezel color
    lip   : string;      // Color of the lip between the bezel and the glass
}): ReactElement {
    // Paint ids, unique per avatar on the page (React's ids may hold characters `url(#...)` rejects)
    const baseId = useId().replace(/[^a-zA-Z0-9_-]/g, "");
    const id     = (name: string): string => `robot-glass-${name}-${baseId}`;
    const url    = (name: string): string => `url(#${id(name)})`;

    // Where the screen is this frame, and the glass's half-size
    const [screenX, screenY] = screenCenter(face);
    const halfW = ROBOT_SCREEN_W / 2;
    const halfH = ROBOT_SCREEN_H / 2;

    return (
        <g clipPath={url("head")}>
            <defs>
                {verticalGradient(id("glass"), ROBOT_GLASS_HEXES)}
                <radialGradient id={id("ambient")}>
                    <stop offset="0%"   stopColor={light} stopOpacity={ROBOT_AMBIENT.opacity} />
                    <stop offset="100%" stopColor={light} stopOpacity={0}                     />
                </radialGradient>
                {topOverlayGradient(id("fear"), ROBOT_GLASS_FEAR_HEX, ROBOT_GLASS_FEAR_END)}
                <radialGradient id={id("frost")}>
                    <stop offset={ROBOT_GLASS_FROST_CLEAR} stopColor={ROBOT_GLASS_FROST_HEX} stopOpacity={0}                         />
                    <stop offset="100%"                    stopColor={ROBOT_GLASS_FROST_HEX} stopOpacity={ROBOT_GLASS_FROST_OPACITY} />
                </radialGradient>

                {/* The head (a screen slid to its edge stays inside it), and the glass */}
                <clipPath id={id("head")}>
                    <rect {...headBox(0)} />
                </clipPath>
                <clipPath id={id("glass")}>
                    <rect {...screenBox(0)} />
                </clipPath>
            </defs>

            <g transform={`translate(${screenX} ${screenY})`}>
                {/* Bezel, lip, and glass */}
                <rect {...screenBox(ROBOT_BEZEL_W)}     fill={bezel}        />
                <rect {...screenBox(ROBOT_BEZEL_LIP_W)} fill={lip}          />
                <rect {...screenBox(0)}                 fill={url("glass")} />

                {/* The face's light on the glass, and the glass's reflections */}
                <g clipPath={url("glass")}>
                    <ellipse cy={halfH * ROBOT_AMBIENT.y} rx={halfW * ROBOT_AMBIENT.rx} ry={halfH * ROBOT_AMBIENT.ry} fill={url("ambient")} />
                    <ellipse cy={halfH * ROBOT_ARC.y}     rx={halfW * ROBOT_ARC.rx}     ry={halfH * ROBOT_ARC.ry}     fill={ROBOT_REFLECTION_HEX} opacity={ROBOT_ARC.opacity} />
                    <polygon points={ROBOT_STREAK.map(([x, y]: Point) => `${x * halfW},${y * halfH}`).join(" ")} fill={ROBOT_REFLECTION_HEX} opacity={ROBOT_STREAK_OPACITY} />
                </g>

                {/* Fearful shade and frost on the glass */}
                {(face.fearShade > 0) ? <rect {...screenBox(0)} fill={url("fear")}  opacity={face.fearShade * ROBOT_GLASS_FEAR_OPACITY} /> : null}
                {(face.frost     > 0) ? <rect {...screenBox(0)} fill={url("frost")} opacity={face.frost}                                /> : null}
            </g>
        </g>
    );
}
