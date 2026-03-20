import { Access } from "@/api";
import { getAccountAccess, getProfileAccess } from "@/api/endpoints/access";
import { useModelQuery } from "@/hooks/queries/common";

// Gets the Profile(s) the current user has access to
export const useAccountAccess = () =>
    useModelQuery<Access>({
        queryKey: "accountAccess",
        queryFn : getAccountAccess,
        empty   : {} as Access,
    });

// Gets the accounts the current user's Profile has access to
// ToDo: Update to take the profile ID as an argument
export const useProfileAccess = () =>
    useModelQuery<Access[]>({
        queryKey: "profileAccess",
        queryFn : () => getProfileAccess(),
        empty   : [],
    });
