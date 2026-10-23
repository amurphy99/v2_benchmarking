/* REST calls for the admin participant settings page.
--------------------------------------------------------------------------------
`@frontend/src/api/endpoints/adminProfiles`

Staff only: the backend refuses these for anyone without `is_staff`.

*/
// From this project
import      { request                                 } from "../client";
import type { AdminProfile, UpdateAdminProfilePayload } from "../models";

// Every participant, most recent chat first
export const listAdminProfiles = (): Promise<AdminProfile[]> => request<AdminProfile[]>("/admin/profiles/");

// Change one participant's recording default, avatar, or both
export const updateAdminProfile = (id: number, body: UpdateAdminProfilePayload): Promise<AdminProfile> =>
    request<AdminProfile>(`/admin/profiles/${id}/`, {method: "PATCH", body: JSON.stringify(body)});
