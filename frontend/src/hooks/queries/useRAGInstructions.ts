import { RAGInstructions, listRAGInstructions } from "@/api";
import { useModelQuery } from "@/hooks/queries/common";

// [GET] Hook to wrap useQuery for retrieving RAG instructions
export const useRAGInstructions = (userKey?: number | string) => {
  const queryKey =
    userKey !== undefined && userKey !== null
      ? `raginstructions-${userKey}`
      : "raginstructions";

  return useModelQuery<RAGInstructions[]>({
    queryKey,
    queryFn: listRAGInstructions,
    empty: [],
  });
};