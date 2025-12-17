import { request } from "../client";
import { SignupAccountPayload, SignupPatientPayload, SignupResponse } from "../models";

// POST
export const signUpPatient = (body: SignupPatientPayload) => request<SignupResponse>("/signup-patient/", { method: "POST", body: JSON.stringify(body) });

export const signUpAccount = (body: SignupAccountPayload) => request<SignupResponse>("/signup-account/", { method: "POST", body: JSON.stringify(body) });
