/* Side column of the live chat page: avatar actions, the task, and biomarkers, as tabs.
--------------------------------------------------------------------------------
`@frontend/src/pages/admin/components/LiveSidePanel`

The column scrolls on its own, so a long action list (the Smiley avatar's named
faces) never pushes the transcript off the page. A chat type that sends a task
view (the Map Task's maps) gets a tab for it, and the Biomarkers tab shows only
for a chat that runs biomarkers (or already has scores). Every tab stays mounted
while hidden, so the biomarker chart keeps its selected score when you switch
back, and the Biomarkers tab shows how many scores have arrived.

*/
import type { ReactElement } from "react";
import      { useState     } from "react";

// From this project
import type { LocalBiomarkerSeries } from "@/hooks/chat-listener/data_utils/useLocalBiomarkers";
import type { CapabilityProfile    } from "../capabilities/profiles";
import      { BiomarkerPanel       } from "./common/BiomarkerPanel";
import        AvatarActionsGroup     from "./controlGroups/AvatarActionsGroup";

// One tab of the side column
type LiveSideTab = "avatar" | "task" | "biomarkers";

// A chat type's own tab: its label, and what it shows
export type TaskTab = {label: string; panel: ReactElement};


// ================================================================================
// Live Side Panel
// ================================================================================
// Tab switcher over a scrolling area that shows the avatar's actions, the chat type's task, or the biomarker scores
export function LiveSidePanel({connected, capabilities, pendingEmotion, pendingAnimation, onEmotion, onAnimation, taskTab, showBiomarkers, series}: {
    // Avatar actions
    connected        : boolean;                       // Connection with the backend
    capabilities     : CapabilityProfile;             // Actions the monitored frontend can perform
    pendingEmotion   : boolean;                       // An emotion command is waiting on its acknowledgement
    pendingAnimation : boolean;                       // ...and an animation command
    onEmotion        : (emotion: string) => void;     // Send an emotion
    onAnimation      : (animation: string) => void;   // Send an animation

    // The chat type's task (null for a chat type without a view)
    taskTab : TaskTab | null;

    // Biomarkers
    showBiomarkers : boolean;                // The chat runs biomarkers (or already has scores)
    series         : LocalBiomarkerSeries;   // Scores so far in this chat
}): ReactElement {
    // The tabs this chat has (Biomarkers counts the scores so far), and the one showing (the first when the picked one is gone)
    const [picked, setPicked] = useState<LiveSideTab>("avatar");
    const scored              = series.points.length;
    const tabs: {id: LiveSideTab; label: string}[] = [{id: "avatar", label: "Avatar"}];
    if (taskTab !== null) tabs.push({id: "task",       label: taskTab.label                                      });
    if (showBiomarkers)   tabs.push({id: "biomarkers", label: (scored > 0) ? `Biomarkers (${scored})` : "Biomarkers"});
    const tab = tabs.some(({id}) => id === picked) ? picked : "avatar";

    return (
        <aside className="min-h-0 flex flex-col gap-2">
            {/* Tab switcher (the highlight is a span: the Bootstrap reset squares off button corners) */}
            <div role="tablist" aria-label="Side panel" className="shrink-0 flex rounded-full border border-admin-border bg-admin-muted p-0.5">
                {tabs.map(({id, label}) => (
                    <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setPicked(id)} className="flex-1 bg-transparent p-0">
                        <span className={`block rounded-full px-3 py-1 text-sm font-medium transition-colors ${(tab === id) ? "bg-admin-panel text-admin-text shadow-sm" : "text-admin-subtext hover:text-admin-text"}`}>
                            {label}
                        </span>
                    </button>
                ))}
            </div>

            {/* Selected tab, scrolling on its own */}
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
                <div role="tabpanel" hidden={tab !== "avatar"}>
                    <AvatarActionsGroup
                        connected    = {connected}
                        capabilities = {capabilities}
                        pending      = {{robot_emotion: pendingEmotion, robot_animation: pendingAnimation}}
                        onEmotion    = {onEmotion}
                        onAnimation  = {onAnimation}
                    />
                </div>
                {(taskTab !== null) ? <div role="tabpanel" hidden={tab !== "task"}>{taskTab.panel}</div> : null}
                {showBiomarkers ? (
                    <div role="tabpanel" hidden={tab !== "biomarkers"} className="rounded-xl border border-admin-border bg-admin-panel shadow-sm overflow-hidden">
                        <BiomarkerPanel series={series} windowSeconds="all" />
                    </div>
                ) : null}
            </div>
        </aside>
    );
}
