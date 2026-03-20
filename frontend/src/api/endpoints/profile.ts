import { request } from "../client";
import { Profile } from "../models";

// GET
export const getProfile = () => request<Profile>("/profile/");

// PUT
export const updateProfile = (body: Partial<Profile>) => request<Profile>("/profile/", { method: "PUT", body: JSON.stringify(body) });
