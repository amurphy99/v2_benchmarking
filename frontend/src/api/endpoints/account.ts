import { request      } from "../client";
import { Account } from "../models";

export const getAccount     = ()                       => request<Account>('/account/');
export const getSingleAccount     = (username: string) => request<Account>(`/account/${username}/`);
export const updateAccount  = (body: Partial<Account>) => request<Account>("/account/", { method: "PUT", body: JSON.stringify(body) });