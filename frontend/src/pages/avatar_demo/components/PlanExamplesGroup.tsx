/* Demo controls for the example plans that drive the avatar's face and gaze.
--------------------------------------------------------------------------------
`@frontend/src/pages/avatar_demo/components/PlanExamplesGroup`

Shown for avatars that run plans. Each button sends one example's frames the
way a backend will (`utils/planExamples`). The Map Task's examples are in
`MapTaskGroup`.

*/
import type { ReactElement } from "react";

// From this project
import      { buttonSectionHeader, groupDivStyle } from "@/hooks/chat-listener/chat-controls/styles";
import type { PlanExample                        } from "../utils/planExamples";
import      { DEMO_PLAN_EXAMPLES                 } from "../utils/planExamples";
import        ExampleButtons                       from "./ExampleButtons";


// --------------------------------------------------------------------------------
// Plan Examples Group
// --------------------------------------------------------------------------------
// The general example plans, one button each
export default function PlanExamplesGroup({onRun}: {
    onRun : (example: PlanExample) => void;   // Run one
}): ReactElement {
    return (
        <div className={groupDivStyle}>
            <div className={buttonSectionHeader}>Example Plans</div>
            <ExampleButtons examples={DEMO_PLAN_EXAMPLES} onRun={onRun} />
        </div>
    );
}
