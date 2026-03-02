import { request     } from "../client";
import { ChatSession } from "../models";

// GET
export const listChatSessions = () => request<ChatSession[]>("/chatsessions/");

export const getChatSession = (id: string) => request<ChatSession>(`/chatsession/${id}/`);

export const listAllChatSessions = () => request<ChatSession[]>("/allchatsessions/");

export const listActiveChatSessions = () => request<ChatSession[]>("/activechatsessions/");

export const getLatestSession = () => request<ChatSession>("/chatsession/latest/");