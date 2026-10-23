/* Staff-only field for giving an account a new password from its card's edit mode.
--------------------------------------------------------------------------------
`@frontend/src/pages/admin/components/participants/NewPasswordField`

Passwords are stored only as one-way hashes, so nobody can see the current one.
Staff type a new one in plain text, copy it to give to the user, and the card's
Save applies it. Left blank, the password stays as it is. A login whose password
the server's .env resets on every restart shows a disabled field instead.

*/
import type { ChangeEvent, ReactElement } from "react";
import      { useId                     } from "react";
import        toast                       from "react-hot-toast";

// From this project
import { AdminButton } from "../ui/AdminButton";


// --------------------------------------------------------------------------------
// New Password Field
// --------------------------------------------------------------------------------
// Plain-text new password with a Copy button (or a note when the .env controls it)
export function NewPasswordField({value, disabled, fromEnv = false, onChange}: {
    value     : string;                    // Typed password ("" keeps the current one)
    disabled  : boolean;                   // A save is running
    fromEnv?  : boolean | undefined;       // The server's .env resets this password on every restart
    onChange  : (value: string) => void;   // Replace the typed password
}): ReactElement {
    const inputId = useId();

    // Copy the typed password so staff can pass it on
    const copy = async (): Promise<void> => {
        try {
            await navigator.clipboard.writeText(value);
            toast.success("Password copied");
        } catch (err) {
            toast.error(`Could not copy the password: ${(err as Error).message}`);
        }
    };

    return (
        <div>
            <label htmlFor={inputId} className="text-sm font-medium text-admin-text">New password</label>
            <div className="mt-1 flex gap-2">
                <input
                    id           = {inputId}
                    type         = "text"
                    value        = {value}
                    disabled     = {disabled || fromEnv}
                    placeholder  = {fromEnv ? "Set in the server's .env" : "Leave blank to keep the current one"}
                    autoComplete = "off"
                    spellCheck   = {false}
                    onChange     = {(event: ChangeEvent<HTMLInputElement>) => onChange(event.target.value)}
                    className    = "min-w-0 flex-1 rounded-md border border-admin-border bg-admin-panel px-3 py-2 text-sm text-admin-text disabled:opacity-60"
                />
                <AdminButton variant="outline" size="sm" type="button" onClick={copy} disabled={disabled || fromEnv || (value === "")}>Copy</AdminButton>
            </div>
            <div className="text-xs text-admin-subtext mt-1">
                {fromEnv ? "The server's .env resets this password on every restart, so it can't be changed here." : "Applied when you save. Give it to the user; it can't be shown again later."}
            </div>
        </div>
    );
}
