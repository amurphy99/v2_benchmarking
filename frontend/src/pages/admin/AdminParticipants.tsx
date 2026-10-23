/* Participant settings, plus caregiver links and new accounts for staff.
--------------------------------------------------------------------------------
`@frontend/src/pages/admin/AdminParticipants`

Lists the participants this user monitors as cards, most recent chat first:
every participant for staff, only the linked ones for a caregiver. A participant
is a patient profile; caregivers own no profile, so they never appear there.
Each card edits in place: its Edit button switches it to edit mode, and nothing
is saved until that card's Save.

Staff also see a Caregivers section, where each card's edit mode adds or removes
the participants that caregiver monitors, plus a button to the account creation
page. Opened from the Monitor page at `/admin/participants`.

*/
import type { ReactElement } from "react";
import      { useNavigate  } from "react-router-dom";

// From this project
import type { AdminCaregiver, AdminProfile } from "@/api";
import      { useAuth                      } from "@/context/AuthProvider";
import      { useAdminCaregivers           } from "@/hooks/queries/useAdminAccounts";
import      { useAdminProfiles             } from "@/hooks/queries/useAdminProfiles";

// Components
import { CaregiverCard   } from "./components/participants/CaregiverCard";
import { ParticipantCard } from "./components/participants/ParticipantCard";
import { AdminButton     } from "./components/ui/AdminButton";
import { AdminPage       } from "./components/ui/AdminPage";
import { AdminPageHeader } from "./components/ui/AdminPageHeader";
import { SectionHeader   } from "./components/ui/SectionHeader";


// ================================================================================
// Admin Participants
// ================================================================================
// Participant cards, plus caregiver cards for staff, each editable in place
export function AdminParticipants(): ReactElement {
    const navigate = useNavigate();
    const isStaff  = useAuth().account.user.is_staff;

    // Participants, and (staff only; the backend refuses everyone else) caregivers with their links
    const {data: participants, isLoading                    } = useAdminProfiles();
    const {data: caregivers,   isLoading: caregiversLoading } = useAdminCaregivers(isStaff);

    return (
        <AdminPage contained={false}>
            {/* -------------------------------------------------------------------------------- */}
            {/* Page Header */}
            {/* -------------------------------------------------------------------------------- */}
            <AdminPageHeader
                title    = {isStaff ? "Accounts" : "Participant Settings"}
                subtitle = {isStaff
                    ? "Create accounts, choose which participants each caregiver monitors, and change each participant's settings."
                    : "Choose each of your participants' avatar, language, and whether their chat audio is saved automatically."}
                backTo   = "/admin"
                actions  = {isStaff ? <AdminButton variant="primary" size="sm" onClick={() => navigate("/admin/accounts/new")}>Create account</AdminButton> : undefined}
            />

            <div className="mx-auto max-w-[1400px] px-4 md:px-6 pt-6 flex flex-col gap-6">
                {/* -------------------------------------------------------------------------------- */}
                {/* Caregivers (staff only) */}
                {/* -------------------------------------------------------------------------------- */}
                {isStaff ? (
                    <section className="flex flex-col gap-3">
                        <SectionHeader title="Caregivers" subtitle="Each caregiver's Monitor pages show only the participants linked here." />
                        {caregiversLoading ? (
                            <p className="text-sm text-admin-subtext">Loading caregivers...</p>
                        ) : (caregivers.length === 0) ? (
                            <p className="text-sm text-admin-subtext">No caregivers yet. Create one with the Create account button.</p>
                        ) : (
                            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                                {caregivers.map((caregiver: AdminCaregiver) => <CaregiverCard key={caregiver.id} caregiver={caregiver} participants={participants} />)}
                            </div>
                        )}
                    </section>
                ) : null}

                {/* -------------------------------------------------------------------------------- */}
                {/* Participants */}
                {/* -------------------------------------------------------------------------------- */}
                <section className="flex flex-col gap-3">
                    {isStaff ? <SectionHeader title="Participants" subtitle="Avatar, language, and recording default for each participant. Changes apply from their next chat." /> : null}
                    {isLoading ? (
                        <p className="text-sm text-admin-subtext">Loading participants...</p>
                    ) : (participants.length === 0) ? (
                        <p className="text-sm text-admin-subtext">{isStaff ? "No participants yet. Create one with the Create account button." : "No participants are linked to your account yet."}</p>
                    ) : (
                        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                            {participants.map((participant: AdminProfile) => <ParticipantCard key={participant.id} participant={participant} />)}
                        </div>
                    )}
                </section>
            </div>
        </AdminPage>
    );
}
