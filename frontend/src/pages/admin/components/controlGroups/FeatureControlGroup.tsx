/* The chat type's shared features on the live chat page: one switch each.
--------------------------------------------------------------------------------
`@frontend/src/pages/admin/components/controlGroups/FeatureControlGroup`

Each switch sends `set_feature`, which holds for the rest of the chat: the signs
of listening, and the reply gate's two checks
(`backend/chat_app/websocket/harnesses/features/`). A switch shows the state the
backend last confirmed, and every switch waits while one change is out. Hovering
a name says what the feature does. A chat switched partway through no longer
matches its condition, so each reply's saved timing records which features were
on for it.

*/
import type { ReactElement } from "react";

// From this project
import      { buttonSectionHeader, groupDivStyle } from "@/hooks/chat-listener/chat-controls/styles";
import      { FEATURE_LABELS, featureLabel       } from "@/pages/common/debug/debugLabels";
import      { AdminSwitch                        } from "../ui/AdminSwitch";


// ================================================================================
// Feature Control Group
// ================================================================================
// One switch per shared feature the chat type uses
export default function FeatureControlGroup({connected, features, pending, onSetFeature}: {
    connected    : boolean;                                  // Connection with the backend
    features     : Record<string, boolean>;                  // The chat type's features, as the backend last confirmed them
    pending      : boolean;                                  // A feature change is waiting on its acknowledgement
    onSetFeature : (feature: string, on: boolean) => void;   // Switch one
}): ReactElement {
    return (
        <div className={groupDivStyle}>
            <div className={buttonSectionHeader}>Shared Features</div>

            {/* One row per feature: its name (hover for what it does) and its switch */}
            <div className="mt-2 flex flex-col gap-2">
                {Object.entries(features).map(([name, on]: [string, boolean]) => (
                    <div key={name} className="flex items-center justify-between gap-3">
                        <span className="text-sm text-admin-text" title={(name in FEATURE_LABELS) ? FEATURE_LABELS[name].help : undefined}>{featureLabel(name)}</span>
                        <AdminSwitch checked={on} disabled={!connected || pending} label={featureLabel(name)} onChange={(next: boolean) => onSetFeature(name, next)} />
                    </div>
                ))}
            </div>

            {/* What a switch changes */}
            <p className="mt-2 text-[11px] text-admin-subtext leading-snug">A change holds for the rest of this chat. Each reply's timing records which features were on.</p>
        </div>
    );
}
