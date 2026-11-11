/* Load the task materials and final state for a completed session.
--------------------------------------------------------------------------------
`@frontend/src/hooks/queries/useSessionTaskHistory`

*/
import type { SessionTaskHistory    } from "@/api";
import      { getSessionTaskHistory } from "@/api/endpoints/taskHistory";
import      { useModelQuery         } from "./common";

// Keep private task data separate from the participant-facing session response
export function useSessionTaskHistory(id: string): ReturnType<typeof useModelQuery<SessionTaskHistory | null>> {
    return useModelQuery<SessionTaskHistory | null>({
        queryKey : `sessionTaskHistory:${id}`,
        queryFn  : () => getSessionTaskHistory(id),
        empty    : null,
    });
}
