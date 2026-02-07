import toast from "react-hot-toast";
import { useModelQuery } from "@/hooks/queries/common";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { getAccount, getSingleAccount, updateAccount } from "@/api/endpoints/account";
import { Account } from "@/api";

// [GET] Hook to wrap useQuery for retrieving Account objects

// Get account by username
export const useGetAccount = (username: string) =>
    useModelQuery<Account>({
        queryKey: "goal",
        queryFn : () => getSingleAccount(username),
        empty   : {} as Account,
    });

// Get current user's account
export const useAccount = () =>
    useModelQuery<Account>({
        queryKey: "goal",
        queryFn : getAccount,
        empty   : {} as Account,
    });


// [POST] Hook to wrap useQueryClient for updating Account objects
export const useUpdateAccount = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn : updateAccount,  // (body) => Promise<Account>
        onSuccess  : (newAccount) => {
            qc.setQueryData(["account"], newAccount); 
            toast.success("Account updated!");
        },
        onError    : (err: Error) => toast.error(err.message),
        onSettled  : () => qc.invalidateQueries({ queryKey: ["account"] }),
    });
};
