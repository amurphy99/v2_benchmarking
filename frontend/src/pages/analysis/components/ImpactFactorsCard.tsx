import { blockStyle } from "@/utils/styling/sharedStyles";

export default function ImpactFactorsCard() {
    return (
        <div className={blockStyle}>
            <h2 className={`text-orange-500`}>Correlation</h2>
            <li className="text-lg ml-[1rem] marker:text-orange-500">
                Here would be an explanation of what factors we found to be correlated with each other.
                For example, if when the grammar score goes up, the prosody score also goes up.
            </li>
            <div className="w-full h-[5rem] bg-blue-100">
                Here would be a graph visualizing these correlations.
            </div>
            <li className="text-lg ml-[1rem] marker:text-orange-500">
                Other factors might also impact performance, such as sleep quality, physical exercise, 
                or social activities. You can add more factors do build a comprehensive data base for 
                correlation analysis.
            </li>
            <button className={'caregiver-button-outline px-[1rem] py-[.5rem] ml-[1rem] rounded-lg mt-[1rem]'}>
                Add Factors
            </button>
        </div>
    )
}