import      { request                         } from "../client";
import type { ChatSession, ChatSessionSummary } from "../models";

// GET
// 0 = inactive/non-demo, 1=active/demo, 2=exclude filter
// (each chat's summary only: `getChatSession` has one chat's transcript)
export const listChatSessions = (active: number = 0, demo: number = 2) => request<ChatSessionSummary[]>(`/chatsessions/${active}/${demo}/`);

export const getChatSession = (id: string) => request<ChatSession>(`/chatsession/${id}/`);

export const getSessionAudioPlayback = (id: string) => request<{url: string}>(`/chatsession/${id}/audio-playback/`);

export const listAllChatSessions = () => request<ChatSession[]>("/allchatsessions/");

export const listActiveChatSessions = () => request<ChatSession[]>("/activechatsessions/");

export const getLatestSession = () => request<ChatSession>("/chatsession/latest/");
