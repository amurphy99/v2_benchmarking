/* React context for the BiomarkerInfoModal.
--------------------------------------------------------------------------------
The BiomarkerInfoModal can be opened from anywhere within the playback page. The
provider lives in TranscriptPlayback.tsx; consumers (e.g. BiomarkerGroup) call 
the function with a biomarker type to open the modal.
*/
import { createContext } from "react";

export type OpenBiomarkerInfo = (biomarkerType: string) => void;

export const BiomarkerInfoContext = createContext<OpenBiomarkerInfo | null>(null);
