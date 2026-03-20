import toast from "react-hot-toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Goal, getGoal, updateGoal } from "@/api";
import { useModelQuery } from "@/hooks/queries/common";

// [GET] Hook to wrap useQuery for retrieving Goal objects
export const useGoal = () =>
    useModelQuery<Goal>({
        queryKey: "goal",
        queryFn : getGoal,
        empty   : {} as Goal,
    });

// [POST] Hook to wrap useQueryClient for updating Goal objects
export const useUpdateGoal = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn : updateGoal,  // (body) => Promise<Goal>
        onSuccess  : (newGoal) => {qc.setQueryData(["goal"], newGoal); toast.success("Goal updated!");},
        onError    : (err: Error) => toast.error(err.message),
        onSettled  : () => qc.invalidateQueries({ queryKey: ["goal"] }),
    });
};
