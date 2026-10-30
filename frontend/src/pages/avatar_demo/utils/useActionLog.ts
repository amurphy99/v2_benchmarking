/* The avatar demo's log of what it sent: actions, resets, and example plans.
--------------------------------------------------------------------------------
`@frontend/src/pages/avatar_demo/utils/useActionLog`

Entries are newest first, and only the latest few are kept (`ActionLog` shows
them). An example plan's entry starts out "running" and later shows how the run
ended (`usePlanExamples`).

*/
import { useRef, useState } from "react";

// From this project
import type { RobotAction   } from "@/pages/common/avatar/avatarRegistry";
import type { LoggedAction  } from "../components/ActionLog";
import type { ExampleRunEnd } from "./usePlanExamples";

// Most entries the log keeps
const DEMO_LOG_LENGTH = 10;

// What the page drives
type DemoLog = {
    log        : LoggedAction[];                                       // Sent so far, newest first
    logAction  : (action: RobotAction, strength?: number) => void;     // An action button, or the Reset button (`kind: "reset"`)
    logExample : (name: string) => number;                             // An example plan starting (returns its run's number)
    endExample : (runId: number, how: ExampleRunEnd) => void;          // How that run ended
    clearLog   : () => void;                                           // Start over (a new avatar)
};


// --------------------------------------------------------------------------------
// Action Log
// --------------------------------------------------------------------------------
// Keep the log, numbering each entry
export function useActionLog(): DemoLog {
    const [log, setLog] = useState<LoggedAction[]>([]);
    const nextIdRef     = useRef<number>(0);

    // Add one entry at the top (the oldest falls off the bottom), returning its number
    const add = (entry: Omit<LoggedAction, "id" | "sentAt">): number => {
        const id = nextIdRef.current;
        nextIdRef.current += 1;
        setLog((previous: LoggedAction[]) => [{...entry, id, sentAt: Date.now()}, ...previous].slice(0, DEMO_LOG_LENGTH));
        return id;
    };

    // Each kind of entry, and an example's ending (its entry may have fallen off by then)
    const logAction  = (action: RobotAction, strength: number = 1): void => { add({...action, strength}); };
    const logExample = (name: string): number => add({kind: "plan", value: name, strength: 1, planStatus: "running"});
    const endExample = (runId: number, how: ExampleRunEnd): void => {
        setLog((previous: LoggedAction[]) => previous.map((entry: LoggedAction) => (entry.id === runId) ? {...entry, planStatus: how} : entry));
    };

    return {log, logAction, logExample, endExample, clearLog: () => setLog([])};
}
