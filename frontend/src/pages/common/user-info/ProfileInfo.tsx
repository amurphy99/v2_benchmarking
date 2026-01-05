import { useState                } from "react";
import { OverlayTrigger, Popover } from "react-bootstrap";
import { FaCircleUser } from "react-icons/fa6";
import { User              } from "@/api";
import { PATIENT_HEX, CAREGIVER_HEX, CAREGIVER_OKLCH, PATIENT_OKLCH } from "@/utils/styling/colors";
import { downloadData } from "@/api";
import { useAuth } from "@/context/AuthProvider";
import { NavLink, useNavigate } from "react-router-dom";



// ====================================================================
// Profile Information 
// ====================================================================
export default function ProfileInfo({ isCare, user } : { isCare: boolean, user: User }) {
    const { logout } = useAuth();
    const navigate = useNavigate();

    // Popover controls
    const [show, setShow] = useState(false);
    const open  = () => setShow(true);
    const close = () => setShow(false);

    const logoutStyle = "fs-6 my-2 text-white border-1 bg-blue-500 p-2 rounded hover:bg-blue-700"

    // --------------------------------------------------------------------
    // Popover 
    // --------------------------------------------------------------------
    const popover = (
        <Popover id="profile-popover" onMouseEnter={open} onMouseLeave={close} style={{ maxWidth: "none", width: "max-content" }}> 
            <Popover.Body className="flex flex-col px-[1rem] py-[0.5rem]">
                <span className="fs-4 fw-semibold"> {user.first_name} {user.last_name} </span>
            
                <div className="flex flex-col border-y p-[0.5rem] gap-[0.5rem] border-gray-300">
                    <NavLink to="/profile">
                        <button className="text-lg hover:text-blue-600">Profile Settings</button>
                    </NavLink>
                    <button className="text-left text-blue-500 hover:text-blue-600 text-lg" onClick={() => logout()}>Log Out</button>
                </div>
                {isCare ? <DownloadButton /> : null}
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
            <FaCircleUser size={"2.5rem"} color={isCare ? CAREGIVER_OKLCH : PATIENT_OKLCH}/>
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

function DownloadButton() {
    const reportStyle = "fs-6 mt-[1rem] mb-[0.5rem] text-violet-600 border-1 border-violet-600 p-2 rounded hover:bg-violet-600 hover:text-white";

    const download = async () => {
        const { fileName, fileContents } = await downloadData();
        // Create a temporary link element
        const link = document.createElement('a');
        const blob = new Blob([fileContents], { type: 'text/plain' });
        link.href = URL.createObjectURL(blob);
        link.download = fileName;

        // Programmatically click the link to trigger the download
        link.click();

        // Clean up the URL object
        URL.revokeObjectURL(link.href);
    }

    return (
        <button className={reportStyle} onClick={() => download()}>
            Download Report
        </button>
    )
    
}
