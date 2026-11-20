/* What sits beside the avatar on the chat page: the task, and its end view.
--------------------------------------------------------------------------------
`@frontend/src/pages/chat/components/TaskPanel`

During a task chat, the participant's planning card or Map Task map, from the
backend's `task_card` frames (a placeholder until the first one comes). Once
the chat ends, the backend's `task_reveal` fills in what the participant
couldn't see: the Map Task panel shows both maps as one, the avatar's card goes
under the planning card, and a speech elicitation chat, which has no panel
while it runs, lists the threads it followed. A chat that ended without a
reveal keeps its task as it was. The page renders this only when something
goes beside the avatar.

*/
import type { ReactElement } from "react";
import type { IconType     } from "react-icons";

// From this project
import type { TaskCard   } from "@/hooks/live-chat/taskCardFrame";
import type { TaskReveal } from "@/hooks/live-chat/taskRevealFrame";
import type { ChatMode   } from "../chatModes";

// Components
import        ElicitationThreadsPanel from "./ElicitationThreadsPanel";
import        MapTaskMapPanel         from "./MapTaskMapPanel";
import        PlanningCardPanel       from "./PlanningCardPanel";
import        PlanningRevealPanel     from "./PlanningRevealPanel";


// ================================================================================
// Task Panel
// ================================================================================
// The panel for the chat's task (or a speech elicitation chat's threads, once it ends)
export default function TaskPanel({mode, card, reveal}: {
    mode   : ChatMode;            // The chat type running: what goes beside the avatar, and its icon
    card   : TaskCard | null;     // The participant's latest task card (null until the first)
    reveal : TaskReveal | null;   // What the backend revealed as the chat ended (null until then, or when none came)
}): ReactElement {
    // A speech elicitation chat's threads
    if (reveal?.kind === "speech_elicitation") return <ElicitationThreadsPanel reveal={reveal} />;

    // The planning card, with the avatar's under it once revealed
    if (mode.panel === "card") {
        if (card?.kind !== "cooperative_planning") return <TaskWaiting what="card" icon={mode.icon} />;
        return (
            <div className="flex flex-col gap-6">
                <PlanningCardPanel card={card} />
                {(reveal?.kind === "cooperative_planning") ? <PlanningRevealPanel reveal={reveal} /> : null}
            </div>
        );
    }

    // The Map Task map, with the avatar's drawn in once revealed
    if (card?.kind !== "map_task") return <TaskWaiting what="map" icon={mode.icon} />;
    return <MapTaskMapPanel map={card} reveal={(reveal?.kind === "map_task") ? reveal : null} />;
}


// Where the participant's task materials go until the backend sends them (they come once the chat starts)
function TaskWaiting({what, icon: Icon}: {what: string; icon: IconType}): ReactElement {
    return (
        <div className="flex h-full min-h-64 flex-col items-center justify-center gap-4! rounded-3xl border-2 border-dashed border-chat-border bg-chat-panel/50 p-8 text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-chat-accentSoft text-3xl text-chat-accent">
                <Icon aria-hidden="true" />
            </span>
            <div className="max-w-xs text-lg text-balance text-chat-subtext">Your {what} appears here when the chat starts.</div>
        </div>
    );
}
