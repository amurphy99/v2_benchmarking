import { createAccess } from "@/api/endpoints/access";
import { getSingleAccount } from "@/api/endpoints/account";
import { useAuth } from "@/context/AuthProvider";
import { useProfile } from "@/hooks/queries/useProfile";
import { toastMessage } from "@/utils/functions/toast_helper";
import { useState } from "react";
import { Modal, Spinner } from "react-bootstrap";

export default function CreateAccessModal( {showForm, onHide, refetch} ) {
    const role = useAuth().account.role;
    const { data: profile, isLoading } = useProfile();
    const [username, setUsername] = useState<string>("");
    const [permissions, setPermissions] = useState<string>("default");

    if (isLoading) {
        return <Spinner />
    }

    const labelStyle = "text-lg w-1/3 flex justify-end text-right align-middle mb-0";

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        getSingleAccount(username).then((account) => {
            createAccess({
                profileId: profile.id,
                accountId: account.id,
                permissions: permissions
            }).then(() => {
                toastMessage(`Successfully shared profile with ${username}`, true);
                refetch();
                onHide();
            }).catch((error) => {
                toastMessage(`Error fetching account: ${error}`, false)
            })
        }).catch((error) => {
            toastMessage(`Error fetching account: ${error}`, false)
        })
    }

    return (
        <Modal show={showForm} onHide={onHide} centered backdrop="static">
            <Modal.Header closeButton>
                <h2>Share Information With </h2>
                </Modal.Header>
            <Modal.Body>
                <form>
                    <div className="flex flex-row gap-3 mb-2 items-center">
                        <p className={labelStyle}>Username:</p>
                        <input value={username} onChange={(e) => setUsername(e.target.value)} 
                        className="w-2/3 border-1 border-black rounded-sm p-2" type="text" />
                    </div>

                    <div className="flex flex-row gap-3 items-center">
                        <p className={labelStyle}>Permissions:</p>
                        <select className="w-2/3 border-1 border-black rounded-sm p-2" value={permissions}
                        onChange={(e) => setPermissions(e.target.value)}>
                            <option value="default" disabled>Select an Option</option>
                            <option value="full">Full Permissions</option>
                            <option value="view">View Only</option>
                        </select>
                    </div>
                    
                    <div className="flex justify-center mx-auto mt-4">
                        <button className={`btn ${role}-button`} type="submit" onClick={handleSubmit}> Save </button>
                    </div>
                </form>
            </Modal.Body>
        </Modal>
    )
}