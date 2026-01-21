import { request } from "../client";
import { Profile } from "../models";

// GET
export const getProfile = () => request<Profile>("/profile/");
