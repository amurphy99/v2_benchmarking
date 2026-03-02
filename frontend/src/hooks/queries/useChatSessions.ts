import { ChatSession, getChatSession, listActiveChatSessions, listAllChatSessions, getLatestSession, listChatSessions } from "@/api";
import { useModelQuery } from "@/hooks/queries/common";

// Hook to wrap useQuery for retrieving ChatSession objects
export const useChatSessions = () =>
    useModelQuery<ChatSession[]>({
        queryKey: "chatSessions",
        queryFn : listChatSessions,
        empty   : [],
    });

export const useChatSession = (id: string) =>
    useModelQuery<ChatSession>({
        queryKey: "chatSession",
        queryFn : () => getChatSession(id),
        empty   : {} as ChatSession,
    });


export const useAllChatSessions = () => {
    return useModelQuery<ChatSession[]>({
        queryKey: "allChatSessions",
        queryFn : listAllChatSessions,
        empty   : [],
    });
}

export const useActiveChatSessions = () => {
    return useModelQuery<ChatSession[]>({
        queryKey: "activeChatSessions",
        queryFn : listActiveChatSessions,
        empty   : [],
    });
}

export const useLatestChatSession = () => {
    useModelQuery<ChatSession>({
        queryKey: "chatSessions",
        queryFn : getLatestSession,
        empty   : {} as ChatSession,
    });
}