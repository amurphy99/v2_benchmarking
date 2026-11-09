/* The participant's planning card: their constraints, and a line for each item.
--------------------------------------------------------------------------------
`@frontend/src/pages/chat/components/PlanningCardPanel`

Shown beside the avatar in the cooperative planning task, from the backend's
`task_card` frames. The participant's constraints are at the top (only they know
them). Below, each item's line is written in, in handwriting, the moment both
sides agree on a choice; a choice one side asked to settle on shows faintly with
a question mark until the other side says yes.

*/
import type { ReactElement      } from "react";
import      { BsCheckCircleFill } from "react-icons/bs";

// From this project
import type { PlanningCard, PlanningCardItem } from "@/hooks/live-chat/taskCardFrame";


// ================================================================================
// Planning Card Panel
// ================================================================================
// The card as the participant reads it
export default function PlanningCardPanel({card}: {
    card : PlanningCard;  // The latest card from the backend
}): ReactElement {
    return (
        <div className="rounded-2xl border border-chat-border bg-chat-panel shadow-sm p-6">
            {/* Heading */}
            <div className="text-xs font-semibold uppercase tracking-widest text-chat-subtext">Your card</div>
            <h2 className="mt-1 text-2xl font-semibold text-chat-text">{card.title}</h2>

            {/* The participant's own constraints */}
            <div className="mt-5 text-sm font-semibold text-chat-subtext">Only you know these:</div>
            <ul className="mt-2 space-y-2">
                {card.constraints.map((constraint: string) => (
                    <li key={constraint} className="flex gap-3 text-lg leading-snug text-chat-text">
                        <span aria-hidden="true" className="mt-2.5 h-2 w-2 shrink-0 rounded-full bg-chat-accent" />
                        {constraint}
                    </li>
                ))}
            </ul>

            {/* A line per item: the agreed choice written in, a choice waiting for a yes, or blank */}
            <div className="mt-6 space-y-4 border-t border-dashed border-chat-border pt-5">
                {card.items.map((item: PlanningCardItem) => (
                    <div key={item.id}>
                        <div className="text-sm font-semibold uppercase tracking-wide text-chat-subtext">{item.label}</div>
                        <div className="mt-1 flex min-h-[2.75rem] items-end border-b-2 border-chat-border pb-1">
                            {(item.value !== null)   ? <span key={item.value} className="animate-chat-write font-hand text-2xl text-chat-ink">{item.value}</span> :
                             (item.pending !== null) ? <span className="font-hand text-xl italic text-chat-pending opacity-70">{item.pending}?</span>              :
                                                       <span className="sr-only">Not decided yet</span>}
                        </div>
                    </div>
                ))}
            </div>

            {/* The approved plan */}
            {card.complete ? (
                <div className="mt-6 flex items-center gap-2 rounded-xl bg-chat-accentSoft px-4 py-3 text-lg font-semibold text-chat-accent">
                    <BsCheckCircleFill aria-hidden="true" /> Plan complete
                </div>
            ) : null}
        </div>
    );
}

