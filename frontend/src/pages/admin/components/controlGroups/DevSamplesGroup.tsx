
import { btnClass, groupDivStyle, buttonSectionHeader } from "@/hooks/chat-listener/chat-controls/styles";

// ================================================================================
// Add Sample Data
// ================================================================================
export default function DevSamplesGroup({
    onAddSampleMessage,
    onAddSampleBiomarker,
}: {
    // Button actions
    onAddSampleMessage   : () => void;
    onAddSampleBiomarker : () => void;
}) {
    // ================================================================================
    // UI Component Group
    // ================================================================================
    return (
        <div className={groupDivStyle}>
            <div className={buttonSectionHeader}>Add Sample Data</div>
                <div className="mt-2 flex flex-col gap-2">

                    {/* Add Sample Message */}
                    <button 
                        className = {btnClass(false, "primary")} 
                        onClick   = {onAddSampleMessage  }
                    >  Add sample message </button>

                    {/* Add Sample Biomarkers */}
                    <button 
                        className = {btnClass(false, "primary")} 
                        onClick   = {onAddSampleBiomarker}
                    >  Add sample biomarker  </button>
                
                </div>
        </div>
    );
}
