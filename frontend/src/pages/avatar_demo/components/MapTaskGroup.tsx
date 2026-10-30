/* Demo controls for the Map Task: the map by hand, and its example plans.
--------------------------------------------------------------------------------
`@frontend/src/pages/avatar_demo/components/MapTaskGroup`

Shown for avatars whose plan catalog has the map. Every button sends plans the
way a Map Task chat will (`utils/planExamples`): holding the map also sends the
Map Task setup, and each example picks the map up itself. Putting the map away
also clears the setup, so the page drives the conversation state and the
automatic behaviors again. The picture is the avatar's map, so its looks can be
followed.

*/
import type { ReactElement } from "react";

// From this project
import      { btnClass, buttonSectionHeader, groupDivStyle } from "@/hooks/chat-listener/chat-controls/styles";
import type { PlanExample                                  } from "../utils/planExamples";
import      { DEMO_MAP_CONTROLS, DEMO_MAP_EXAMPLES         } from "../utils/planExamples";
import        ExampleButtons                                 from "./ExampleButtons";
import        SampleMapPicture                               from "./SampleMapPicture";

// Each section's small label
const DEMO_SECTION_LABEL = "text-xs opacity-60";


// --------------------------------------------------------------------------------
// Map Task Group
// --------------------------------------------------------------------------------
// The avatar's map beside the controls that move it and the examples that use it
export default function MapTaskGroup({onRun, onClearSetup, setupOn}: {
    onRun        : (example: PlanExample) => void;   // Run one example (each hand control is a one-step one)
    onClearSetup : () => void;                       // Forget the Map Task setup
    setupOn      : boolean;                          // The Map Task setup is on
}): ReactElement {
    // Put the map away, and hand the avatar back to the page
    const putAway = (): void => {
        onRun(DEMO_MAP_CONTROLS.putAway);
        onClearSetup();
    };

    return (
        <div className={groupDivStyle}>
            {/* Header, and whether the setup is on (while on, the face controls can't set the state) */}
            <div className="flex items-center justify-between gap-3">
                <div className={`${buttonSectionHeader} shrink-0`}>Map Task</div>
                <div className="text-right text-xs opacity-60">{setupOn ? "Setup on: plans set the conversation state" : "No setup"}</div>
            </div>

            <div className="mt-2 grid grid-cols-1 gap-x-6 gap-y-4 md:grid-cols-[240px_minmax(0,1fr)]">
                {/* The avatar's map */}
                <SampleMapPicture />

                <div className="flex flex-col gap-4">
                    {/* The map by hand */}
                    <div>
                        <div className={DEMO_SECTION_LABEL}>Map</div>
                        <div className="mt-1 grid grid-cols-2 gap-2">
                            <button className={btnClass(false, "secondary")} title={DEMO_MAP_CONTROLS.hold.blurb}    onClick={() => onRun(DEMO_MAP_CONTROLS.hold )}>Hold the map</button>
                            <button className={btnClass(false, "secondary")} title={DEMO_MAP_CONTROLS.putAway.blurb} onClick={putAway                           }>Put it away</button>
                            <button className={btnClass(false, "secondary")} title={DEMO_MAP_CONTROLS.raise.blurb}   onClick={() => onRun(DEMO_MAP_CONTROLS.raise)}>Raise</button>
                            <button className={btnClass(false, "secondary")} title={DEMO_MAP_CONTROLS.lower.blurb}   onClick={() => onRun(DEMO_MAP_CONTROLS.lower)}>Lower</button>
                        </div>
                    </div>

                    {/* Example plans that use it */}
                    <div>
                        <div className={DEMO_SECTION_LABEL}>Example plans</div>
                        <ExampleButtons examples={DEMO_MAP_EXAMPLES} onRun={onRun} />
                    </div>
                </div>
            </div>
        </div>
    );
}
