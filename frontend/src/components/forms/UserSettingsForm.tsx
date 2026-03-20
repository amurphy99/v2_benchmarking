import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { h4, switchStyle, switchLabel } from "@/utils/styling/sharedStyles";
import { toastMessage                 } from "@/utils/functions/toast_helper";
import { useUserSettings } from "@/hooks/queries/useUserSettings";
import { Spinner } from "react-bootstrap";

type Methods = { submit: () => void };

// ====================================================================
// UserSettings Form
// ====================================================================
export const UserSettingsForm = forwardRef<Methods>((props, ref) => {
    // Lift form submission control up to the parent element
    const formRef = useRef<HTMLFormElement>(null);
    useImperativeHandle(ref, () => ({ submit() { formRef.current?.requestSubmit(); } }));

    // Get the current values from the profile & set them as state values for the form
    const { data: settings, isLoading, refetch } = useUserSettings();

    if (isLoading) {
        return <Spinner />
    }
    const [patientViewOverall, setPatientViewOverall] = useState<boolean>(settings.patientViewOverall);
    const [patientCanSchedule, setPatientCanSchedule] = useState<boolean>(settings.patientCanSchedule);

    // Form submission logic 
    // ToDo: actually change the settings -- maybe do the async/await here + try and except
    const onSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        toastMessage("User settings updated", true); 
        refetch();
    };


    // --------------------------------------------------------------------
    // Return UI component
    // --------------------------------------------------------------------
    return (
    <form ref={formRef} onSubmit={onSubmit} className="flex flex-col">
        <div className={h4}> Patient Authority </div>

        <div className={switchStyle}>
            <label className={switchLabel}> PLwD can view "Personal Page" </label>
            <input className="form-check-input" type="checkbox" role="switch" checked={patientViewOverall ?? false} onChange={(e) => setPatientViewOverall(e.target.checked)}/>
        </div>

        <div className={switchStyle}>
            <label className={switchLabel}> PLwD can schedule new chats or activities </label>
            <input className="form-check-input" type="checkbox" role="switch" checked={patientCanSchedule ?? false} onChange={(e) => setPatientCanSchedule(e.target.checked)}/>
        </div>
        
    </form>
    );
});
