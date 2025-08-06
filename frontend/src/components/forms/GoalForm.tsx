import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { dateFormatShort              } from "@/utils/styling/numFormatting";
import { h4, switchStyle, switchLabel } from "@/utils/styling/sharedStyles";
import { toastMessage                 } from "@/utils/functions/toast_helper";
import { useAuth                      } from "@/context/AuthProvider";

import { updateUserSettings     } from "@/api";
import { useGoal, useUpdateGoal } from "@/hooks/queries/useGoal";


const weekdayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
type PeriodOptions = "N" | "W" | "M";
type Methods = { submit: () => void };


// ====================================================================
// Goal Update Form
// ====================================================================
// ToDo: add colors based on user being patient or caregiver
export const GoalForm = forwardRef<Methods>((props, ref) => {
    // Lift form submission control up to the parent element
    const formRef = useRef<HTMLFormElement>(null);
    useImperativeHandle(ref, () => ({ submit() { formRef.current?.requestSubmit(); } }));

    // Get the current values from the profile & set them as state values for the form
    const { profile } = useAuth();
    const [autoRenew, setAutoRenew] = useState<boolean        >(profile.goal.auto_renew);
    const [target,    setTarget   ] = useState<number         >(profile.goal.target);
    const [period,    setPeriod   ] = useState<"N" | "W" | "M">(profile.goal.period);
    const [startDay,  setStartDay ] = useState<string         >(profile.goal.start_date);
    const [startDOW,  setStartDOW ] = useState<number         >(profile.goal.start_dow);
    const { windowLabel, todayIdx } = getWindowLabel(startDOW);

    // Form submission logic 
    // ToDo: actually change the goal -- maybe do the async/await here + try and except
    const onSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        toastMessage("User goal updated", true); 
    };

    // Common styles
    const formText      = "font-medium fw-bold";
    const borderStyle   = "border border-gray-100 py-1 px-2";
    const disabledStyle = `bg-gray-100 text-gray-400 ${borderStyle}`;
    const rowThree      = "flex flex-col justify-around gap-0 w-50";

    // --------------------------------------------------------------------
    // Return UI component
    // --------------------------------------------------------------------
    return (
    <form ref={formRef} onSubmit={onSubmit} className="flex flex-col">
        <div className={h4}> Patient Goal </div>
    
        {/*   Auto Renew   */}
        <div className={switchStyle}>
            <label className={switchLabel}> Auto-renew goal frequency </label>
            <input className="form-check-input" type="checkbox" role="switch" checked={autoRenew ?? false} onChange={(e) => setAutoRenew(e.target.checked)}/>
        </div>


        {/*   Frequency   */}
        <div className="flex flex-col"> 
            <span className={formText}>Frequency</span>

            <div className="flex items-center justify-between gap-2">
                {/* Type of activity we have the goal for (?) */}
                <select disabled className={`w-40 ${disabledStyle}`}> <option>Daily Chat</option> </select>

                {/* Goal number */}
                <input type="number" min={1} className={`w-15 ${borderStyle}`} value={target} 
                    onChange={(e) => setTarget(+e.target.value)} />

                {/* Time unit */}
                <span className="w-20"> Times Per </span>
                <select className={`w-25 ${borderStyle}`} value={period} onChange={(e) => setPeriod(e.target.value as PeriodOptions)}>
                    <option value="Week" > Week  </option>
                    <option value="Month"> Month </option>
                </select>
            </div>
        </div>


        {/*   Start Day & Window   */}
        <div className="flex items-center gap-2">
            {/* Start day */}
            <div className={rowThree}>
                <label className={formText}>Start Day</label>
                <select className={`mt-1 ${borderStyle}`} value={startDOW} onChange={(e) => setStartDOW(+e.target.value)} >
                    {weekdayNames.map((day, i) => (<option key={i} value={i}> {day} {i === todayIdx && "(Today)"} </option>))}
                </select>
            </div>

            {/* Current window preview */}
            <div className={rowThree}>
                <label className={formText}>Current Goal Window</label>
                <span className={`mt-1 ${disabledStyle}`}> {windowLabel} </span>
            </div>
        </div>


    </form>
    );
});


// --------------------------------------------------------------------
// Label for the "Current Goal Window" form component
// --------------------------------------------------------------------
function getWindowLabel(startDay: number): { windowLabel: string; todayIdx: number } {
    // Get start day from the current date and the starting form data
    const today       = new Date();
    const todayIdx    = today.getDay();                            // Sun = 0, etc.
    const diff        = (7 + todayIdx - ((startDay + 1) % 7)) % 7; // day of the week
    
    // Set the window start and end dates
    const windowStart = new Date(today      ); windowStart.setDate(today      .getDate() - diff);
    const windowEnd   = new Date(windowStart); windowEnd  .setDate(windowStart.getDate() + 6   );
    const windowLabel = `${dateFormatShort.format(windowStart)} - ${dateFormatShort.format(windowEnd)} (7 Days)`;

    return { windowLabel, todayIdx };
};
