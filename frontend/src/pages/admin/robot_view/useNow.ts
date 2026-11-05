/* Current time that refreshes on an interval, for "seconds ago" labels.
--------------------------------------------------------------------------------
`@frontend/src/pages/admin/robot_view/useNow`

*/
import { useEffect, useState } from "react";


// Re-render every `tickMs` with the current time (ms since the epoch)
export function useNow(tickMs: number): number {
    const [now, setNow] = useState<number>(Date.now());
    useEffect(() => {
        const id = window.setInterval((): void => setNow(Date.now()), tickMs);
        return (): void => window.clearInterval(id);
    }, [tickMs]);
    return now;
}
