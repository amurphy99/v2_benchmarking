import { Gauge, gaugeClasses } from '@mui/x-charts/Gauge';
import { CAREGIVER_OKLCH, PATIENT_OKLCH } from "@/utils/styling/colors";

export default function CircularProgress( {score, role} : {score: number, role: string}) {
    return (
        <Gauge
            cornerRadius="50%"
            value={score}
            startAngle={-120}
            endAngle={120}
            text={({ value, valueMax }) => `${value} / ${valueMax}`}
            innerRadius="50%"
            outerRadius="75%"
            sx={{
                ["& .MuiGauge-valueText"]: {
                    fontSize: "1.5rem",
                    transform: 'translate(0px, -10px)',
                },
                [`& .${gaugeClasses.valueArc}`]: {
                    fill: role == "patient" ? PATIENT_OKLCH : CAREGIVER_OKLCH,
                },
            }}
        />
    )
}