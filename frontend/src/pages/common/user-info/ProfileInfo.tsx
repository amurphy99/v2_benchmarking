import { useState                } from "react";
import { OverlayTrigger, Popover } from "react-bootstrap";
import { FaUser       } from "react-icons/fa";
import { FaCircleUser } from "react-icons/fa6";
import { Profile, User              } from "@/api";
import { PATIENT_HEX, CAREGIVER_HEX } from "@/utils/styling/colors";
import { toastMessage               } from "@/utils/functions/toast_helper";


// ====================================================================
// Profile Information 
// ====================================================================
export default function ProfileInfo({ profile, user } : { profile: Profile, user: User }) {
    const isCare = profile.caregiver.id === user.id;

    // Popover controls
    const [show, setShow] = useState(false);
    const open  = () => setShow(true);
    const close = () => setShow(false);

    // Download report utility
    const downloadReport = () => { toastMessage("downloadReport() not implemented yet...", false); }
    const reportStyle = "fs-6 mt-[1rem] mb-[0.5rem] text-violet-600 border-1 border-violet-600 p-2 rounded hover:bg-violet-600 hover:text-white";

    // --------------------------------------------------------------------
    // Popover 
    // --------------------------------------------------------------------
    const popover = (
        <Popover id="profile-popover" onMouseEnter={open} onMouseLeave={close} style={{ maxWidth: "none", width: "max-content" }}> 
            <Popover.Body className="flex flex-col px-[1rem] py-[0.5rem]">
                <span className="fs-4 fw-semibold"> Profile </span>
            
                <div className="flex flex-col border-y py-[0.5rem] gap-[0.5rem] border-gray-300">
                    <UserInfo user={profile.plwd     } isCare={false}/>
                    <UserInfo user={profile.caregiver} isCare={true }/>
                </div>

                <button onClick={downloadReport} className={reportStyle}> Download Report </button>
            </Popover.Body>
        </Popover>
    );

    // --------------------------------------------------------------------
    // UI Component
    // --------------------------------------------------------------------
    const overlayStyle = "flex items-center gap-2 align-middle hover:text-decoration-underline";
    return (
    <OverlayTrigger show={show} placement="bottom" overlay={popover} trigger={[]} delay={{show: 250, hide: 400}}>
        <button onMouseEnter={open} onMouseLeave={close} onFocus={open} onBlur={close} className={overlayStyle}>
            <FaUser size={25} color={isCare ? CAREGIVER_HEX : PATIENT_HEX}/>
            <span className="text-nowrap align-middle">{user.first_name} {user.last_name}</span>
        </button>
    </OverlayTrigger>
    );
}


// --------------------------------------------------------------------
// Icon, First+Last Name, & Username
// --------------------------------------------------------------------
function UserInfo({ user, isCare } : { user: User, isCare: boolean }) { 
    return (
    <div className="flex gap-[1rem] fs-6">
        <span className="w-1/4 text-nowrap fs-6 fw-semibold"> 
            {isCare ? "Care Partner" : "User"} 
        </span>

        <div className="w-1/3 flex gap-[0.5rem]"> 
            <FaCircleUser size={25} color={isCare ? CAREGIVER_HEX : PATIENT_HEX}/>
            <span className="text-nowrap"> {user.first_name} {user.last_name} </span>
        </div>

        <span className="w-1/3 text-nowrap fw-light font-monospace px-[0.5rem] rounded bg-gray-200"> 
            {user.username} 
        </span>
    </div>
    );
}
