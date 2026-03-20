import toast from "react-hot-toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { getUserSettings, updateUserSettings, UserSettings } from "@/api";
import { useModelQuery } from "./common";


// [GET] Hook to wrap useQuery for retrieving UserSettings objects
export const useUserSettings = () =>
    useModelQuery<UserSettings>({
        queryKey: "settings",
        queryFn : getUserSettings,
        empty   : {} as UserSettings,
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