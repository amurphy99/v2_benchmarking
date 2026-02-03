import { request } from "../client";
import { Profile } from "../models";

// GET
export const getProfile = () => request<Profile>("/profile/");

export const getProfileById = (id: number) => request<Profile>(`/profile/${id}/`);

export const getProfiles = () => request<Profile[]>("/profiles/");

// PUT
export const updateProfile = (body: Partial<Profile>) => request<Profile>("/profile/", { method: "PUT", body: JSON.stringify(body) });
