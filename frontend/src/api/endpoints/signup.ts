import { request } from "../client";
import { SignupPayload, SignupResponse } from "../models";

// POST
export const signUpPatient = (body: SignupPayload) => request<SignupResponse>("/signup-patient/", { method: "POST", body: JSON.stringify(body) });

export const signUpAccount = (body: SignupPayload) => request<SignupResponse>("/signup-account/", { method: "POST", body: JSON.stringify(body) });
