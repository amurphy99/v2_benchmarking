import { widthStyle } from "@/utils/styling/sharedStyles";
import { useState } from "react";
import { IoIosArrowDown, IoIosArrowForward } from "react-icons/io";

export default function DropdownModal( {title, content} : {title: string, content: string[]}) {
    const [show, setShow] = useState<boolean>(false);

    return (
        <div className={`${widthStyle} flex flex-col`}>
            <button className={`px-[1rem] py-[0.5rem] bg-gray-200 border-1 border-solid border-gray-300 
            rounded-t-sm ${show ? "" : "rounded-b-sm"} hover:bg-gray-300 hover:shadow-md items-center`}
            onClick={() => setShow(!show)}>
                <span className="flex flex-row justify-between items-center">
                    <h4>{title}</h4>
                    {show ? <IoIosArrowDown size={"1.5rem"} /> : <IoIosArrowForward size={"1.5rem"} />}
                </span>
            </button>
            <div className={`${show ? "block" : "hidden"} bg-white border-x-1 border-b-1 border-solid border-gray-300 rounded-b-lg p-2`}>
                {content.map((text, idx) => {
                    return (
                        <p key={idx}>{text}</p>
                    )
                })}
            </div>
        </div>
    )
}