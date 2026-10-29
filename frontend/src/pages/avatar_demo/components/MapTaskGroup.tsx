/* Demo controls for the Map Task map: holding it, and raising and lowering it.
--------------------------------------------------------------------------------
`@frontend/src/pages/avatar_demo/components/MapTaskGroup`

Shown for avatars that list the `mapTask` feature. The page remounts it when the
avatar changes, since a newly picked avatar starts without a map.

*/
import type { ReactElement, RefObject } from "react";
import      { useState                } from "react";

// From this project
import      { btnClass, buttonSectionHeader, groupDivStyle } from "@/hooks/chat-listener/chat-controls/styles";
import type { AvatarHandle, MapTaskConfig                  } from "@/pages/common/avatar/avatarRegistry";

// Settings the map is held with (raise it while thinking, glance at it while listening, eyes on the map)
const DEMO_MAP_CONFIG: MapTaskConfig = {raiseWhen: "thinking", listenGlances: true, eyesOnMap: true};

// Each section's small label
const DEMO_SECTION_LABEL = "text-xs opacity-60";


// --------------------------------------------------------------------------------
// Map Task Group
// --------------------------------------------------------------------------------
// Hand the avatar the map or take it away, and raise or lower it by hand
export default function MapTaskGroup({avatarRef}: {
    avatarRef : RefObject<AvatarHandle | null>;   // Avatar the controls drive
}): ReactElement {
    // Whether the avatar was last handed the map
    const [holding, setHolding] = useState<boolean>(false);

    // Hand it the map, or take it away
    const changeHolding = (on: boolean): void => {
        setHolding(on);
        avatarRef.current?.setMapTask?.(on ? DEMO_MAP_CONFIG : null);
    };

    return (
        <div className={groupDivStyle}>
            <div className={buttonSectionHeader}>Map Task</div>

            <div className="mt-2 grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
                {/* Holding the map */}
                <div>
                    <div className={DEMO_SECTION_LABEL}>Map</div>
                    <div className="mt-1 grid grid-cols-2 gap-2">
                        <button className={btnClass(false, holding ? "primary"   : "secondary")} onClick={() => changeHolding(true )}>Hold the map</button>
                        <button className={btnClass(false, holding ? "secondary" : "primary"  )} onClick={() => changeHolding(false)}>Put it away</button>
                    </div>
                </div>

                {/* Raising and lowering it by hand */}
                <div>
                    <div className={DEMO_SECTION_LABEL}>Raise or lower it</div>
                    <div className="mt-1 grid grid-cols-2 gap-2">
                        <button className={btnClass(!holding, "secondary")} disabled={!holding} onClick={() => avatarRef.current?.mapCue?.({cue: "raise"})}>Raise</button>
                        <button className={btnClass(!holding, "secondary")} disabled={!holding} onClick={() => avatarRef.current?.mapCue?.({cue: "lower"})}>Lower</button>
                    </div>
                </div>
            </div>
        </div>
    );
}
