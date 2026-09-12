import { useStateContext } from "../App";
import {
    MARKER_SIZE,
    XAXIS_DTICK,
    MOON_MARKER_LINE_WIDTH,
    MOON_MARKER_SIZE
} from "./constants";
import Plot from "./plotly_custom";
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'
import { DayViz, TargetViz, VizRow } from "./viz_dialog";
import { air_mass } from "./sky_view_util";
dayjs.extend(utc)
dayjs.extend(timezone)


interface Props {
    targetViz: TargetViz,
}

export const date_normalize = (date: Date, utctz = false) => {
    //if date is before semester date set to next day
    let out = dayjs(date).set('year', 2000).set('month', 0).set('date', 1)
    out = out.get('hours') < 12 ? out.add(1, 'day') : out
    if (utctz) {
        return out.utc(true).toDate()
    }
    return out.toDate()
}

const colors = {
    'Deck Blocking': '#7570b3',
    'Below Horizon': '#e7298a',
    'Above Tracking Limits': '#d95f02'
}

const OBSERVABLE_COLOR = '#1b9e77'

export const reason_to_color_mapping = (reasons: string[]) => {
    const cols = reasons.map((reason: string) => colors[reason as keyof typeof colors])
    return cols.length ? cols[0] : OBSERVABLE_COLOR
}

// The per-point marker colors above are categorical, not a continuous scale, so a
// legend (built from zero-data "swatch" traces, one per color/reason) explains them
// better than a Plotly colorbar - each trace exists only to add one legend entry.
const create_color_legend_traces = (): Partial<Plotly.PlotData>[] => {
    const entries: [string, string][] = [['Observable', OBSERVABLE_COLOR], ...Object.entries(colors)]
    return entries.map(([label, color]) => ({
        x: [null],
        y: [null],
        mode: 'markers',
        type: 'scatter',
        marker: {
            color,
            size: MARKER_SIZE,
            symbol: 'square',
        },
        name: label,
        showlegend: true,
        hoverinfo: 'skip',
    }))
}

const create_dawn_dusk_text = (date: Date, date_time_format: string) => {
    let txt = ""
    txt += "HT: " + dayjs(date).format(date_time_format) + "<br>"
    txt += "UT: " + dayjs(date).utc(false).format(date_time_format)
    return txt
}

export const get_browser_name = () => {
    const userAgent = navigator.userAgent;

    if (userAgent.includes("Chrome")) {
        return "Chrome";
    } else if (userAgent.includes("Firefox")) {
        return "Firefox";
    } else if (userAgent.includes("Safari") && !userAgent.includes("Chrome")) {
        return "Safari";
    } else if (userAgent.includes("Edg")) {
        return "Microsoft Edge";
    } else if (userAgent.includes("Opera") || userAgent.includes("Opr")) {
        return "Opera";
    } else {
        return "Unknown Browser";
    }
}


export const create_dawn_dusk_traces = (targetViz: TargetViz, date_time_format: string) => {

    const browserName = get_browser_name();
    // scattergl is a hack which is needed to overlap markers
    // Safari disables WebGL by default, so just let it be scatter.
    const chart_type = browserName === "Safari" ? 'scatter' : 'scattergl'
    const trace = {
        yaxis: 'y2',
        textposition: 'top left',
        mode: 'lines+markers',
        showlegend: false,
        type: chart_type,
        marker: {
            size: MOON_MARKER_SIZE,
            symbol: 'square',
        },
        line: {
            width: MOON_MARKER_LINE_WIDTH
        }
    }
    let dawn_dusk_traces: { [key: string]: any } = {
        dusk: {
            ...trace,
            x: [],
            y: [],
            text: [],
            name: 'Dusk (0-6 deg)',
            marker: {
                ...trace.marker,
                color: '#eeeeee',
            },
            line: {
                ...trace.line,
                color: '#eeeeee',
            }
        },
        nautical_dusk: {
            ...trace,
            x: [],
            y: [],
            text: [],
            name: 'Nautical Dusk (6-12 deg)',
            marker: {
                ...trace.marker,
                color: '#dddddd',
            },
            line: {
                ...trace.line,
                color: '#dddddd',
            }
        },
        astronomical_dusk: {
            ...trace,
            x: [],
            y: [],
            text: [],
            name: 'Astronomical Dusk (12-18 deg)',
            marker: {
                ...trace.marker,
                color: '#cccccc',
            },
            line: {
                ...trace.line,
                color: '#cccccc',
            }
        },
        astronomical_dawn: {
            ...trace,
            x: [],
            y: [],
            text: [],
            name: 'Astronomical Dawn (12-18 deg)',
            marker: {
                ...trace.marker,
                color: '#cccccc',
            },
            line: {
                ...trace.line,
                color: '#cccccc',
            }
        },
        nautical_dawn: {
            ...trace,
            x: [],
            y: [],
            text: [],
            name: 'Nautical Dawn (6-12 deg)',
            marker: {
                ...trace.marker,
                color: '#dddddd',
            },
            line: {
                ...trace.line,
                color: '#dddddd',
            }
        },
        dawn: {
            ...trace,
            x: [],
            y: [],
            text: [],
            name: 'Dawn (0-6 deg)',
            marker: {
                ...trace.marker,
                color: '#eeeeee',
            },
            line: {
                ...trace.line,
                color: '#eeeeee',
            }
        }
    }

    targetViz.semester_visibility.forEach((dayViz: DayViz) => {
        const xdate = new Date(dayjs(dayViz.date).format('YYYY-MM-DD'))
        dawn_dusk_traces.nautical_dawn.x.push(xdate)
        dawn_dusk_traces.nautical_dusk.x.push(xdate)
        dawn_dusk_traces.dawn.x.push(xdate)
        dawn_dusk_traces.dusk.x.push(xdate)
        dawn_dusk_traces.astronomical_dawn.x.push(xdate)
        dawn_dusk_traces.astronomical_dusk.x.push(xdate)

        dawn_dusk_traces.nautical_dawn.y.push(date_normalize(dayViz.nauticalDawn, true))
        dawn_dusk_traces.nautical_dusk.y.push(date_normalize(dayViz.nauticalDusk, true))
        dawn_dusk_traces.dawn.y.push(date_normalize(dayViz.dawn, true))
        dawn_dusk_traces.dusk.y.push(date_normalize(dayViz.dusk, true))
        dawn_dusk_traces.astronomical_dawn.y.push(date_normalize(dayViz.astronomicalDawn, true))
        dawn_dusk_traces.astronomical_dusk.y.push(date_normalize(dayViz.astronomicalDusk, true))

        dawn_dusk_traces.nautical_dawn.text.push(create_dawn_dusk_text(dayViz.nauticalDawn, date_time_format))
        dawn_dusk_traces.nautical_dusk.text.push(create_dawn_dusk_text(dayViz.nauticalDusk, date_time_format))
        dawn_dusk_traces.dawn.text.push(create_dawn_dusk_text(dayViz.dawn, date_time_format))
        dawn_dusk_traces.dusk.text.push(create_dawn_dusk_text(dayViz.dusk, date_time_format))
        dawn_dusk_traces.astronomical_dawn.text.push(create_dawn_dusk_text(dayViz.astronomicalDawn, date_time_format))
        dawn_dusk_traces.astronomical_dusk.text.push(create_dawn_dusk_text(dayViz.astronomicalDusk, date_time_format))
    })
    return dawn_dusk_traces
}

export const TargetVizChart = (props: Props) => {
    const { targetViz } = props
    console.log('TargetVizChart', targetViz)
    const context = useStateContext()
    let traces = targetViz.semester_visibility.map((dayViz: DayViz) => {
        let texts: string[] = []
        let y: Date[] = []
        let color: string[] = []
        //let color: number[] = []
        dayViz.visibility.forEach((viz: VizRow) => {
            let text = `<b>${targetViz.target_name} Visibility</b><br>` 
            text += `Az: ${viz.az.toFixed(2)}<br>`
            text += `El: ${viz.alt.toFixed(2)}<br>`
            text += `Airmass: ${air_mass(viz.alt, context.config.tel_lat_lng_el[targetViz.dome].el).toFixed(2)}<br>`
            // text += `Airmass: ${air_mass(viz.alt).toFixed(2)}<br>`
            text += `HT: ${dayjs(viz.datetime).format(context.config.date_time_format)}<br>`
            text += `UT: ${dayjs(viz.datetime).utc(false).format(context.config.date_time_format)}<br>`
            text += `Moon Fraction: ${viz.moon_illumination.fraction.toFixed(2)}<br>`
            text += `Visible for: ${dayViz.visible_hours.toFixed(2)} hours<br>`
            text += viz.observable ? '' : `<br>Not Observable: ${viz.reasons.join(', ')}`


            color.push(reason_to_color_mapping(viz.reasons))
            const daytime = date_normalize(viz.datetime)
            y.push(daytime)
            texts.push(text)
        })
        const ydate = new Date(dayjs(dayViz.date).format('YYYY-MM-DD'))
        const x = Array.from({ length: y.length }, () => ydate)

        const trace: Partial<Plotly.PlotData> = {
            x,
            y,
            text: texts,
            marker: {
                color,
                size: MARKER_SIZE,
                symbol: 'square',
                opacity: 1 // too dense to see ticks
            },
            hovertemplate: '<b>%{text}</b> <extra></extra>', //disable to show xyz coords
            line: {
                width: 0,
            },
            textposition: 'top left',
            type: 'scattergl',
            mode: 'lines+markers',
            showlegend: false,
            name: targetViz.target_name ?? 'Target'
        }
        return trace
    })

    const lightTraces = Object.values(create_dawn_dusk_traces(targetViz, context.config.date_time_format)) as Plotly.PlotData[]
    const legendTraces = create_color_legend_traces()
    //@ts-ignore
    traces = [...traces, ...lightTraces, ...legendTraces]
    let titleText = targetViz.target_name ?? 'Target' 
    titleText += ' Visibility'
    titleText = `<b>${titleText}</b>`

    const layout: Partial<Plotly.Layout> = {
        width: 1200,
        height: 400,
        title: { text: titleText },
        plot_bgcolor: 'black',
        // Sits just outside the plot area (Plotly's own default position is close to
        // this already) but nudged up so it clears the plot instead of overlapping it.
        legend: {
            x: 1.02,
            y: 1.2,
            xanchor: 'left',
            yanchor: 'top',
        },
        yaxis2: {
            title: { text: 'Time [UT]' },
            type: 'date',
            gridwidth: 0,
            overlaying: 'y',
            // scaleanchor: 'y',
            side: 'right',
            layer: 'above traces',
            autorange: 'reversed',
            // tickmode: 'auto',
            tickformat: '%H:%M',
        },
        yaxis: {
            title: { text: 'Time [HT]' },
            type: 'date',
            gridwidth: 2,
            gridcolor: 'white',
            // scaleanchor: 'y2',
            autorange: 'reversed',
            layer: 'above traces',
            // tickmode: 'auto',
            tickformat: '%H:%M',
        },
        xaxis: {
            title: { text: 'Date' },
            type: 'date',
            gridwidth: 2,
            gridcolor: 'white',
            layer: 'above traces',
            dtick: XAXIS_DTICK,
            tickformat: '%Y-%m-%d',
            tickmode: 'auto',
            //nticks: 0
        },
        // hovermode: "closest",
    }

    return (
        <Plot
            data={traces}
            divId='target-viz-chart'
            layout={layout}
        />
    )
}