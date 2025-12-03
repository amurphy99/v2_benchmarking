import { BiomarkerType, ChatSession } from "@/api";
import { dateFormatShort } from "@/utils/styling/numFormatting";
import ReactApexChart from "react-apexcharts";

export default function BiomarkerGraph( {biomarker, sessions} : {biomarker: BiomarkerType, sessions: ChatSession[]} ) {
    // Prepare chart data
    const labels = sessions.map((s) => dateFormatShort.format(new Date(s.date)));
     const series = [{
        name: biomarker,
        data: sessions.map(session => Math.round(session.average_scores[biomarker] * 10)),
    }];

    const colors = series[0].data.map((s) => {
        if (s < 5) {
            return '#E89600'
        } else {
            return '#8b5cf6'
        }
    });

    const options = {
            chart: {
                id          : "score-track",
                stacked     : true,
                toolbar     : { show    : false },
                zoom        : { enabled : false }, 
                pan         : { enabled : false },
                foreColor   : "#6b7280",
            },
            xaxis       : { categories: labels, labels: { format: "MMM dd" }, tickPlacement: "on" }, // type: "datetime",
            yaxis       : { 
                labels: { show: false }, 
                min: 0,
                max: 10,
            },
            plotOptions : { bar: { 
                columnWidth: "40%", 
                borderRadius: 6,
                dataLabels: {
                    position: 'top', // top, center, bottom
                },
            } },
            grid        : { show: false},
            dataLabels: {
                enabled: true,
                formatter: function (val) {
                  return val;
                },
                offsetY: -20,
                style: {
                  fontSize: '12px',
                  colors: ["#304758"]
                }
              },
            noData      : { text: "No sessions found." },
            colors      : colors,
            tooltip     : {
                enabled         : false,
                shared          : true,
                followCursor    : false,
                intersect       : false,
                inverseOrder    : false,
                hideEmptySeries : true,
                fillSeriesColor : false,
                style           : { fontSize: '12px', fontFamily: undefined },
                onDatasetHover  : { highlightDataSeries: true, },
                x               : { show: true, format: 'MMM dd', },
                marker          : { show: true, },
            },
        };

    return (
        <>
            <ReactApexChart
                type="bar"
                height="100%"
                options={options}
                series={series}
            />
        </>
    )
}