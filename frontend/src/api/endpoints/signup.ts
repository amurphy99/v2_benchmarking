import { request } from "../client";
import { SignupPayload, SignupResponse } from "../models";

// POST
export const signUp = (body: SignupPayload) => request<SignupResponse>("/signup/", { method: "POST", body: JSON.stringify(body) });
