/* REST call for who the user's profile is shared with.
--------------------------------------------------------------------------------
`@frontend/src/api/endpoints/access`

Read-only: staff change caregiver links on the admin accounts page.

*/
// From this project
import      { request } from "../client";
import type { Access  } from "../models";

// Links from caregivers to the user's profile
export const getProfileAccess = (): Promise<Access[]> => request<Access[]>("/accesses/", {method: "GET"});
