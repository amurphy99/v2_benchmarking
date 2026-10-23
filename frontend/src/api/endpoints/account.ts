/* REST calls for the logged-in user's account.
--------------------------------------------------------------------------------
`@frontend/src/api/endpoints/account`

*/
import { request      } from "../client";
import { Account } from "../models";

export const getAccount     = ()                       => request<Account>('/account/');
export const updateAccount  = (body: Partial<Account>) => request<Account>("/account/", { method: "PUT", body: JSON.stringify(body) });
