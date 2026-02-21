import { ChatSession, getLatestSession, listChatSessions } from "@/api";
import { useModelQuery } from "@/hooks/queries/common";

// Hook to wrap useQuery for retrieving ChatSession objects
export const useChatSessions = () =>
    useModelQuery<ChatSession[]>({
        queryKey: "chatSessions",
        queryFn : listChatSessions,
        empty   : [],
    });

export const useLatestChatSession = () => {
    useModelQuery<ChatSession>({
        queryKey: "chatSessions",
        queryFn : getLatestSession,
        empty   : {} as ChatSession,
    });
}