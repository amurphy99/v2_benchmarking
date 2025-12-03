import { BiomarkerType } from "@/api";
import { getAllBiomarkerDescriptions, getAllBiomarkerNames, getAllBiomarkers } from "@/utils/misc/descriptions";
import { colStyle, widthStyle } from "@/utils/styling/sharedStyles";
import { useNavigate } from "react-router-dom";

export function Practice() {
    const biomarkers = getAllBiomarkers();
    const biomarkerNames = getAllBiomarkerNames();
    const biomarkerDescriptions = getAllBiomarkerDescriptions();
    return (
        <>
            <div className={`${colStyle} mb-[5vh]`}>
                {biomarkers.map( (biomarker, idx) => {
                    return (
                        <Block key={idx} biomarker={biomarker} name={biomarkerNames[idx]} description={biomarkerDescriptions[idx]}></Block>
                    )
                })}
            </div>
        </>
    )
}

function Block( { biomarker, description, name } : { biomarker: BiomarkerType, description: string, name: string } ) {
    const navigate = useNavigate();

    const toPracticePage = (biomarker: string) => {
        navigate('/practice-page', { state: { biomarker: biomarker } });
    }

    return (
        <div className={`${widthStyle} practice-card`} onClick={() => toPracticePage(biomarker)}>
            <h2 className="text-center mb-0">{description}</h2>
            <p className="text-center text-xl mb-0">{name}</p>
        </div>
    )
}