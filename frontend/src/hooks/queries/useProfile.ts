import { getProfile, Profile, updateProfile } from "@/api";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useModelQuery } from "./common";
import toast from "react-hot-toast";

// [GET] Hook to wrap useQuery for retrieving Profile objects
export const useProfile = () =>
    useModelQuery<Profile>({
        queryKey: "goal",
        queryFn : getProfile,
    });