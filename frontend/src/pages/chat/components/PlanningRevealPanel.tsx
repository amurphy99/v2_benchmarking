/* The avatar's card, shown under the participant's once a planning chat ends.
--------------------------------------------------------------------------------
`@frontend/src/pages/chat/components/PlanningRevealPanel`

From the backend's `task_reveal`: the avatar's brief and its private
constraints, quoted as the avatar was told them (worded to it, as the
participant's card is worded to them). Each constraint says whether the avatar
brought it up during the chat.

*/
import type { ReactElement                } from "react";
import      { BsChatQuoteFill, BsEyeSlash } from "react-icons/bs";

// From this project
import type { PlanningReveal, PlanningRevealConstraint } from "@/hooks/live-chat/taskRevealFrame";


// ================================================================================
// Planning Reveal Panel
// ================================================================================
// What the avatar was told, and which of its constraints it mentioned
export default function PlanningRevealPanel({reveal}: {
    reveal : PlanningReveal;  // The avatar's side, from the backend's reveal
}): ReactElement {
    return (
        <div className="rounded-2xl border border-chat-border! bg-chat-panel p-6 shadow-sm">
            {/* Heading, and the avatar's brief */}
            <div className="text-xs font-semibold uppercase tracking-widest text-chat-subtext">The avatar's card</div>
            <h2 className="mt-1 text-2xl font-semibold text-chat-text">What the avatar knew</h2>
            <p className="mt-3! mb-0 text-lg leading-snug text-chat-text">It was told: &ldquo;{reveal.brief}&rdquo;</p>

            {/* Its own constraints, each with whether it brought it up */}
            <div className="mt-5! text-sm font-semibold text-chat-subtext">Only the avatar knew these:</div>
            <div className="mt-2 space-y-3">
                {reveal.constraints.map((constraint: PlanningRevealConstraint) => (
                    <div key={constraint.text}>
                        <div className="text-lg leading-snug text-chat-text">&ldquo;{constraint.text}&rdquo;</div>
                        {constraint.mentioned ? (
                            <div className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-chat-accent">
                                <BsChatQuoteFill aria-hidden="true" /> It told you this
                            </div>
                        ) : (
                            <div className="mt-1 flex items-center gap-1.5 text-sm text-chat-subtext">
                                <BsEyeSlash aria-hidden="true" /> It never mentioned this
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}
