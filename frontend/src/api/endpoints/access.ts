import { request } from "../client";
import { Access } from "../models";

export const createAccess  = (body: Partial<Access>) => request<Access>("/access/", { method: "POST", body: JSON.stringify(body) });