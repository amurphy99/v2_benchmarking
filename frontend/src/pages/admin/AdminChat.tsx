import { useParams } from "react-router-dom";

export function AdminChat() {
    const { id } = useParams();

    return (
        <div>
            <h1 className="m-[2rem]">Admin Page For Chat {id}</h1>
        </div>
    )
}