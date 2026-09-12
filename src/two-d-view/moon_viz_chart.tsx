import { DayViz, TargetViz, VizRow } from "./viz_dialog";
import Plot from "./plotly_custom";
import { useStateContext } from "../App";
import dayjs from "dayjs";
import { State } from "../App";
import { cosd, lunar_angle, r2d, sind } from "./sky_view_util";
import { reason_to_color_mapping, create_dawn_dusk_traces, date_normalize } from "./target_viz_chart";
import { DARK_ZENITH_SKY_BRIGHTNESS, EXTINCTION_COEFF, MOON_RADIUS } from "./constants";
import { VizChart } from "../viz_select_menu";

interface Props {
    targetViz: TargetViz
    vizType: VizChart 
}

const rayleigh_scattering = (rho: number) => {
    // Krisciunas and Schaefer 1991 eq 18, 19
    const reyleigh_constant = Math.pow(10, 5.36) // ~2.27e5
    return reyleigh_constant * (1.06 + cosd(rho) ** 2)
}

const mei_scattering = (rho: number) => {
    // Krisciunas and Schaefer 1991 eq 18, 19
    const mei_constant = 6.2e7 //used for small separation angles
    return rho > 10 ? Math.pow(10, 6.15 - rho / 40) : mei_constant / (rho ** 2)
}

const scattering_equation = (rho: number) => {
    // Krisciunas and Schaefer 1991 eq 18, 19
    const meiScattering = mei_scattering(rho)
    const rayleighScattering = rayleigh_scattering(rho)
    const scatter = rayleighScattering + meiScattering
    return scatter 
}

const moon_illuminance = (phase_angle_moon: number) => {
    // Moon magnitude as an equation of phase Allen 1976 p. 144
    const mag = 3.84 + 0.026 * Math.abs(phase_angle_moon) + 4e-9 * (phase_angle_moon ** 4)
    // Krisciunas and Schaefer 1991 eq 20
    return Math.pow(10, -0.4 * mag)
}

const optical_pathlength = (zenith: number) => {
     // Krisciunas and Schaefer 1991 eq 3
     return (1 - 0.96 * sind(zenith) ** 2 ) ** -0.5
}

const differentical_volume_decay = (pathlength: number) => {
    return Math.pow(10, -0.4 * EXTINCTION_COEFF * pathlength)
}

const moon_brightness = (rho: number, zenith_moon: number, zenith_object: number, phase_angle_moon: number) => {
    //Krisciunas and Schaefer 1991 eq 15
    // rho = separation angle [degrees]
    // zenith_moon = 90 - moon_alt [degrees]
    // zenith_object = 90 - object_alt [degrees]
    // phase_angle_moon = moon_phase [degrees]
    const f_rho = scattering_equation(rho)
    const moon_ill = moon_illuminance(phase_angle_moon)
    const pathlength = optical_pathlength(zenith_object)
    const moon_pathlength = optical_pathlength(zenith_moon)
    const dvd_moon = differentical_volume_decay(moon_pathlength)
    const dvd_object = differentical_volume_decay(pathlength)
    const brightness = f_rho * moon_ill * dvd_moon * (1 - dvd_object)
    return brightness 
}

const nighttime_sky_brightness = (zenith_object: number) => {
    // Krisciunas and Schaefer 1991 eq 2
    // dark zenith sky brightness taken from
    //https://www.cfht.hawaii.edu/Instruments/ObservatoryManual/CFHT_ObservatoryManual_(Sec_2).html
    const pathlength = optical_pathlength(zenith_object) 
    const dvd_object = differentical_volume_decay((pathlength-1))
    return DARK_ZENITH_SKY_BRIGHTNESS * dvd_object * pathlength

}

const delta_v_mag = (rho: number, zenith_moon: number, zenith_object: number, phase_angle_moon: number) => {
    // Krisciunas and Schaefer 1991 eq 22
    const B_moon = moon_brightness(rho, zenith_moon, zenith_object, phase_angle_moon)
    const B_0 = nighttime_sky_brightness(zenith_object)
    return -2.5 * Math.log10( ( B_moon + B_0) / B_0 )
}


export const make_contour_plot = (context: State, targetViz: TargetViz, vizChart: VizChart) => {
    let texts: string[] = []
    let y: Date[] = []
    let z: number[] = []
    let x: Date[] = []
    let color: string[] = []
    const lngLatEl = context.config.tel_lat_lng_el[targetViz.dome]
    let units = '[]'
    const reverseAxis = [ 'Moon Brightness', 'Lunar Angle', 'Lunar Phase'].includes(vizChart)
    targetViz.semester_visibility.forEach((dayViz: DayViz) => {
        if (!targetViz.ra_deg || !targetViz.dec_deg) {
            return
        } 
        dayViz.visibility.forEach((viz: VizRow) => {
            const [ ra, dec ]= [targetViz.ra_deg as number, targetViz.dec_deg as number]
            const lunarAngle = lunar_angle(ra, dec, viz.datetime, lngLatEl, viz.moon_position,
            )
            const zenith_moon = 90 - viz.moon_position.altitude
            const zenith_object = 90 - viz.alt
            const phase_angle_moon = r2d(viz.moon_illumination.angle)
            let moonBrightness = delta_v_mag(lunarAngle, zenith_moon, zenith_object, phase_angle_moon)
            const eclipse = lunarAngle < MOON_RADIUS 
            let text = `<b>${targetViz.target_name} ${vizChart}</b><br>` 
            text += `Az: ${viz.az.toFixed(2)}<br>`
            text += `El: ${viz.alt.toFixed(2)}<br>`
            text += `HT: ${dayjs(viz.datetime).format(context.config.date_time_format)}<br>`
            text += `UT: ${dayjs(viz.datetime).utc(false).format(context.config.date_time_format)}<br>`
            text += `Moon Fraction: ${viz.moon_illumination.fraction.toFixed(2)}<br>`
            text += `Lunar Angle: ${lunarAngle.toFixed(2)}<br>`
            text += `Moon brightness: ${moonBrightness.toFixed(2)} [vmag/arcsec^2]<br>`
            text += viz.observable ? '' : `<br>Not Observable: ${viz.reasons.join(', ')}`
            if (eclipse) {
                text+= `<br>Moon Eclipses Target`
            }
            color.push(reason_to_color_mapping(viz.reasons))
            const daytime = date_normalize(viz.datetime)
            let datum: number 
            switch (vizChart) {
                case 'Moon Brightness':
                    datum = moonBrightness
                    units = '[vmag/arcsec^2]'
                    break
                case 'Lunar Angle':
                    datum = lunarAngle
                    units = '[degrees]'
                    break
                case 'Lunar Phase':
                    datum = Math.abs(phase_angle_moon)
                    units = '[|degrees|]'
                    break
                case 'rayleigh_scattering':
                    datum = Math.log10(rayleigh_scattering(lunarAngle))
                    units = "log10"
                    break
                case 'mei_scattering':
                    datum = Math.log10(mei_scattering(lunarAngle))
                    units = "log10"
                    break
                case 'scattering_equation':
                    datum = Math.log10(scattering_equation(lunarAngle))
                    units = "log10"
                    break
                case 'moon_illuminance':
                    datum = moon_illuminance(phase_angle_moon)
                    break
                case 'target_pathlength':
                    datum = optical_pathlength(zenith_object)
                    break
                case 'moon_pathlength':
                    datum = optical_pathlength(zenith_moon)
                    break
                case 'dvd_moon':
                    datum = differentical_volume_decay(optical_pathlength(zenith_moon))
                    break
                case 'dvd_object':
                    datum = differentical_volume_decay(optical_pathlength(zenith_object))
                    break
                default:
                    datum = moonBrightness
                    units = '[vmag/arcsec^2]'
                    break
            }
            y.push(daytime)
            z.push(datum)
            texts.push(text)
        })
        const ydate = new Date(dayjs(dayViz.date).format('YYYY-MM-DD'))
        const xvals = Array.from({ length: dayViz.visibility.length }, () => ydate)
        x = [...x, ...xvals]
    })

    let titleText =  targetViz.target_name ?? 'Target'
    titleText += ` ${vizChart}`
    const trace: Partial<Plotly.PlotData> = {
        x,
        y,
        z,
        text: texts,
        line: {
            smoothing: 0.85
        },
        contours: {
            coloring: 'heatmap',
        },
        colorbar: {
            x: 1.05,
            title: {
                text: units,
            },
        },
        hovertemplate: '<b>%{text}</b> <extra></extra>', //disable to show xyz coords
        textposition: 'top left',
        colorscale: 'Hot',
        reversescale: reverseAxis,
        type: 'contour',
        name: titleText,
        showlegend: false,
    }
    let traces = [trace]

    const lightTraces = Object.values(create_dawn_dusk_traces(targetViz, context.config.date_time_format)) as Plotly.PlotData[]
    //@ts-ignore
    traces = [...traces, ...lightTraces]
    titleText = `<b>${titleText}</b>`

    const layout: Partial<Plotly.Layout> = {
        width: 1200,
        height: 400,
        title: {text: titleText},
        plot_bgcolor: 'black',
        //@ts-ignore
        // coloraxis: {
        //     cmin: 0,
        //     cmax: 30,
        // },
        yaxis2: {
            title: {text: 'Time [UT]'},
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
            title: {text: 'Time [HT]'},
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
            title: {text: 'Date'},
            type: 'date',
            gridwidth: 2,
            gridcolor: 'white',
            layer: 'above traces',
            dtick: 15 * 24 * 60 * 60 * 1000, // milliseconds
            tickformat: '%Y-%m-%d',
            tickmode: 'auto',
            //nticks: 0
        },
        // hovermode: "closest",
    }
    return { traces, layout }
}

export const MoonVizChart = (props: Props) => {

    const context = useStateContext()
    const { traces, layout } = make_contour_plot(context, props.targetViz, props.vizType)


    return (
        <Plot
            data={traces}
            layout={layout}
        ></Plot>
    )
}