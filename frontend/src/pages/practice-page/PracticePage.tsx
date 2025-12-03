import { getBiomarkerDescription } from "@/utils/misc/descriptions";
import { getBiomarkerCards } from "@/utils/misc/practiceCards";
import { colStyle, widthStyle } from "@/utils/styling/sharedStyles";
import { useEffect, useState } from "react";
import { IoIosArrowDropleft, IoIosArrowDropright } from "react-icons/io";
import { useLocation, useNavigate } from "react-router-dom";

export function PracticePage() {
    const navigate = useNavigate();
    const { state } = useLocation() as { state?: { biomarker: string } };
    const [cardNum, setCardNum] = useState<number>(0);
    const biomarker = state?.biomarker;
    const cards = getBiomarkerCards(biomarker);
    const description = getBiomarkerDescription(biomarker);

    const increaseCardNum = () => {
        setCardNum(cardNum < cards.length - 1 ? cardNum + 1 : cardNum)
    }

    const decreaseCardNum = () => {
        setCardNum(cardNum > 0 ? cardNum - 1 : cardNum)
    }

    const toPractice = () => {
        navigate("/practice");
    }
    
    return (
        <>
            <div className="font-bold text-2xl font-bold m-[1rem] justify-between hover:cursor-pointer w-fit" onClick={() => toPractice()}>
                ← {description}
            </div>
            <div className={`${colStyle}`}>
                <div className={`flex flex-row rounded-[1rem] p-[0.5rem] mt-[3rem] border-[1em] border-violet-600 h-[50vh] bg-white ${widthStyle}`}>
                    <div className="self-center hover:cursor-pointer" onClick={() => decreaseCardNum()}>
                            <IoIosArrowDropleft size={"2.5rem"} color={cardNum == 0 ? "gray" : "black"} />
                    </div>
                    <div className="w-9/10 h-full text-center self-center">
                        {cards[cardNum]}
                    </div>
                    <div className="self-center hover:cursor-pointer" onClick={() => increaseCardNum()}>
                        <IoIosArrowDropright size={"2.5rem"} color={cardNum == cards.length - 1 ? "gray" : "black"} />
                    </div>
                </div>
                <div className={`rounded-full h-[3rem] border-2 border-black ${widthStyle}`}>
                    <div className={`rounded-full h-full bg-violet-600`} style={{width: `${((cardNum + 1) / cards.length) * 100}%`}}>
                    </div>
                </div>
            </div>
        </>
    )
}