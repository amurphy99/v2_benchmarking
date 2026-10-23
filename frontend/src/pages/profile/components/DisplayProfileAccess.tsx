/* Cards for the caregivers a profile is shared with.
--------------------------------------------------------------------------------
`@frontend/src/pages/profile/components/DisplayProfileAccess`

Read-only: staff add and remove caregiver links on the admin accounts page.

*/
import type { ReactElement } from "react";
import      { FaCircleUser } from "react-icons/fa6";

// From this project
import type { Access           } from "@/api";
import      { useProfileAccess } from "@/hooks/queries/useAccess";
import      { CAREGIVER_HEX    } from "@/utils/styling/colors";

const accessCardStyle = "flex flex-col justify-center gap-2 shadow-lg/20 rounded-md p-2 min-w-1/4 text-center aspect-square";


// --------------------------------------------------------------------------------
// Profile Access
// --------------------------------------------------------------------------------
// One card per caregiver linked to the profile
export default function DisplayProfileAccess(): ReactElement {
    const {data: access, isLoading} = useProfileAccess();
    if (isLoading) return <p>Loading...</p>;

    return (
        <div className="w-2/3 flex flex-row gap-2">
            {(access.length === 0) ? <p className="mb-0">Nobody yet.</p> : null}
            {access.map((acc: Access) => <AccessListItem key={acc.id} access={acc} />)}
        </div>
    );
}

// One linked caregiver's name and role
function AccessListItem({access}: {access: Access}): ReactElement {
    return (
        <div className={accessCardStyle}>
            <div className="flex justify-center">
                <FaCircleUser size={50} color={CAREGIVER_HEX}/>
            </div>
            <p className="mb-0 font-bold">{access.account.user.first_name} {access.account.user.last_name}</p>
            <p className="mb-0 font-bold text-white bg-violet-600 px-1">{access.account.role}</p>
        </div>
    );
}
