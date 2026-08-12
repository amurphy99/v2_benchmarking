import { Gauge, gaugeClasses } from '@mui/x-charts/Gauge';

export default function RiskGauge( {riskLevel} : {riskLevel: number} ) {
  return (
    <Gauge
        cornerRadius="50%"
        value={riskLevel}
        valueMax={4}
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
                fill: riskLevel == 0 ? "#4CAF50" : riskLevel == 1 ? "#FFEB3B" : riskLevel == 2 ? "#FF9800" : riskLevel == 3 ? "#F44336" : "#9C27B0",
            },
        }}
    />
  );
}
