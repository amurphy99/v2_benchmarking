/* Staff form for creating a participant or caregiver login.
--------------------------------------------------------------------------------
`@frontend/src/pages/admin/AdminCreateAccount`

There is no public signup: someone who needs an account asks staff, who create
it here. A new participant starts on the defaults (Smiley avatar, recording off,
English), which the Accounts page can change afterwards; a new caregiver sees
nobody until it is linked to participants there. A successful save returns to
that page. Opened at `/admin/accounts/new`.

*/
import type { ChangeEvent, FormEvent, ReactElement } from "react";
import      { useId, useState                      } from "react";
import      { useNavigate                          } from "react-router-dom";
import        toast                                  from "react-hot-toast";

// From this project
import type { CreateAccountPayload, NewAccountRole } from "@/api";
import      { useCreateAccount                     } from "@/hooks/queries/useAdminAccounts";

// Components
import { AdminButton   } from "./components/ui/AdminButton";
import { AdminPage     } from "./components/ui/AdminPage";
import { SectionHeader } from "./components/ui/SectionHeader";

// One account kind staff can create, with the words the form shows for it
type RoleOption = {value: NewAccountRole; label: string; hint: string};

// Account kinds in the order the form lists them
const ROLE_OPTIONS: RoleOption[] = [
    {value: "patient",   label: "Participant", hint: "Chats with the avatar. Gets their own profile and settings."},
    {value: "caregiver", label: "Caregiver",   hint: "Monitors the participants linked to them on the Monitor pages."},
];

// Shared input styling
const INPUT_CLASS = "mt-1 w-full rounded-md border border-admin-border bg-admin-panel px-3 py-2 text-sm text-admin-text";
const LABEL_CLASS = "text-sm font-medium text-admin-text";

// Empty form
const EMPTY_FORM: CreateAccountPayload = {username: "", password: "", first_name: "", last_name: "", role: "patient"};


// ================================================================================
// Admin Create Account
// ================================================================================
// Form with the account kind, name, username, and password, saved in one request
export function AdminCreateAccount(): ReactElement {
    const navigate      = useNavigate();
    const createAccount = useCreateAccount();

    // Form values (the confirmation never leaves the page)
    const [form,    setForm   ] = useState<CreateAccountPayload>(EMPTY_FORM);
    const [confirm, setConfirm] = useState<string              >("");

    // Ids tying the labels to their inputs
    const firstId    = useId();
    const lastId     = useId();
    const usernameId = useId();
    const passwordId = useId();
    const confirmId  = useId();

    // --------------------------------------------------------------------------------
    // Form Handlers
    // --------------------------------------------------------------------------------
    // Copy one text input into the form by its `name`
    const onField = (event: ChangeEvent<HTMLInputElement>): void => setForm({...form, [event.target.name]: event.target.value});

    // Create the account, then return to the Accounts page (a failure toasts and keeps the form)
    const onSubmit = (event: FormEvent): void => {
        event.preventDefault();
        if (form.password !== confirm) { toast.error("The two passwords do not match"); return; }
        createAccount.mutate(form, {onSuccess: () => navigate("/admin/participants")});
    };

    // --------------------------------------------------------------------------------
    // Render
    // --------------------------------------------------------------------------------
    return (
        <AdminPage>
            <div className="flex flex-col gap-6 pt-6 max-w-xl">
                {/* Back link and page title */}
                <div className="bg-admin-panel border border-admin-border rounded-xl shadow-sm p-4">
                    <button className="text-sm text-admin-subtext hover:text-admin-text transition-colors mb-4 w-fit cursor-pointer" onClick={() => navigate("/admin/participants")}>
                        ← Back to Accounts
                    </button>
                    <SectionHeader title="Create Account" subtitle="Give the new user their username and password once it is created." />
                </div>

                <form onSubmit={onSubmit} className="bg-admin-panel border border-admin-border rounded-xl shadow-sm p-5 flex flex-col gap-5">
                    {/* -------------------------------------------------------------------------------- */}
                    {/* Account Kind */}
                    {/* -------------------------------------------------------------------------------- */}
                    <fieldset className="flex flex-col gap-2" disabled={createAccount.isPending}>
                        <legend className={LABEL_CLASS}>Account type</legend>
                        {ROLE_OPTIONS.map((option: RoleOption) => (
                            <label key={option.value} className="flex items-start gap-3 rounded-md border border-admin-border px-3 py-2 cursor-pointer">
                                <input
                                    type      = "radio"
                                    name      = "role"
                                    value     = {option.value}
                                    checked   = {form.role === option.value}
                                    onChange  = {() => setForm({...form, role: option.value})}
                                    className = "mt-1"
                                />
                                <span>
                                    <span className="block text-sm font-medium text-admin-text">{option.label}</span>
                                    <span className="block text-xs text-admin-subtext">{option.hint}</span>
                                </span>
                            </label>
                        ))}
                    </fieldset>

                    {/* -------------------------------------------------------------------------------- */}
                    {/* Name and Login */}
                    {/* -------------------------------------------------------------------------------- */}
                    <fieldset className="grid gap-4 sm:grid-cols-2" disabled={createAccount.isPending}>
                        <div>
                            <label htmlFor={firstId} className={LABEL_CLASS}>First name</label>
                            <input id={firstId} name="first_name" required value={form.first_name} onChange={onField} className={INPUT_CLASS} />
                        </div>
                        <div>
                            <label htmlFor={lastId} className={LABEL_CLASS}>Last name</label>
                            <input id={lastId} name="last_name" required value={form.last_name} onChange={onField} className={INPUT_CLASS} />
                        </div>
                        <div className="sm:col-span-2">
                            <label htmlFor={usernameId} className={LABEL_CLASS}>Username</label>
                            <input id={usernameId} name="username" required autoComplete="off" value={form.username} onChange={onField} className={INPUT_CLASS} />
                        </div>
                        <div>
                            <label htmlFor={passwordId} className={LABEL_CLASS}>Password</label>
                            <input id={passwordId} name="password" type="password" required autoComplete="new-password" value={form.password} onChange={onField} className={INPUT_CLASS} />
                        </div>
                        <div>
                            <label htmlFor={confirmId} className={LABEL_CLASS}>Confirm password</label>
                            <input id={confirmId} type="password" required autoComplete="new-password" value={confirm} onChange={(event: ChangeEvent<HTMLInputElement>) => setConfirm(event.target.value)} className={INPUT_CLASS} />
                        </div>
                    </fieldset>

                    {/* Cancel and create */}
                    <div className="flex justify-end gap-2">
                        <AdminButton variant="outline" size="sm" type="button" onClick={() => navigate("/admin/participants")} disabled={createAccount.isPending}>Cancel</AdminButton>
                        <AdminButton variant="primary" size="sm" type="submit" disabled={createAccount.isPending}>
                            {createAccount.isPending ? "Creating..." : "Create account"}
                        </AdminButton>
                    </div>
                </form>
            </div>
        </AdminPage>
    );
}
