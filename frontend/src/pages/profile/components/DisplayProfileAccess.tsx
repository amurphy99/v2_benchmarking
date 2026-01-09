import { Access } from "@/api";
import { CAREGIVER_HEX } from "@/utils/styling/colors";
import { useState } from "react";
import { FaPlus } from "react-icons/fa";
import { FaCircleUser } from "react-icons/fa6";
import CreateAccessModal from "./CreateAccessModal";
import { useProfileAccess } from "@/hooks/queries/useAccess";

const accessCardStyle = "flex flex-col justify-center gap-2 shadow-lg/20 rounded-md p-2 min-w-1/4 text-center aspect-square";

export default function DisplayProfileAccess( ) {
    const [showForm, setShowForm] = useState(false);

    const {data: access, isLoading, refresh} = useProfileAccess();
    if (isLoading) { 
        return <p>Loading...</p>; 
    }

    return (
        <div className="w-2/3 flex flex-row gap-2">
            {access.map((acc, idx) => {
                return <AccessListItem key={idx} access={acc} />
            })}
            <div className={`${accessCardStyle} place-items-center justify-center
            hover:cursor-pointer hover:shadow-lg/50`} onClick={() => setShowForm(true)}>
                <FaPlus size={50} />
            </div>
            <CreateAccessModal showForm={showForm} onHide={() => setShowForm(false)} refresh={refresh} />
        </div>
    );
}

function AccessListItem( {access} : {access: Access} ) {
    return (
        <div className={accessCardStyle}>
            <div className="flex justify-center">
                <FaCircleUser size={50} color={CAREGIVER_HEX}/>
            </div>
            <p className="mb-0 font-bold">{access.account.user.first_name} {access.account.user.last_name}</p>
            <p className="mb-0 font-bold text-white bg-violet-600 px-1">{access.account.role}</p>
        </div>
    )
}