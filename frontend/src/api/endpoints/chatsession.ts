import { request     } from "../client";
import { ChatSession } from "../models";

// GET
export const listChatSessions = (active: number = 0, demo: number = 2) => request<ChatSession[]>(`/chatsessions/${active}/${demo}/`);

export const getChatSession = (id: string) => request<ChatSession>(`/chatsessions/${id}/`);

export const listAllChatSessions = () => request<ChatSession[]>("/allchatsessions/");

export const listActiveChatSessions = () => request<ChatSession[]>("/activechatsessions/");

export const getLatestSession = () => request<ChatSession>("/chatsession/latest/");