/* Draw the Map Task map the smiley holds.
--------------------------------------------------------------------------------
`@frontend/src/pages/common/avatar/smiley/render_2d/SmileyMap2D`

The map is drawn to look the like back of a folded paper map, gripped by two
fists.

The avatar reads the map's front, so we see its back: cream paper with faint
folds and a small faded compass rose, so it reads as a map. Two fists grip its
sides. They are the `fist` hand shape drawn by `SmileyHand2D`, so they are
outlined and lit like the other hands and cast a shadow on the paper.

The map is held in front of the body, not the head. It rides along with the
whole avatar (`offsetX`, `offsetY`), but not with the head's tilt, turn, or
breathing, and it is lit from the top of the screen. `mapRaise` moves it
between lowered (top edge at the chin, the mouth showing) and raised (top edge
just under the eyes, which stay above it even at their lowest look at the map).
`map` slides it up into view from below the frame as it is picked up.

*/
import type { ReactElement } from "react";
import      { useId        } from "react";

// From this project
import type { HandObject    } from "../objects/faceObjects";
import type { FaceState     } from "../state/faceState";
import        SmileyHand2D    from "./SmileyHand2D";
import type { SmileyPaint   } from "./faceDrawing2D";
import      { SMILEY_FACE_R } from "./faceDrawing2D";

// Size (landscape, in A-paper proportions) and corner rounding
const SMILEY_MAP_W        = 210;
const SMILEY_MAP_H        = 148;
const SMILEY_MAP_CORNER_R = 3;

// Height of its top edge lowered (at the chin) and raised (just under the eyes at their lowest look at the map),
// and how much farther down it sits while put away (below the frame)
const SMILEY_MAP_LOWERED_TOP = 82;
const SMILEY_MAP_RAISED_TOP  = 14;
const SMILEY_MAP_AWAY_DROP   = 64;

// Folds: panels across and down, every other column a little darker (like an accordion fold)
const SMILEY_MAP_FOLD_COLUMNS = 4;
const SMILEY_MAP_FOLD_ROWS    = 2;
const SMILEY_MAP_FOLD_SHADE   = 0.035;

// Fists: how far in from each side and down from the top edge they grip, and their size (times a hand's)
const SMILEY_MAP_FIST_INSET = 9;
const SMILEY_MAP_FIST_DROP  = 26;
const SMILEY_MAP_FIST_SCALE = 1;

// Compass rose on the back: its center (in from the right side, down from the top edge), its size, and how thin its points are
const SMILEY_MAP_COMPASS_IN    = 33;
const SMILEY_MAP_COMPASS_DOWN  = 34;
const SMILEY_MAP_COMPASS_R     = 10;
const SMILEY_MAP_COMPASS_WAIST = 0.3;    // Inner corners' distance from the center, as a share of the points'
const SMILEY_MAP_COMPASS_RING  = 0.62;   // Ring through the points, as a share of their length

// Colors
const SMILEY_MAP_PAPER_HEXES   = ["#fbf5e6", "#eadcbc"] as const;   // Top to bottom (lit from the top of the screen)
const SMILEY_MAP_EDGE_HEX      = "#b8a27a";
const SMILEY_MAP_FOLD_HEX      = "#c9b48c";
const SMILEY_MAP_SHADE_HEX     = "#000000";
const SMILEY_MAP_INK_HEX       = "#9c8558";
const SMILEY_MAP_INK_OPACITY   = 0.45;
const SMILEY_MAP_SHINE_HEX     = "#ffffff";
const SMILEY_MAP_SHINE_OPACITY = 0.7;

// Line widths
const SMILEY_MAP_EDGE_W  = 1.5;
const SMILEY_MAP_FOLD_W  = 1;
const SMILEY_MAP_SHINE_W = 1.2;
const SMILEY_MAP_RING_W  = 1;

// Four-pointed compass star around its center, pointing up, right, down, and left
const SMILEY_MAP_COMPASS_PATH = compassStarPath(SMILEY_MAP_COMPASS_R, SMILEY_MAP_COMPASS_WAIST);


// ================================================================================
// Smiley Map (2D)
// ================================================================================
// The held map and its fists, in the face's outer coordinates (outside the head's tilt and turn)
export default function SmileyMap2D({face, paint}: {
    face  : FaceState;     // Combined face for this frame (`map`, `mapRaise`, and the whole-avatar offsets)
    paint : SmileyPaint;   // Fills and hand shading colors from `SmileyFace2D`
}): ReactElement {
    // Paint ids, unique per map on the page (React's ids may hold characters `url(#...)` rejects)
    const baseId  = useId().replace(/[^a-zA-Z0-9_-]/g, "");
    const paperId = `smiley-map-paper-${baseId}`;
    const clipId  = `smiley-map-clip-${baseId}`;

    // Its top edge between lowered and raised, dropped below the frame until it is fully held
    const top   = SMILEY_MAP_LOWERED_TOP + ((SMILEY_MAP_RAISED_TOP - SMILEY_MAP_LOWERED_TOP) * face.mapRaise) + ((1 - face.map) * SMILEY_MAP_AWAY_DROP);
    const halfW = SMILEY_MAP_W / 2;

    // Panels and folds: each column's left side, then one path through every fold line
    const panelW  = SMILEY_MAP_W / SMILEY_MAP_FOLD_COLUMNS;
    const columns = Array.from({length: SMILEY_MAP_FOLD_COLUMNS}, (_: unknown, i: number) => -halfW + (i * panelW));
    const across  = columns.slice(1).map((x: number) => `M ${x} 0 V ${SMILEY_MAP_H}`);
    const down    = Array.from({length: SMILEY_MAP_FOLD_ROWS - 1}, (_: unknown, i: number) => `M ${-halfW} ${((i + 1) * SMILEY_MAP_H) / SMILEY_MAP_FOLD_ROWS} H ${halfW}`);

    // One fist gripping each side (`side` is -1 for the left one; the right one is its mirror image)
    const fist = (side: number): HandObject => ({
        kind     : "hand",
        key      : (side < 0) ? "fist-left" : "fist-right",
        shape    : "fist",
        mirrored : side > 0,
        amount   : 1,
        x        : side * (halfW - SMILEY_MAP_FIST_INSET),
        y        : SMILEY_MAP_FIST_DROP,
        angle    : 0,
        scale    : SMILEY_MAP_FIST_SCALE,
    });

    return (
        <g transform={`translate(${face.offsetX * SMILEY_FACE_R} ${(face.offsetY * SMILEY_FACE_R) + top})`}>
            <defs>
                <linearGradient id={paperId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"   stopColor={SMILEY_MAP_PAPER_HEXES[0]} />
                    <stop offset="100%" stopColor={SMILEY_MAP_PAPER_HEXES[1]} />
                </linearGradient>
                <clipPath id={clipId}>
                    <rect x={-halfW} y={0} width={SMILEY_MAP_W} height={SMILEY_MAP_H} rx={SMILEY_MAP_CORNER_R} />
                </clipPath>
            </defs>

            {/* Paper, every other panel a little darker, its folds, and a shine along the top edge */}
            <rect x={-halfW} y={0} width={SMILEY_MAP_W} height={SMILEY_MAP_H} rx={SMILEY_MAP_CORNER_R} fill={`url(#${paperId})`} />
            <g clipPath={`url(#${clipId})`} fill={SMILEY_MAP_SHADE_HEX} opacity={SMILEY_MAP_FOLD_SHADE}>
                {columns.filter((_: number, i: number) => i % 2 === 1).map((x: number) => <rect key={x} x={x} y={0} width={panelW} height={SMILEY_MAP_H} />)}
            </g>
            <path d={[...across, ...down].join(" ")} fill="none" stroke={SMILEY_MAP_FOLD_HEX} strokeWidth={SMILEY_MAP_FOLD_W} />
            <line x1={-halfW + SMILEY_MAP_CORNER_R} y1={SMILEY_MAP_SHINE_W} x2={halfW - SMILEY_MAP_CORNER_R} y2={SMILEY_MAP_SHINE_W} stroke={SMILEY_MAP_SHINE_HEX} strokeWidth={SMILEY_MAP_SHINE_W} opacity={SMILEY_MAP_SHINE_OPACITY} />
            <rect x={-halfW} y={0} width={SMILEY_MAP_W} height={SMILEY_MAP_H} rx={SMILEY_MAP_CORNER_R} fill="none" stroke={SMILEY_MAP_EDGE_HEX} strokeWidth={SMILEY_MAP_EDGE_W} />

            {/* Compass rose printed on the back, faded */}
            <g transform={`translate(${halfW - SMILEY_MAP_COMPASS_IN} ${SMILEY_MAP_COMPASS_DOWN})`} opacity={SMILEY_MAP_INK_OPACITY}>
                <circle r={SMILEY_MAP_COMPASS_R * SMILEY_MAP_COMPASS_RING} fill="none" stroke={SMILEY_MAP_INK_HEX} strokeWidth={SMILEY_MAP_RING_W} />
                <path d={SMILEY_MAP_COMPASS_PATH} fill={SMILEY_MAP_INK_HEX} />
            </g>

            {/* Fists gripping the sides */}
            <SmileyHand2D hand={fist(-1)} paint={paint} />
            <SmileyHand2D hand={fist( 1)} paint={paint} />
        </g>
    );
}


// Four-pointed star of point length `r`, its inner corners `waist` of the way out on the diagonals
function compassStarPath(r: number, waist: number): string {
    const w = r * waist * Math.SQRT1_2;
    return `M 0 ${-r} L ${w} ${-w} L ${r} 0 L ${w} ${w} L 0 ${r} L ${-w} ${w} L ${-r} 0 L ${-w} ${-w} Z`;
}
