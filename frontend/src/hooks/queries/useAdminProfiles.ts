/* Query and save hooks for the admin participant settings page.
--------------------------------------------------------------------------------
`@frontend/src/hooks/queries/useAdminProfiles`

The list is never served from cache, so the page always shows what is saved.
A save refetches the list before it finishes, so the card already shows the
new values when it returns to display mode.

*/
import type { UseMutationResult           } from "@tanstack/react-query";
import      { useMutation, useQueryClient } from "@tanstack/react-query";
import        toast                         from "react-hot-toast";

// From this project
import type { AdminProfile, UpdateAdminProfilePayload } from "@/api";
import      { listAdminProfiles, updateAdminProfile   } from "@/api";
import      { useModelQuery                           } from "./common";

// One save: which participant, and the settings to change
type AdminProfileUpdate = {id: number; body: UpdateAdminProfilePayload};


// --------------------------------------------------------------------------------
// Participant Settings Hooks
// --------------------------------------------------------------------------------
// Every participant with their chat activity and current settings
export function useAdminProfiles(): ReturnType<typeof useModelQuery<AdminProfile[]>> {
    return useModelQuery<AdminProfile[]>({
        queryKey  : "adminProfiles",
        queryFn   : listAdminProfiles,
        empty     : [],
        staleTime : 0,
    });
}

// Save one participant's settings, toast the outcome, and refetch the list
export function useUpdateAdminProfile(): UseMutationResult<AdminProfile, Error, AdminProfileUpdate> {
    const qc = useQueryClient();
    return useMutation({
        mutationFn : ({id, body}: AdminProfileUpdate): Promise<AdminProfile> => updateAdminProfile(id, body),
        onSuccess  : (          ): void => { toast.success("Participant settings saved"             ); },
        onError    : (err: Error): void => { toast.error  (`Could not save settings: ${err.message}`); },
        onSettled  : (          ): Promise<void> => qc.invalidateQueries({queryKey: ["adminProfiles"]}),
    });
}
