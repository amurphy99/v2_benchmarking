/* Query and save hooks for staff account creation and caregiver links.
--------------------------------------------------------------------------------
`@frontend/src/hooks/queries/useAdminAccounts`

The caregiver list is never served from cache, so the page always shows the
links that are saved. Creating an account or changing links refetches both the
caregiver and participant lists, since a new participant or a changed link
shows up in either.

*/
import type { QueryClient, UseMutationResult } from "@tanstack/react-query";
import      { useMutation, useQueryClient    } from "@tanstack/react-query";
import        toast                            from "react-hot-toast";

// From this project
import type { Account, AdminCaregiver, CreateAccountPayload, UpdateCaregiverLinksPayload } from "@/api";
import      { createAccount, listAdminCaregivers, updateCaregiverLinks                   } from "@/api";
import      { useModelQuery                                                              } from "./common";

// One link change: which caregiver, and their whole new set of participants
type CaregiverLinksUpdate = {id: number; body: UpdateCaregiverLinksPayload};


// --------------------------------------------------------------------------------
// Admin Account Hooks
// --------------------------------------------------------------------------------
// Every non-staff caregiver with their linked participants (staff only)
export function useAdminCaregivers(enabled: boolean): ReturnType<typeof useModelQuery<AdminCaregiver[]>> {
    return useModelQuery<AdminCaregiver[]>({
        queryKey  : "adminCaregivers",
        queryFn   : listAdminCaregivers,
        empty     : [],
        staleTime : 0,
        enabled,
    });
}

// Replace one caregiver's links, toast the outcome, and refetch both lists
export function useUpdateCaregiverLinks(): UseMutationResult<AdminCaregiver, Error, CaregiverLinksUpdate> {
    const qc = useQueryClient();
    return useMutation({
        mutationFn : ({id, body}: CaregiverLinksUpdate): Promise<AdminCaregiver> => updateCaregiverLinks(id, body),
        onSuccess  : (          ): void => { toast.success("Caregiver links saved"                 ); },
        onError    : (err: Error): void => { toast.error  (`Could not save links: ${err.message}`); },
        onSettled  : (          ): Promise<void> => refetchAccountLists(qc),
    });
}

// Create one login, toast the outcome, and refetch both lists
export function useCreateAccount(): UseMutationResult<Account, Error, CreateAccountPayload> {
    const qc = useQueryClient();
    return useMutation({
        mutationFn : createAccount,
        onSuccess  : (account: Account): void => { toast.success(`Created @${account.user.username}`         ); },
        onError    : (err: Error      ): void => { toast.error  (`Could not create account: ${err.message}`); },
        onSettled  : (                ): Promise<void> => refetchAccountLists(qc),
    });
}

// Refetch the caregiver and participant lists together
function refetchAccountLists(qc: QueryClient): Promise<void> {
    return Promise.all([
        qc.invalidateQueries({queryKey: ["adminCaregivers"]}),
        qc.invalidateQueries({queryKey: ["adminProfiles"  ]}),
    ]).then((): void => undefined);
}
