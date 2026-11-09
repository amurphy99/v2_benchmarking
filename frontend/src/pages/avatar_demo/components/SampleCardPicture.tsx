/* A picture of the demo's planning card, the way the avatar reads it.
--------------------------------------------------------------------------------
`@frontend/src/pages/avatar_demo/components/SampleCardPicture`

The avatar holds its card facing itself, so on screen we see only its back.
This draws the front, as the avatar reads it, so the card examples' looks can
be followed: its constraints at the top, then a line for each item, with a dot
where each choice is written. The spots come from `utils/sampleCard`.

*/
import type { ReactElement } from "react";

// From this project
import type { DemoCardLine                                                     } from "../utils/sampleCard";
import      { DEMO_CARD_CONSTRAINTS, DEMO_CARD_CONSTRAINTS_AT, DEMO_CARD_LINES } from "../utils/sampleCard";

// Where the red header line runs under the constraints, down the card
const DEMO_CARD_HEADER_LINE_Y = 0.42;

// How far in from each side the item lines run
const DEMO_CARD_LINE_INSET = 0.04;


// --------------------------------------------------------------------------------
// Sample Card Picture
// --------------------------------------------------------------------------------
// Draw the card's constraints and item lines, with a caption on how it is mirrored
export default function SampleCardPicture(): ReactElement {
    return (
        <figure>
            {/* A white index card in the map's proportions (both props are the same size) */}
            <div className="relative aspect-[210/148] w-full overflow-hidden rounded-md border border-admin-borderStrong bg-white text-admin-text">
                {/* The avatar's constraints, centered where its "read the constraints" look lands */}
                <ul
                    className = "absolute w-[90%] -translate-x-1/2 -translate-y-1/2 space-y-0.5 text-[10px] leading-tight"
                    style     = {{left: `${DEMO_CARD_CONSTRAINTS_AT[0] * 100}%`, top: `${DEMO_CARD_CONSTRAINTS_AT[1] * 100}%`}}
                >
                    {DEMO_CARD_CONSTRAINTS.map((constraint: string) => <li key={constraint}>• {constraint}</li>)}
                </ul>
                <div className="absolute inset-x-0 h-px bg-red-400" style={{top: `${DEMO_CARD_HEADER_LINE_Y * 100}%`}} />

                {/* Each item's line, labeled at its left, with a dot where its choice is written */}
                {Object.values(DEMO_CARD_LINES).map((line: DemoCardLine) => (
                    <div key={line.label}>
                        <div
                            className = "absolute h-px bg-sky-300"
                            style     = {{left: `${DEMO_CARD_LINE_INSET * 100}%`, right: `${DEMO_CARD_LINE_INSET * 100}%`, top: `${line.at[1] * 100}%`}}
                        />
                        <span className="absolute -translate-y-full pb-0.5 text-[10px] font-semibold" style={{left: `${DEMO_CARD_LINE_INSET * 100}%`, top: `${line.at[1] * 100}%`}}>
                            {line.label}
                        </span>
                        <span
                            className = "absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-admin-accent"
                            style     = {{left: `${line.at[0] * 100}%`, top: `${line.at[1] * 100}%`}}
                            title     = {`Where the ${line.label.toLowerCase()} is written`}
                        />
                    </div>
                ))}
            </div>

            {/* How it is mirrored */}
            <figcaption className="mt-1 text-xs text-admin-subtext">
                The avatar's card, as it reads it (a dot marks where each choice is written). We see the back, so its left is your right.
            </figcaption>
        </figure>
    );
}
