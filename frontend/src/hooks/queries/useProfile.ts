import { getProfile, getProfiles, Profile } from "@/api";
import { useModelQuery } from "./common";

// [GET] Hook to wrap useQuery for retrieving Profile objects
export const useProfile = () =>
    useModelQuery<Profile>({
        queryKey: "goal",
        queryFn : getProfile,
    });

// [GET] Hook to wrap useQuery for retrieving all Profile objects the currently logged in user has access to (patients will have 1, caregivers may have many)
export const useProfiles = () => 
    useModelQuery<Profile[]>({
        queryKey: "profiles",
        queryFn : getProfiles,
        empty   : []
    })