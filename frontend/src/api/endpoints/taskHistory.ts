/* Read a session's private task history for an authorized administrator.
--------------------------------------------------------------------------------
`@frontend/src/api/endpoints/taskHistory`

*/
import      { request            } from "../client";
import type { SessionTaskHistory } from "../models";

// Historical materials and results, or explicitly identified current variant materials
export const getSessionTaskHistory = (id: string): Promise<SessionTaskHistory> => request<SessionTaskHistory>(`/chatsession/${id}/task-history/`);
