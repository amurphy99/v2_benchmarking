import { Access } from "@/api";
import { getAccountAccess, getProfileAccess } from "@/api/endpoints/access";
import { useModelQuery } from "@/hooks/queries/common";

export const useAccountAccess = () =>
    useModelQuery<Access>({
        queryKey: "accountAccess",
        queryFn : getAccountAccess,
        empty   : null,
    });

export const useProfileAccess = () =>
    useModelQuery<Access[]>({
        queryKey: "profileAccess",
        queryFn : () => getProfileAccess(),
        empty   : [],
    });
