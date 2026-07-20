import { ChatSession, getChatSession, listAllChatSessions, getLatestSession, listChatSessions } from "@/api";
import { useModelQuery } from "@/hooks/queries/common";

// Hook to wrap useQuery for retrieving ChatSession objects
// Default to inactive sessions only and all sessions (non-demo and demo both)
export const useChatSessions = (active: number = 0, demo: number = 2) =>
    useModelQuery<ChatSession[]>({
        queryKey: "chatSessions",
        queryFn : () => listChatSessions(active, demo),
        empty   : [],
    });

export const useChatSession = (id: string) =>
    useModelQuery<ChatSession>({
        queryKey  : `chatSession:${id}`,
        queryFn   : () => getChatSession(id),
        empty     : {} as ChatSession,
        staleTime : 10_000, // 10 seconds
    });


export const useAllChatSessions = () => {
    return useModelQuery<ChatSession[]>({
        queryKey: "allChatSessions",
        queryFn : listAllChatSessions,
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

export const useChatSessionSummaries = () =>
    useModelQuery<ChatSession[]>({
        queryKey: "chatSessionsSummary",
        queryFn : listChatSessions,
        empty   : [],
    });

// --------------------------------------------------------------------------------
// Admin ChatSession Queries 
// --------------------------------------------------------------------------------
// (need to do separately because the query is "saving" the results for both)
export const useActiveChatSessions = (demo: number = 2) =>
    useModelQuery<ChatSession[]>({
        queryKey: "activeChatSessions",
        queryFn : () => listChatSessions(1, demo),
        empty   : [],
    });

export const useInactiveChatSessions = (demo: number = 2) =>
    useModelQuery<ChatSession[]>({
        queryKey: "inactiveChatSessions",
        queryFn : () => listChatSessions(0, demo),
        empty   : [],
    });
