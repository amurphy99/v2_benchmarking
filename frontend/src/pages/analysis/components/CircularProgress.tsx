import { ApexOptions } from "apexcharts";
import { useState } from "react";
import ReactApexChart from "react-apexcharts";

export default function CircularProgress( {score, role} : {score: number, role: string}) {
    const series = [score];

    const colorStops = role == "patient" ? 
    [
        {
            offset: 0,
            color: '#b0dfc1ff',
            opacity: 1
        },
        {
            offset: 30,
            color: '#8ccda0ff',
            opacity: 1
        },
        {
            offset: 60,
            color: '#61c880ff',
            opacity: 1
        },
        {
            offset: 90,
            color: '#3dd26aff',
            opacity: 1
        },
        {
            offset: 150,
            color: '#0ac945',
            opacity: 1
        },
    ] : [
        {
            offset: 0,
            color: '#e9e1faff',
            opacity: 1
        },
        {
            offset: 30,
            color: '#d6c7f8ff',
            opacity: 1
        },
        {
            offset: 60,
            color: '#b79df5ff',
            opacity: 1
        },
        {
            offset: 90,
            color: '#a17cf7ff',
            opacity: 1
        },
        {
            offset: 150,
            color: '#8b5cf6',
            opacity: 1
        },
    ]
    const options: ApexOptions = {
        chart: {
            height: "100%",
            type: 'radialBar',
        },
        plotOptions: {
            radialBar: {
                startAngle: -100,
                endAngle: 100,
                track: {
                    background: '#fff',
                    margin: 0, // margin is in pixels
                },
                dataLabels: {
                    show: true,
                    name: {
                        offsetY: -10,
                        show: true,
                        color: '#888',
                        fontSize: '16px'
                    },
                    value: {
                        formatter: function(val: number) {
                            return val.toString();
                        },
                        offsetY: 0,
                        color: '#111',
                        fontSize: '30px',
                        show: true,
                    }
                }
            }
        },
        fill: {
            type: 'gradient',
            gradient: {
                shade: 'light',
                type: 'horizontal',
                shadeIntensity: 0.5,
                inverseColors: true,
                opacityFrom: 1,
                opacityTo: 1,
                colorStops: colorStops,
            }
        },
        stroke: {
            lineCap: 'round'
        },
        labels: ['Total Score'],
    }

     return (
            <ReactApexChart options={options} series={series} type="radialBar" height={"100%"} />
        );
    }