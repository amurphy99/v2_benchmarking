import { RAGInstructions, listRAGInstructions } from "@/api";
import { useModelQuery } from "@/hooks/queries/common";

// [GET] Hook to wrap useQuery for retrieving Reminder objects
export const useRAGInstructions = () =>
    useModelQuery<RAGInstructions[]>({
        queryKey: "raginstructions",
        queryFn : listRAGInstructions,
        empty   : [],
    });