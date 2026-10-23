/* REST calls for the admin participant settings page.
--------------------------------------------------------------------------------
`@frontend/src/api/endpoints/adminProfiles`

Staff reach every participant. A caregiver reaches only the participants linked
to them, and the backend answers 404 for anyone else's.

*/
// From this project
import      { request                                 } from "../client";
import type { AdminProfile, UpdateAdminProfilePayload } from "../models";

// Participants this user monitors (every one for staff), most recent chat first
export const listAdminProfiles = (): Promise<AdminProfile[]> => request<AdminProfile[]>("/admin/profiles/");

// Change any of one participant's recording default, language, and avatar
export const updateAdminProfile = (id: number, body: UpdateAdminProfilePayload): Promise<AdminProfile> =>
    request<AdminProfile>(`/admin/profiles/${id}/`, {method: "PATCH", body: JSON.stringify(body)});
