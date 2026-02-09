import { request } from "../client";
import { Access, CreateAccessPayload } from "../models";

export const getAccountAccess     = ()                      => request<Access>("/access/", { method: "GET" });

export const getProfileAccess     = ()                      => request<Access[]>(`/accesses/`, { method: "GET" });

export const createAccess         = (body: Partial<CreateAccessPayload>) => request<Access>("/access/create/", { method: "POST", body: JSON.stringify(body) });