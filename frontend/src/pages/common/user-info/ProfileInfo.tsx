import { useState                } from "react";
import { OverlayTrigger, Popover, Spinner } from "react-bootstrap";
import { FaCircleUser } from "react-icons/fa6";
import { User              } from "@/api";
import { CAREGIVER_OKLCH, PATIENT_OKLCH } from "@/utils/styling/colors";
import { downloadData } from "@/api";
import { useAuth } from "@/context/AuthProvider";
import { NavLink } from "react-router-dom";
import { useProfile } from "@/hooks/queries/useProfile";



// ====================================================================
// Profile Information 
// ====================================================================
export default function ProfileInfo({ isCare, user } : { isCare: boolean, user: User }) {
    const { account, logout } = useAuth();
    const {data: profile, isLoading} =  useProfile();

    // Popover controls
    const [show, setShow] = useState(false);
    const open  = () => setShow(true);
    const close = () => setShow(false);

    if (isLoading) {
        return <Spinner />
    }

    // --------------------------------------------------------------------
    // Popover 
    // --------------------------------------------------------------------
    const popover = (
        <Popover id="profile-popover" onMouseEnter={open} onMouseLeave={close} style={{ maxWidth: "none", width: "max-content" }}> 
            <Popover.Body className="flex flex-col px-[1rem] py-[0.5rem]">
                <span className="fs-4 fw-semibold"> {account.user.first_name} {account.user.last_name} </span>
            
                <div className="flex flex-col border-y p-[0.5rem] gap-[0.5rem] border-gray-300">
                    <NavLink to="/profile">
                        <button className="text-lg hover:text-blue-600">Profile Settings</button>
                    </NavLink>
                    { user.is_staff ? 
                        <NavLink to="/admin">
                            <button className="text-lg hover:text-blue-600">Admin Page</button>
                        </NavLink> 
                    : null}
                    <button className="text-left text-blue-500 hover:text-blue-600 text-lg" onClick={() => logout()}>Log Out</button>
                </div>
                {isCare && profile ? <DownloadButton /> : null}
            </Popover.Body>
        </Popover>
    );

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