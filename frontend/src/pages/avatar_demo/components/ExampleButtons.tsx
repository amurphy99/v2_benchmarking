/* Buttons that run example plans, and what the last one clicked shows.
--------------------------------------------------------------------------------
`@frontend/src/pages/avatar_demo/components/ExampleButtons`

Used by the Example Plans and Map Task groups. Each button's tooltip says what
its example shows, and so does a line under the buttons once one is clicked
(the behaviors are small, so it helps to know what to watch for).

*/
import type { ReactElement } from "react";
import      { useState     } from "react";

// From this project
import      { btnClass    } from "@/hooks/chat-listener/chat-controls/styles";
import type { PlanExample } from "../utils/planExamples";


// --------------------------------------------------------------------------------
// Example Buttons
// --------------------------------------------------------------------------------
// One button per example, and the description of the last one clicked
export default function ExampleButtons({examples, onRun}: {
    examples : PlanExample[];                    // Examples to offer, in order
    onRun    : (example: PlanExample) => void;   // Run one
}): ReactElement {
    // The example clicked last (null until one is)
    const [shown, setShown] = useState<PlanExample | null>(null);

    // Run one, and describe it
    const run = (example: PlanExample): void => {
        setShown(example);
        onRun(example);
    };

    return (
        <div>
            <div className="mt-1 grid grid-cols-2 gap-2">
                {examples.map((example: PlanExample) => (
                    <button key={example.name} className={btnClass(false, "secondary")} title={example.blurb} onClick={() => run(example)}>
                        {example.name}
                    </button>
                ))}
            </div>

            {/* What the last one shows */}
            {(shown !== null) ? (
                <p className="mt-2 text-xs text-admin-subtext"><b>{shown.name}:</b> {shown.blurb}</p>
            ) : null}
        </div>
    );
}
