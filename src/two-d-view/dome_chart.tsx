import dayjs from "dayjs"
import * as SunCalc from 'suncalc'
import * as util from './sky_view_util.tsx'
import { Dome, TargetView } from "./two_d_view_common.tsx"
import Plot from "./plotly_custom"
import { LngLatEl, GeoModel, useStateContext } from "../App.tsx"
import { reason_to_color_mapping } from "./target_viz_chart.tsx"
import { VizRow } from "./viz_dialog.tsx"

const traceRadiusLimit = 90 - 2 //ignore points greater than the dome radius

interface DomeChartProps {
    targetView: TargetView[]
    showMoon: boolean
    showCurrLoc: boolean
    times: Date[]
    time: Date
    dome: Dome
    width: number
    height: number
}

export const moon_color = '#702963'

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
        showlegend: false,
        name: 'telescope bottom limit',
        hoverinfo: "none",
        hovermode: false,
    }
    return pTrace
}

const make_2d_traces = (targetView: TargetView[], showMoon: boolean, showCurrLoc: boolean, times: Date[], time: Date,
    time_format: string, geoModel: GeoModel, lngLatEl: LngLatEl
) => {

    //target trajectory traces
    let traces: Partial<Plotly.Data>[] = []
    targetView.forEach((tgtv: TargetView, idx: number) => {
        let [rr, tt] = [[] as (number | null)[], [] as (number | null)[]]
        const texts: string[] = []
        let color: string[] = []
        let gapInserted = false // avoid drawing a straight line across the dome when a target dips below the horizon
        tgtv.visibility.forEach((viz: VizRow) => {
            let txt = ""
            txt += `Az: ${viz.az.toFixed(2)}<br>`
            txt += `El: ${viz.alt.toFixed(2)}<br>`
            txt += `Airmass: ${viz.air_mass.toFixed(2)}<br>`
            txt += `HT: ${dayjs(viz.datetime).format(time_format)}<br>`
            txt += `Visible for: ${tgtv.visibilitySum.toFixed(2)} hours<br>`
            txt += viz.observable ? '' : `<br>Not Observable: ${viz.reasons.join(', ')}`
            const radius = 90 - viz.alt
            if (radius > traceRadiusLimit + 1) { //ignore points greater than the radius
                if (!gapInserted) {
                    rr.push(null)
                    tt.push(null)
                    texts.push('')
                    color.push('')
                    gapInserted = true
                }
                return
            }
            gapInserted = false
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
                color: util.colors[idx % util.colors.length],
                opacity: 0,
                size: 4
            },
            line: {
                color: util.colors[idx % util.colors.length],
                width: 5
            },
            textposition: 'top left',
            type: 'scatterpolar',
            mode: 'lines+markers',
            connectgaps: false,
            namelength: -1,
            name: tgtv.target_name
        }
        traces.push(trace as Plotly.Data)
    })

    //moon trajectory trace
    if (showMoon) {
        let [rr, tt] = [[] as number[], [] as number[]]
        const texts: string[] = []
        times.forEach((time: Date, idx: number) => {
            const moon_position = util.get_moon_position(time, lngLatEl)
            const moonFraction = SunCalc.getMoonIllumination(time).fraction
            const r = 90 - moon_position.altitude 
            if (r <= traceRadiusLimit + 1) { //can be more tolerant than markers
                rr.push(r)
                tt.push(moon_position.azimuth)
                let txt = ""
                txt += `Az: ${moon_position.azimuth.toFixed(2)}<br>`
                txt += `El: ${moon_position.altitude.toFixed(2)}<br>`
                txt += `Moon Fraction: ${(100 * moonFraction).toFixed(2)} %<br>`
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
            color: moon_color,
            hovertemplate: '<b>%{text}</b>', //disable to show xyz coords
            line: {
                color: moon_color,
                width: 5
            },
            textposition: 'top left',
            type: 'scatterpolar',
            mode: 'markers',
            namelength: -1,
            name: 'Moon'
        }
        traces.push(moonTrace as Plotly.Data)

        if (showCurrLoc) {
            const moon_position = util.get_moon_position(time, lngLatEl)
            const moonFraction = SunCalc.getMoonIllumination(time).fraction
            const r = 90 - moon_position.altitude 
            let txt = ""
            txt += `Az: ${moon_position.azimuth.toFixed(2)}<br>`
            txt += `El: ${moon_position.altitude.toFixed(2)}<br>`
            txt += `Moon Fraction: ${(100 * moonFraction).toFixed(2)} %<br>`
            txt += `HT: ${dayjs(time).format(time_format)}`
            const moonMarkerTrace = {
                r: [r],
                theta: [moon_position.azimuth],
                text: r <= geoModel.trackLimit ? [txt] : [],
                hovorinfo: 'text',
                showlegend: false,
                hovertemplate: '<b>%{text}</b>', //disable to show xyz coords
                color: "rgb(0,0,0)",
                textposition: 'top left',
                type: 'scatterpolar',
                mode: 'markers',
                marker: {
                    size: 12,
                    color: moon_color,
                    line: {
                        color: 'black',
                        width: 2
                    }
                },
                namelength: -1,
                name: 'Current Moon Location'
            }

            if (r < traceRadiusLimit) {
                traces.push(moonMarkerTrace as Plotly.Data)
            }
        }
    }


    if (showCurrLoc) {

        //target current location traces
        targetView.forEach((tgtv: TargetView, idx: number) => { //add current location trace
            let [rr, tt] = [[] as number[], [] as number[]]
            let texts: string[] = []
            const ra = tgtv.ra_deg as number
            const dec = tgtv.dec_deg as number
            const azEl = util.get_target_traj(ra, dec, [time], lngLatEl) as [number, number][]
            const r = 90 - azEl[0][1]
            if (r <= traceRadiusLimit) {
                rr.push(r)
                tt.push(azEl[0][0])
                let txt = ""
                txt += `Az: ${azEl[0][0].toFixed(2)}<br>`
                txt += `El: ${azEl[0][1].toFixed(2)}<br>`
                txt += `Airmass: ${util.air_mass(azEl[0][1], lngLatEl.el).toFixed(2)}<br>`
                // txt += `Airmass: ${util.air_mass(azEl[0][1]).toFixed(2)}<br>`
                txt += `HT: ${dayjs(time).format(time_format)}`
                texts.push(txt)
            }

            const trace = {
                r: rr,
                theta: tt,
                text: texts,
                hovorinfo: 'text',
                showlegend: false,
                hovertemplate: '<b>%{text}</b>', //disable to show xyz coords
                color: util.colors[idx % util.colors.length],
                textposition: 'top left',
                type: 'scatterpolar',
                mode: 'markers',
                marker: {
                    size: 12,
                    color: util.colors[idx % util.colors.length],
                    line: {
                        color: 'black',
                        width: 2
                    }
                },
                namelength: -1,
                name: 'Current location'
            }
            traces.push(trace as Plotly.Data)
        })
    }

    //add dome shapes
    const r0 = 90 - geoModel.r0
    const r1 = 90 - geoModel.r1
    const t0 = geoModel.t0
    const t1 = geoModel.t1
    const r2 = 90 - geoModel.r2
    const r3 = 90 - geoModel.r3
    const t2 = geoModel.t2
    const t3 = geoModel.t3
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
    const { targetView, showMoon, showCurrLoc, times, time, dome, width, height } = props
    const context = useStateContext()
    const geoModel = context.config.tel_geometry[dome]
    const lngLatEl = context.config.tel_lat_lng_el[dome]

    const traces = make_2d_traces(targetView,
        showMoon,
        showCurrLoc,
        times,
        time,
        context.config.time_format,
        geoModel, lngLatEl)
    const layout: Partial<Plotly.Layout> = {
        width,
        height,
        title: {text: 'Target Trajectories'},
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
                direction: "counterclockwise"
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
            x: 0,
            xanchor: 'right',
            y: .55,
            yanchor: 'top',
            text: 'East',
            showarrow: false
        }]
    }

    return (
        <>
            <Plot
                data={traces}
                layout={layout}
            />

        </>
    )
}