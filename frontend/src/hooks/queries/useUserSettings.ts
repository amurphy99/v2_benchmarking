/* Query and save hooks for the logged-in user's chat settings.
--------------------------------------------------------------------------------
`@frontend/src/hooks/queries/useUserSettings`

The settings are never served from cache. An admin or caregiver can change the
avatar from another device, and the chat page has to show the saved one.

*/
import toast from "react-hot-toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { getUserSettings, updateUserSettings, UserSettings } from "@/api";
import { useModelQuery } from "./common";


// [GET] Hook to wrap useQuery for retrieving UserSettings objects
export const useUserSettings = () =>
    useModelQuery<UserSettings>({
        queryKey  : "settings",
        queryFn   : getUserSettings,
        empty     : {} as UserSettings,
        staleTime : 0,
    });

// [POST] Hook to wrap useQueryClient for updating UserSettings object
export const useUpdateUserSettings = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn : updateUserSettings,  // (body) => Promise<UserSettings>
        onSuccess  : (newSettings) => {qc.setQueryData(["settings"], newSettings); toast.success("Settings updated!");},
        onError    : (err: Error) => toast.error(err.message),
        onSettled  : () => qc.invalidateQueries({ queryKey: ["settings"] }),
    });
};