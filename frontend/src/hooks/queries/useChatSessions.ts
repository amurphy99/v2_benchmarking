import   toast        from "react-hot-toast";
import { useEffect  } from "react";
import { useQueries } from "@tanstack/react-query";

import { ChatSession, ChatSessionSummary, getChatSession, getSessionAudioPlayback, listActiveChatSessions, listAllChatSessions, getLatestSession, listChatSessions } from "@/api";
import { useModelQuery } from "@/hooks/queries/common";

// How long one chat in full stays fresh (`useChatSession` and `useChatSessionDetails` share it)
const CHAT_SESSION_STALE_MS = 10_000;

// Hook to wrap useQuery for each chat's summary (`useChatSession` has one chat's transcript)
// Default to inactive sessions only and all sessions (non-demo and demo both)
export const useChatSessions = (active: number = 0, demo: number = 2) =>
    useModelQuery<ChatSessionSummary[]>({
        queryKey: "chatSessions",
        queryFn : () => listChatSessions(active, demo),
        empty   : [],
    });

export const useChatSession = (id: string) =>
    useModelQuery<ChatSession>({
        queryKey  : `chatSession:${id}`,
        queryFn   : () => getChatSession(id),
        empty     : {} as ChatSession,
        staleTime : CHAT_SESSION_STALE_MS,
    });

// Several chats in full, for a page that needs the transcripts of a few listed chats
// (each shares its cache with `useChatSession`; `isLoading` until every one arrives or fails)
export function useChatSessionDetails(ids: number[]): {data: ChatSession[]; isLoading: boolean} {
    const results = useQueries({
        queries: ids.map((id: number) => ({queryKey: [`chatSession:${id}`], queryFn: () => getChatSession(String(id)), staleTime: CHAT_SESSION_STALE_MS})),
    });

    // A chat that failed to load says why, like every other query (`useModelQuery`)
    const failure = results.find((result) => result.isError)?.error;
    useEffect(() => { if (failure) toast.error(failure.message); }, [failure]);

    const loaded = results.flatMap((result) => (result.data === undefined) ? [] : [result.data]);
    return {data: loaded, isLoading: results.some((result) => result.isLoading)};
}

export const useSessionAudioPlayback = (id: string, enabled: boolean) =>
    useModelQuery<{url: string}>({
        queryKey  : `sessionAudioPlayback:${id}`,
        queryFn   : () => getSessionAudioPlayback(id),
        empty     : {url: ""},
        staleTime : 0,
        enabled,
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

// --------------------------------------------------------------------------------
// Admin ChatSession Queries 
// --------------------------------------------------------------------------------
// (need to do separately because the query is "saving" the results for both)
export const useActiveChatSessions = (demo: number = 2) =>
    useModelQuery<ChatSessionSummary[]>({
        queryKey  : "activeChatSessions",
        staleTime : 0,
        queryFn   : () => listChatSessions(1, demo),
        empty     : [],
    });

export const useInactiveChatSessions = (demo: number = 2) =>
    useModelQuery<ChatSessionSummary[]>({
        queryKey  : "inactiveChatSessions",
        staleTime : 0,
        queryFn   : () => listChatSessions(0, demo),
        empty     : [],
    });
