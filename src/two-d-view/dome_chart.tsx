import dayjs from "dayjs"
import * as SunCalc from 'suncalc'
import * as util from './sky_view_util.tsx'
import { Dome, TargetView } from "./two_d_view"
import Plot from "react-plotly.js"
import { GeoModel, useStateContext } from "../App.tsx"
import { reason_to_color_mapping, VizRow } from "./viz_chart.tsx"

interface DomeChartProps {
    targetView: TargetView[]
    showMoon: boolean
    showCurrLoc: boolean
    times: Date[]
    time: Date
    dome: Dome
}

const make_disk_polar = (r1: number, r2: number, th1: number, th2: number) => {

    let rr1 = [] as number[]
    let tt1 = [] as number[]
    let rr2 = [] as number[]
    let tt2 = [] as number[]
    for (let th = th1; th < th2; th++) {
        rr1.push(r1)
        tt1.push(th)
        rr2.push(r2)
        tt2.push(th)
    }

    const r = [...rr1, ...rr2.reverse(), rr1[0]]
    const theta = [...tt1, ...tt2.reverse(), tt1[0]]

    const pTrace: Partial<Plotly.PlotData | any> = {
        r: r,
        theta: theta,
        opacity: .5,
        color: "rgb(0,0,0)",
        line: {
            color: "rgb(0,0,0)",
            width: 0
        },
        type: 'scatterpolar',
        fill: 'toself',
        mode: 'lines',
        name: 'telescope bottom limit',
        hoverinfo: "none",
        hovermode: false,
    }
    return pTrace
}

const make_2d_traces = (targetView: TargetView[], showMoon: boolean, showCurrLoc: boolean, times: Date[], time: Date, 
time_format: string, KG: GeoModel, lngLatEl: util.LngLatEl 
): any[] => {
    let traces: any[] = targetView.map((tgtv: TargetView) => {
        let [rr, tt] = [[] as number[], [] as number[]]
        const texts: string[] = []
        let color: string[] = []
        tgtv.visibility.forEach((viz: VizRow) => {
            let txt = ""
            txt += `Az: ${viz.az.toFixed(2)}<br>`
            txt += `El: ${viz.alt.toFixed(2)}<br>`
            txt += `Airmass: ${viz.air_mass.toFixed(2)}<br>`
            txt += `HT: ${dayjs(viz.datetime).format(time_format)}<br>`
            txt += `Visible for: ${tgtv.visibilitySum.toFixed(2)} hours<br>`
            txt += viz.observable ? '' : `<br>Not Observable: ${viz.reasons.join(', ')}`
            texts.push(txt)
            color.push(reason_to_color_mapping(viz.reasons))
            rr.push(90 - viz.alt)
            tt.push(viz.az)
            return txt
        })

        const trace = {
            r: rr,
            theta: tt,
            text: texts,
            hovorinfo: 'text',
            hovertemplate: '<b>%{text}</b>', //disable to show xyz coords
            marker: {
                color: color,
                opacity: 0,
                size: 4
            },
            line: {
                width: 10
            },
            textposition: 'top left',
            type: 'scatterpolar',
            mode: 'lines+markers',
            namelength: -1,
            name: tgtv.target_name
        }
        return trace
    })

    if (showMoon) {
        let [rr, tt] = [[] as number[], [] as number[]]
        const texts: string[] = []
        times.forEach((time: Date, idx: number) => {
            const azel = SunCalc.getMoonPosition(time, lngLatEl.lat, lngLatEl.lng)
            const ae = [(Math.PI + azel.azimuth) * 180 / Math.PI, azel.altitude * 180 / Math.PI]
            const r = 90 - ae[1]
            if (r <= 90) {
                rr.push(90 - ae[1])
                tt.push(ae[0])
                let txt = ""
                txt += `Az: ${ae[0].toFixed(2)}<br>`
                txt += `El: ${ae[1].toFixed(2)}<br>`
                //txt += `Airmass: ${util.air_mass(ae[1], lngLatEl.el).toFixed(2)}<br>`
                txt += `Airmass: ${util.air_mass(ae[1]).toFixed(2)}<br>`
                txt += `HT: ${dayjs(times[idx]).format(time_format)}`
                texts.push(txt)
            }
        })

        const moonTrace = {
            r: rr,
            theta: tt,
            text: texts,
            opacity: .5,
            hovorinfo: 'text',
            color: "rgb(0,0,0)",
            hovertemplate: '<b>%{text}</b>', //disable to show xyz coords
            line: {
                width: 10
            },
            textposition: 'top left',
            type: 'scatterpolar',
            mode: 'markers',
            namelength: -1,
            name: 'Moon'
        }
        traces.push(moonTrace)
    }


    if (showCurrLoc) {
        let [rr, tt] = [[] as number[], [] as number[]]
        const texts: string[] = []
        if (showMoon) {
            const azel = SunCalc.getMoonPosition(time, lngLatEl.lat, lngLatEl.lng)
            const ae = [(Math.PI + azel.azimuth) * 180 / Math.PI, azel.altitude * 180 / Math.PI]
            const r = 90 - ae[1]
            if (r <= 88) {
                rr.push(90 - ae[1])
                tt.push(ae[0])
                let txt = ""
                txt += `Az: ${ae[0].toFixed(2)}<br>`
                txt += `El: ${ae[1].toFixed(2)}<br>`
                //txt += `Airmass: ${util.air_mass(ae[1], lngLatEl.el).toFixed(2)}<br>`
                txt += `Airmass: ${util.air_mass(ae[1]).toFixed(2)}<br>`
                txt += `HT: ${dayjs(time).format(time_format)}`
                texts.push(txt)
            }
        }
        targetView.forEach((tgtv: TargetView) => { //add current location trace
            const ra = tgtv.ra_deg as number
            const dec = tgtv.dec_deg as number
            const azEl = util.get_target_traj(ra, dec, [time], lngLatEl) as [number, number][]
            const r = 90 - azEl[0][1]
            if (r <= 88) {
                rr.push(r)
                tt.push(azEl[0][0])
                let txt = ""
                txt += `Az: ${azEl[0][0].toFixed(2)}<br>`
                txt += `El: ${azEl[0][1].toFixed(2)}<br>`
                //txt += `Airmass: ${util.air_mass(azEl[0][1], lngLatEl.el).toFixed(2)}<br>`
                txt += `Airmass: ${util.air_mass(azEl[0][1]).toFixed(2)}<br>`
                txt += `HT: ${dayjs(time).format(time_format)}`
                texts.push(txt)
            }
        })

        const trace = {
            r: rr,
            theta: tt,
            text: texts,
            hovorinfo: 'text',
            hovertemplate: '<b>%{text}</b>', //disable to show xyz coords
            color: "rgb(0,0,0)",
            textposition: 'top left',
            type: 'scatterpolar',
            mode: 'markers',
            marker: { 
                size: 12,
                color: 'red',
                line: {
                    color: 'black',
                    width: 2
                  }
             },
            namelength: -1,
            name: 'Current location'
        }
        traces.push(trace)
    }

    //add dome shapes
    const r0 = 90 - KG.r0
    const r1 = 90 - KG.r1
    const t0 = KG.t0
    const t1 = KG.t1
    const r2 = 90 - KG.r2
    const r3 = 90 - KG.r3
    const t2 = KG.t2
    const t3 = KG.t3
    const d1 = make_disk_polar(r0, r1, t0, t1)
    const d2 = make_disk_polar(r2, r3, t2, t3)
    const shape = {
        ...d1,
        r: [...d1.r, ...d2.r],
        theta: [...d1.theta, ...d2.theta]
    }

    traces.push(shape)

    //add tracking limits
    const rt1 = 0 
    const rt2 = 5 
    const tt0 = 0
    const tt1 = 361
    const d3 = make_disk_polar(rt1, rt2, tt0, tt1)
    const trackingshape = {
        ...d3,
        r: d3.r,
        theta: d3.theta
    }
    traces.push(trackingshape)
    return traces
}

export const DomeChart = (props: DomeChartProps) => {
    const { targetView, showMoon, showCurrLoc, times, time, dome } = props
    const context = useStateContext()
    const KG = context.config.keck_geometry[dome]
    const lngLatEl: util.LngLatEl = {
        lng: context.config.keck_longitude,
        lat: context.config.keck_latitude,
        el: context.config.keck_elevation * 1_000 // convert km to meters
    }

    const traces = make_2d_traces(targetView, 
        showMoon, 
        showCurrLoc, 
        times, 
        time, 
        context.config.time_format, 
        KG, lngLatEl)
    const layout: Partial<Plotly.Layout> = {
        width: 900,
        height: 800,
        title: 'Target Trajectories',
        hovermode: "closest",
        polar: {
            radialaxis: {
                showticklabels: true,
                tickmode: "array",
                tickvals: [0, 10, 20, 30, 40, 50, 60, 70, 80, 90],
                ticktext: ['90', '80', '70', '60', '50', '40', '30', '20', '10', '0'],
            },
            angularaxis: {
                showticklabels: true,
                rotation: +90,
                direction: "clockwise"
            },
        },
        margin: {
            l: 40,
            r: 40,
            b: 40,
            t: 40,
            pad: 4
        },
        annotations: [{
            xref: 'paper',
            yref: 'paper',
            x: 0.45,
            xanchor: 'right',
            y: 1,
            yanchor: 'middle',
            text: 'North',
            showarrow: false
        }, {
            xref: 'paper',
            yref: 'paper',
            x: 1,
            xanchor: 'left',
            y: .55,
            yanchor: 'top',
            text: 'East',
            showarrow: false
        }]
    }

    return (
        <Plot
            data={traces}
            layout={layout}
        />
    )
}