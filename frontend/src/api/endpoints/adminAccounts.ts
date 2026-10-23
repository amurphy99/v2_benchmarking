/* REST calls for staff account creation and caregiver links.
--------------------------------------------------------------------------------
`@frontend/src/api/endpoints/adminAccounts`

Staff only: the backend refuses these for anyone without `is_staff`. There is
no public signup, so this is the only way a new login is created.

*/
// From this project
import      { request } from "../client";
import type { Account, AdminCaregiver, CreateAccountPayload, UpdateCaregiverPayload } from "../models";


// Create a participant or caregiver login
export const createAccount = (body: CreateAccountPayload): Promise<Account> =>
    request<Account>("/admin/accounts/", {method: "POST", body: JSON.stringify(body)});

// Every non-staff caregiver with their linked participants
export const listAdminCaregivers = (): Promise<AdminCaregiver[]> => request<AdminCaregiver[]>("/admin/caregivers/");

// Replace one caregiver's whole set of linked participants (and their password, when one is sent)
export const updateCaregiver = (id: number, body: UpdateCaregiverPayload): Promise<AdminCaregiver> =>
    request<AdminCaregiver>(`/admin/caregivers/${id}/`, {method: "PUT", body: JSON.stringify(body)});
