/* Query hook for who the user's profile is shared with.
--------------------------------------------------------------------------------
`@frontend/src/hooks/queries/useAccess`

*/
// From this project
import type { Access           } from "@/api";
import      { getProfileAccess } from "@/api/endpoints/access";
import      { useModelQuery    } from "@/hooks/queries/common";

// Caregivers linked to the current user's profile
export const useProfileAccess = (): ReturnType<typeof useModelQuery<Access[]>> =>
    useModelQuery<Access[]>({
        queryKey: "profileAccess",
        queryFn : () => getProfileAccess(),
        empty   : [],
    });
