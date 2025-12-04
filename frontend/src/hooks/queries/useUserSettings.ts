import toast from "react-hot-toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updateUserSettings } from "@/api";



// [POST] Hook to wrap useQueryClient for updating UserSettings object
export const useUpdateUserSettings = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn : updateUserSettings,  // (body) => Promise<Goal>
        onSuccess  : (newGoal) => {qc.setQueryData(["goal"], newGoal); toast.success("Goal updated!");},
        onError    : (err: Error) => toast.error(err.message),
        onSettled  : () => qc.invalidateQueries({ queryKey: ["goal"] }),
    });
};



