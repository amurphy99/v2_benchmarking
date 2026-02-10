import React, {useEffect, useState} from "react";
import ReactApexChart from "react-apexcharts";
import ApexCharts from "apexcharts";

interface BiomarkerScoreSet {
    anomia?      : number;
    grammar?     : number;
    pragmatic?   : number;
    pronunciation?: number;
    prosody?     : number;
    turntaking?  : number;
}

interface Series {
    name: string;
    data: (number | null)[];
}

export default function LiveBiomarkers({scores} : {scores: BiomarkerScoreSet[]}) {
    function createSeries(biomarkerData: BiomarkerScoreSet[]): Series[] {
        var series: Series[] = [
            { name: "Anomia", data: [] },
            { name: "Grammar", data: [] },
            { name: "Pragmatic", data: [] },
            { name: "Pronunciation", data: [] },
            { name: "Prosody", data: [] },
            { name: "Turntaking", data: [] }
        ];
        for (const data of biomarkerData) {
            series[0].data.push(data.anomia ?? null);
            series[1].data.push(data.grammar ?? null);
            series[2].data.push(data.pragmatic ?? null);
            series[3].data.push(data.pronunciation ?? null);
            series[4].data.push(data.prosody ?? null);
            series[5].data.push(data.turntaking ?? null);
        }
        return series;
    }


    const options = {
        chart: {
            id: "biomarker-chart",
            height: 350,
            zoom: {
                enabled: true,
                autoScaleYaxis: false,  
                allowMouseWheelZoom: true,  
                zoomedArea: {
                    fill: {
                        color: '#90CAF9',
                        opacity: 0.4
                    },
                    stroke: {
                        color: '#0D47A1',
                        opacity: 0.4,
                        width: 1
                    }
                }
            },
            animations: {
                enabled: false
            },
            stroke: {
                width: [5,5,4],
                curve: "smooth"
            },
            xaxis: {

            },
            yaxis: {
                min: 0.00,
                max: 1.00,
                tickAmount: 1,
                floating: true,
                labels: {
                    formatter: function (val: number) {
                        return val.toFixed(3);
                    }
                }
            }
        }
    }

    useEffect(() => {
        ApexCharts.exec('biomarker-chart', 'zoomX', Math.max(0, scores.length - 5), scores.length)
    }, [scores]);

    return (
            <ReactApexChart options={options} series={createSeries(scores)} type="line" height={"100%"} width={"100%"}/>
    );

}