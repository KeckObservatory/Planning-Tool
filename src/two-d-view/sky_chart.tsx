import Plot from "./plotly_custom";
import { useEffect, useState } from "react";
import * as util from './sky_view_util.tsx'
import { Dome, TargetView } from "./two_d_view_common.tsx";
import { useStateContext } from "../App";
import { reason_to_color_mapping } from "./target_viz_chart.tsx";
import { DayViz, VizRow } from "./viz_dialog.tsx";
import { LngLatEl } from "../App";
import dayjs from "dayjs";
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'
import { AIRMASS_LIMIT, DEFAULT_OPACITY, NON_OBSERVABLE_OPACITY } from "./constants.tsx";
import { useRef } from "react";
// import { useDebounceCallback } from "../use_debounce_callback.tsx";
dayjs.extend(utc)
dayjs.extend(timezone)

export type SkyChart = "Airmass" | "Elevation" | "Parallactic" | "Lunar Angle" | "Azimuth"

interface Props {
    targetView: TargetView[]
    chartType: SkyChart
    showMoon: boolean
    showSchedule: boolean
    showCurrLoc: boolean
    showLimits: boolean
    times: Date[]
    time: Date
    dome: Dome
    width: number
    height: number
    suncalcTimes: DayViz
}

interface Datum {
    x: Date
    y: number
    text: string
    opacity: string
    marker_color: string
    line_color: string
}

export const generateData = (tgtv: TargetView,
    chartType: SkyChart,
    dtFormat: string,
    lngLatEl: LngLatEl,
    idx: number): Datum[] => {
    let data: Datum[] = []
    const color = util.colors[idx % util.colors.length]
    tgtv.visibility.forEach((viz: VizRow) => {
        let txt = ""
        txt += `Az: ${viz.az.toFixed(2)}<br>`
        txt += `El: ${viz.alt.toFixed(2)}<br>`
        txt += `Airmass: ${viz.air_mass.toFixed(2)}<br>`
        txt += `HT: ${dayjs(viz.datetime).format(dtFormat)}<br>`
        chartType.includes('Lunar Angle') && (txt += `Moon Fraction: ${viz.moon_illumination.fraction.toFixed(2)}<br>`)
        txt += `Visible for: ${tgtv.visibilitySum.toFixed(2)} hours<br>`
        txt += viz.observable ? '' : `<br>Not Observable: ${viz.reasons.join(', ')}`
        txt += tgtv.tags && tgtv.tags.length > 0 ? `<br>Tags:<br>${tgtv.tags.join('<br>')}` : ''
        txt += tgtv.comment ? `<br>Notes: ${tgtv.comment}` : ''
        const datum = viz.moon_position ? util.get_chart_datum(tgtv.ra_deg, tgtv.dec_deg, viz, chartType, lngLatEl) : null
        data.push({
            x: viz.datetime,
            y: datum as number,
            text: txt,
            marker_color: reason_to_color_mapping(viz.reasons),
            line_color: color,
            opacity: viz.observable ? DEFAULT_OPACITY : NON_OBSERVABLE_OPACITY
        })
    })
    return data
}

export const make_trace = (data: Datum[], target_name: string, lineColor?: string): Plotly.Data => {
    //line color is same for all data points
    if (lineColor === undefined && data.length > 0) {
        lineColor = data[0].line_color + data[0].opacity
    }

    const showlegend = data.at(0) ? data[0].opacity === DEFAULT_OPACITY : false
    // Each segment is already split at opacity boundaries (see split_into_segments), so
    // a segment is uniformly observable or not - dot the line wherever it's translucent.
    const dash: Plotly.Dash = data.at(0)?.opacity === DEFAULT_OPACITY ? 'solid' : 'dot'
    const trace: Plotly.Data = {
        x: data.map((datum: Datum) => datum.x),
        y: data.map((datum: Datum) => datum.y),
        text: data.map((datum: Datum) => datum.text),
        hovertemplate: '<b>%{text}</b>', //disable to show xyz coords
        marker: {
            opacity: 0,
            size: 4,
            color: data.map((datum: Datum) => datum.marker_color + datum.opacity),
        },
        line: {
            width: 5,
            color: lineColor,
            dash,
        },
        textposition: 'top left',
        type: 'scatter',
        mode: 'lines+markers',
        showlegend,
        name: target_name
    }
    return trace
}

export const split_into_segments = (data: Datum[]): Array<Datum[]> => {
    if (data.length < 2) { //no data to split
        return [data]
    }
    const segments: Datum[][] = []
    let segment: Datum[] = [data[0]]
    for (let idx = 1; idx < data.length; idx++) {
        const datum = data[idx]
        const prevDatum = data[idx - 1]
        if (datum.opacity === prevDatum.opacity) {
            segment.push(datum)
            continue
        }
        if (datum.opacity === DEFAULT_OPACITY) { //becoming observable: this point is the crossing
            segment.push({ ...datum, opacity: prevDatum.opacity })
            segments.push(segment)
            segment = [datum]
        }
        else { //going non-observable: the previous point is the crossing
            segments.push(segment)
            segment = [{ ...prevDatum, opacity: datum.opacity }, datum]
        }
    }
    segments.push(segment)
    return segments
}

const make_layout = (chartType: SkyChart,
    width: number, height: number,
    shapes: Partial<Plotly.Shape>[],
    maxAirmass: number,
    suncalcTimes: DayViz,
    timezone: string
): [Plotly.Layout, Plotly.LayoutAxis] => {


    //set yRange for airmass charts. order to reverse axis
    const yLower = Math.min(AIRMASS_LIMIT, maxAirmass)
    let yRange = chartType.includes('Airmass') ? [yLower, .9] : undefined
    yRange = chartType.includes("Elevation") ? [0, 90] : yRange

    const y2Axis: Partial<Plotly.LayoutAxis> = {
        title: { text: 'Altitude [deg]' },
        gridwidth: 0,
        overlaying: 'y',
        side: 'right',
        layer: 'above traces',
        autorange: false,
        range: yRange,
    }

    //creates ticvals and ticktext for xaxis. 
    // to take into account timezones HST and UT
    let t0 = suncalcTimes.dusk
    t0.setMinutes(0)
    t0.setSeconds(0)
    t0.setMilliseconds(0)
    const tick0 = t0.getTime()
    const dtick = 2 * 3600000
    const tickVals = [tick0, tick0 + dtick, tick0 + 2 * dtick, tick0 + 3 * dtick, tick0 + 4 * dtick, tick0 + 5 * dtick, tick0 + 6 * dtick, tick0 + 7 * dtick]
    const tickText = tickVals.map((val) => {
        const hst = dayjs(val).tz(timezone).format('HH:mm')
        const ut = dayjs(val).utc().format('HH:mm')
        return `${hst}[HST]<br>${ut}[UT]`
    })

    let ylabel = 'Degrees'
    if(chartType.includes('Airmass')) {
        ylabel = 'Airmass'
    }
    else if (chartType.includes('Lunar Angle')) {
        ylabel = 'Degrees from moon'
    }

    const scyaxis: Partial<Plotly.LayoutAxis> = {
        title: { text: ylabel },
        range: yRange,
    }

    let sclayout: Partial<Plotly.Layout> = {
        width,
        height,
        shapes,
        title: { text: `Target ${chartType} vs Time` },
        hovermode: "closest",
        yaxis: scyaxis,
        xaxis: {
            type: 'date',
            tickfont: {
                size: 8
            },
            tickvals: tickVals,
            ticktext: tickText,
            // dtick: 2 * 3600000, //milliseconds in an hour
            // range: [suncalcTimes.dusk.getTime(), suncalcTimes.dawn.getTime()],
        },
        xaxis2: {
            title: { text: 'UT [Hr:Min]' },
            type: 'date',
            tickformat: '%H:%M',
            dtick: 3600000, //milliseconds in an hour
            range: [suncalcTimes.dusk.getTime(), suncalcTimes.dawn.getTime()],
        },
        margin: {
            l: 40,
            r: 40,
            b: 40,
            t: 40,
            pad: 4
        },
    }

    if (chartType.includes('Airmass')) {
        sclayout.yaxis2 = y2Axis
    }
    return [sclayout as Plotly.Layout, y2Axis as Plotly.LayoutAxis];
}

interface State {
    layout: Plotly.Layout
    y2Axis: Plotly.LayoutAxis
}

export const SkyChart = (props: Props) => {
    const { targetView, chartType, time, showCurrLoc, showLimits, width, height, dome, suncalcTimes, showSchedule } = props

    const context = useStateContext()
    const plotRef = useRef<any>(null);
    //set layout for plotly. need to render after initialization for y2 axis
    const shapes = util.get_shapes(suncalcTimes,
        chartType,
        context.config.tel_geometry[dome],
        false,
        showLimits)

    const [scLayout, y2Axis] = make_layout(chartType, width, height, shapes, 5, suncalcTimes, context.config.timezone);
    const [state, setState] = useState({ layout: scLayout, y2Axis: y2Axis } as State);


    useEffect(() => {

        const fun = async () => {
            let schedShapes: Plotly.Shape[] = []
            if (showSchedule) {
                const telNr = Number(dome.at(dome.length - 1));
                schedShapes = await util.get_schedule_shapes(dayjs(time).format('YYYY-MM-DD'), telNr)
            }
            let shapes = util.get_shapes(suncalcTimes,
                chartType,
                context.config.tel_geometry[dome],
                deckBlocking,
                showLimits)
            shapes = [...shapes, ...schedShapes]
            const [scLayout, y2Axis] = make_layout(chartType, width, height, shapes, maxAirmass, suncalcTimes, context.config.timezone);
            setState({
                layout: scLayout,
                y2Axis,
            });
        }

    fun();
    }, [chartType, dome, targetView, time, showLimits, suncalcTimes, showSchedule, width, height])

    // useEffect(() => {
    //     debounced_elevation_axis_draw();
    // }, [plotRef.current ])

    let traces: Plotly.Data[] = []
    const lngLatEl = context.config.tel_lat_lng_el[dome]
    let deckBlocking = false

    targetView.forEach((tgtv: TargetView, idx: number) => {
        const data = generateData(tgtv,
            chartType, context.config.date_time_format,
            lngLatEl, idx)
        if (tgtv.visibility.find((viz) => viz.reasons.includes('Deck Blocking'))) {
            deckBlocking = true
        }
        const segmentedData = split_into_segments(data)
        let tgtTraces = segmentedData.map(segment => make_trace(segment, tgtv.target_name ?? "Target"))
        tgtTraces = tgtTraces.map((trace, idx) => {//allow only one legend per target
            if (idx > 0) {
                //@ts-ignore
                trace.showLegend = false
            }
            return trace
        })
        traces = [...traces, ...tgtTraces]
    })

    // add elevation axis for airmass charts only
    // if (chartType.includes('Airmass') && targetView.length > 0) {
    //     const data = generateData(targetView[0], 'Elevation', context.config.date_time_format, lngLatEl, 0)
    //     const newTrace = make_trace(data, 'Elevation axis for airmass', '#00000000')
    //     //@ts-ignore
    //     newTrace.yaxis = 'y2'
    //     //@ts-ignore
    //     newTrace.showlegend = false
    //     traces.push(newTrace)
    // }

    //get curr marker
    let maxAirmass = 10;
    let minAirmass = 1;
    if (showCurrLoc) {
        const currLocTraces = util.get_curr_loc_trace(targetView,
            minAirmass, maxAirmass,
            time,
            lngLatEl, chartType, context.config.tel_geometry[dome], context.config.timezone, context.config.date_time_format)
        if (currLocTraces) {
            traces = [...traces, ...currLocTraces]
        }
    }

    // TODO: until y2 axis is working properly, disable for now
    // const debounced_elevation_axis_draw = useDebounceCallback(
    //     () => {
    //         console.log('debounced_elevation_axis_draw called')
    //         if (plotRef.current && chartType.includes('Airmass')) {
    //             // Get the tickvals and ticktext from yaxis
    //             const plotlyFigure = plotRef.current;
    //             const leftTicks = plotlyFigure.props.layout.yaxis.tickvals as number[];

    //             // If not set, try to get from the actual plotly instance
    //             // (Plotly stores the latest tickvals in the fullLayout)
    //             const gd = plotlyFigure?.el;
    //             let otickvals = leftTicks;
    //             if (gd && gd._fullLayout?.yaxis._vals) {
    //                 otickvals = gd._fullLayout.yaxis._vals.map((val: any) => {
    //                     return val.x
    //                 });
    //             }

    //             const tickvals = otickvals.map(val => util.alt_from_air_mass(val));
    //             const ticktext = tickvals.map(val => val.toFixed(1));
    //             // 3. Update yaxis2 to match yaxis
    //             const newY2Axis = {
    //                 ...state.y2Axis,
    //                 tickvals: otickvals,
    //                 ticktext: ticktext,
    //                 position: 0.95, // Adjust position to the right side
    //             };

    //             if (tickvals) {
    //                 // Update the layout directly, otherwise it affects the other chart types for some unknown reason
    //                 console.log('updating y2 axis to', newY2Axis)
    //                 plotlyFigure.props.layout.yaxis2 = newY2Axis; 
    //                 // Also update state so that it is not lost on next re-render
    //                 // setState(
    //                 //     (oldState) => {
    //                 //         return { ...oldState, y2Axis: newY2Axis }
    //                 //     }
    //                 // );
    //             }
    //         }
    //     }
    //     , 100)

    return (
        <Plot
            data={traces}
            ref={plotRef}
            layout={{
                ...state.layout,
            }}
            // config={{
            //     scrollZoom: !chartType.includes('Airmass'),
            //     doubleClick: chartType.includes('Airmass') ? false : 'reset+autosize',
            //     showTips: true,
            //     displayModeBar: true,
            //     modeBarButtonsToRemove: chartType.includes('Airmass') ? ['zoom2d', 'select2d', 'lasso2d', 'zoomIn2d', 'zoomOut2d', 'autoScale2d' ] : []
            // }}
            // onUpdate={debounced_elevation_axis_draw}
            // onInitialized={debounced_elevation_axis_draw}
        />
    )
}