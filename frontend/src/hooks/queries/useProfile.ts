import { getProfile, Profile } from "@/api";
import { useModelQuery } from "./common";

// [GET] Hook to wrap useQuery for retrieving Profile objects
export const useProfile = () =>
    useModelQuery<Profile>({
        queryKey: "goal",
        queryFn : getProfile,
        empty   : {} as Profile
    });