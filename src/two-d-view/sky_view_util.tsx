import dayjs from 'dayjs'
import * as SunCalc from 'suncalc'
import { DayViz, VizRow } from './viz_dialog'
import {
    RADIUS_EARTH,
    ATMOSPHERE_HEIGHT,
    ROUND_MINUTES,
    STEP_SIZE,
    TIMES_START,
    TIMES_END,
    LASER_LIMIT
} from './constants'
import { AMATEUR_TWILIGHT_SHADE, ASTRONOMICAL_TWILIGHT_SHADE, TWILIGHT_SHADE, CROSSING_TOLERANCE_MS } from "./constants.tsx";
import { GeoModel, LngLatEl } from '../App'
import { SkyChart } from './sky_chart';
import { alt_az_observable } from './two_d_view_common.tsx';
import { hidate, TargetView } from './two_d_view_common.tsx';
import { get_schedule } from '../api/api_root.tsx';

export const colors = [
    '#1f77b4',  // muted blue
    '#ff7f0e',  // safety orange
    '#2ca02c',  // cooked asparagus green
    '#d62728',  // brick 
    '#9467bd',  // muted purple
    '#8c564b',  // chestnut brown
    '#e377c2',  // raspberry yogurt pink
    '#7f7f7f',  // middle gray
    '#bcbd22',  // curry yellow-green
    '#17becf'   // blue-teal
];


export const date_to_juld = (date: Date) => {
    return (date.getTime() / 86400000) + 2440587.5 //do not offset
}

export const get_gmt = (date?: Date) => {
    //NOTE: This uses the 2000.00 equinox. This is the same as the GMST at 0h UT on 1 January 2000
    if (!date) date = new Date()
    const JD = date_to_juld(date)
    const T = (JD - 2451545) / 36525;
    let ThetaGMST = 67310.54841 + (876600 * 3600 + 8640184.812866) * T
        + .093104 * (T ** 2) - (6.2 * 10 ** -6) * (T ** 3)
    ThetaGMST = (ThetaGMST % (86400 * (ThetaGMST / Math.abs(ThetaGMST))) / 240) % 360
    return ThetaGMST
}

export const ra_dec_to_deg = (time: string, dec = false) => {
    let [hours, min, sec] = time.split(':')
    let deg
    if (dec) {
        let sign = 1
        if (hours[0] === '+') hours = hours.substring(1);
        if (hours[0] === '-') {
            hours = hours.substring(1);
            sign = -1;
        }
        deg = sign * (parseFloat(hours) // dec is already in degrees
            + parseFloat(min) / 60
            + parseFloat(sec) / 60 ** 2)
    }

    else {
        deg = 15 * parseFloat(hours) // convert hours to deg
            + 15 * parseFloat(min) / 60
            + 15 * parseFloat(sec) / 60 ** 2
    }
    return deg
}

export const d2r = (deg: number) => {
    return deg * Math.PI / 180
}

export const r2d = (rad: number) => {
    return rad / d2r(1)
}

export const cosd = (deg: number): number => {
    return Math.cos(d2r(deg))
}

export const sind = (deg: number): number => {
    return Math.sin(d2r(deg))
}

export const tand = (deg: number): number => {
    return Math.tan(d2r(deg))
}

export const ra_dec_to_az_alt = (ra: number, dec: number, date: Date, lngLatEl: LngLatEl): [number, number] => {
    /* Taken from Jean Meeus's Astronomical Algorithms textbook. Using equations
    13.5 & 13.6*/
    const hourAngle = (get_gmt(date) + lngLatEl.lng - ra) % 360
    const tanAzNum = sind(hourAngle)
    const tanAzDen = cosd(hourAngle) * sind(lngLatEl.lat) - tand(dec) * cosd(lngLatEl.lat)
    const az = Math.atan2(tanAzNum, tanAzDen) + Math.PI //radians (if reckoning from the north, subtract pi)
    // const az = Math.atan(tanAzNum/tanAzDen) //radians
    const sinEl = sind(lngLatEl.lat) * sind(dec) + cosd(lngLatEl.lat) * cosd(dec) * cosd(hourAngle)
    const el = Math.asin(sinEl) // radians
    return [r2d(az), r2d(el)]
}

export const add_hours = (date: Date, hours: number): Date => {
    const newDate = new Date(date.getTime())
    newDate.setTime(date.getTime() + hours * 3600000)
    return newDate
}

export const get_suncalc_times = (lngLatEl: LngLatEl, date?: Date) => {
    if (!date) {
        date = new Date()
    }
    SunCalc.addTime(-6, 'civilDawn', 'civilDusk')
    SunCalc.addTime(-12, 'amateurDawn', 'amateurDusk')
    SunCalc.addTime(-18, 'astronomicalDawn', 'astronomicalDusk')
    let times = SunCalc.getTimes(date, lngLatEl.lat, lngLatEl.lng) as DayViz
    if (date < times.sunrise) { // sun has not risen yet. use yesterday.
        const yesterday = dayjs(date).add(-1, 'day').toDate()
        times = SunCalc.getTimes(yesterday, lngLatEl.lat, lngLatEl.lng) as DayViz
    }
    const nextday = dayjs(date).add(1, 'day').toDate() //be careful not to mutate date
    let nextdaytimes = SunCalc.getTimes(nextday, lngLatEl.lat, lngLatEl.lng) as DayViz
    times.sunrise = nextdaytimes.sunrise
    times.sunriseEnd = nextdaytimes.sunriseEnd

    times.civilDawn = nextdaytimes.civilDawn
    times.amateurDawn = nextdaytimes.amateurDawn
    times.astronomicalDawn = nextdaytimes.astronomicalDawn
    times.nauticalDawn = nextdaytimes.nauticalDawn
    times.nadir = nextdaytimes.nadir
    times.nightEnd = nextdaytimes.nightEnd
    times.dawn = nextdaytimes.dawn
    times.goldenHourEnd = nextdaytimes.goldenHourEnd
    return times
}

export const round_date = (minutes: number, date: Date) => {
    const coeff = 1000 * 60 * minutes;
    return new Date(Math.round(date.getTime() / coeff) * coeff)
}

const round_date_up = (date: Date, minutes: number) => {
    const coeff = 1000 * 60 * minutes
    return new Date(Math.ceil(date.getTime() / coeff) * coeff)
}

const round_date_down = (date: Date, minutes: number) => {
    const coeff = 1000 * 60 * minutes
    return new Date(Math.floor(date.getTime() / coeff) * coeff)
}

export const get_day_times = (startDateTime: Date, endDateTime: Date, stepSize = STEP_SIZE) => {
    //Used for viz chart
    const start = round_date_up(startDateTime, stepSize)
    const end = round_date_down(endDateTime, stepSize)
    const nLen = Math.round((end.getTime() - start.getTime()) / (stepSize * 60 * 1000))
    let times = Array.from({ length: nLen }, (_, idx) => new Date(start.getTime() + stepSize * 60 * 1000 * idx))
    return [start, ...times, end] //and start and end
}

export const get_times_using_nadir = (nadir: Date, roundMin = ROUND_MINUTES, stepSize = STEP_SIZE) => {
    const nLen = Math.round((TIMES_END - TIMES_START) / stepSize)
    const deltaNadir = Array.from({ length: nLen }, (_, idx) => TIMES_START + stepSize * idx)
    const roundedNadir = round_date(roundMin, nadir)
    return deltaNadir.map((hour: number) => {
        return add_hours(roundedNadir, hour)
    })
}


export const get_target_traj = (ra: number, dec: number, times: Date[], lngLatEl: LngLatEl): [number, number][] => {
    let traj: [number, number][] = []
    times.forEach((d: Date) => {
        traj.push(ra_dec_to_az_alt(ra, dec, d, lngLatEl))
    })
    return traj
}

export function alt_from_air_mass(am: number): number;
export function alt_from_air_mass(am: number, el: number): number;
export function alt_from_air_mass(am: number, el?: number) {
    if (el === undefined) {
        return 90 - r2d(Math.acos(1 / am))
    }
    const a = RADIUS_EARTH + el
    const b = ATMOSPHERE_HEIGHT + RADIUS_EARTH
    const s = am * ATMOSPHERE_HEIGHT
    const zenith = r2d(Math.acos((a * a + s * s - b * b) / (2 * a * s)))
    return 90 - zenith
}

export function air_mass(alt: number): number; //secant formula
export function air_mass(alt: number, el: number): number; // Homogeneous spherical atmosphsere with elevated observer
export function air_mass(alt: number, el?: number) {
    if (el === undefined) {
        const zenith = 90 + alt
        return 1 / cosd(zenith)
    }
    const y = el / ATMOSPHERE_HEIGHT
    const z = RADIUS_EARTH / ATMOSPHERE_HEIGHT
    const a2 = ATMOSPHERE_HEIGHT * ATMOSPHERE_HEIGHT
    const r = RADIUS_EARTH + el
    const g = ATMOSPHERE_HEIGHT - el
    const zenith = 90 - alt
    const firstTerm = (r * r) * cosd(zenith) * cosd(zenith) / (a2)
    const secondTerm = 2 * RADIUS_EARTH * (g) / a2
    const thirdTerm = y * y
    const forthTerm = (y + z) * cosd(zenith)
    const X = Math.sqrt(firstTerm + secondTerm - thirdTerm + 1) - forthTerm
    return X
}


export const get_air_mass = (ra: number, dec: number, times: Date[], lngLatEl: LngLatEl) => {
    const azAlt = get_target_traj(ra, dec, times, lngLatEl)
    const airmass = azAlt.map((a: [number, number]) => { return air_mass(a[1], lngLatEl.el) })
    // const airmass = azAlt.map((a: [number, number]) => { return air_mass(a[1]) })
    return airmass
}

export const parallatic_angle = (ra: number, dec: number, date: Date, lngLatEl: LngLatEl) => {
    const hourAngle = (get_gmt(date) + lngLatEl.lng - ra) % 360
    const numerator = sind(hourAngle)
    const denominator: number = tand(lngLatEl.lat)
        * cosd(dec)
        - sind(dec) * cosd(hourAngle)
    return r2d(Math.atan2(numerator, denominator))
}

export const get_parallactic_angle = (ra: number, dec: number, times: Date[], lngLatEl: LngLatEl): number[] => {
    let ang: number[] = []
    times.forEach((date: Date) => {
        ang.push(parallatic_angle(ra, dec, date, lngLatEl))
    })
    return ang
}

const angular_separation = (lon1: number, lat1: number, lon2: number, lat2: number): number => {
    //Vincenty formula
    const sdlon = sind(lon2 - lon1)
    const cdlon = cosd(lon2 - lon1)
    const slat1 = sind(lat1)
    const slat2 = sind(lat2)
    const clat1 = cosd(lat1)
    const clat2 = cosd(lat2)

    const numerator1 = clat2 * sdlon
    const numerator2 = clat1 * slat2 - slat1 * clat2 * cdlon
    const denominator = slat1 * slat2 + clat1 * clat2 * cdlon
    const numerator = Math.sqrt(numerator1 ** 2 + numerator2 ** 2)
    //return Math.atan(numerator/denominator) * 180 / Math.PI
    return r2d(Math.atan2(numerator, denominator))
}

export const add_pi = (angle: number) => {
    return angle + Math.PI
}

export const get_moon_position = (date: Date, lngLatEl: LngLatEl) => {
    // convert azel to degrees and set az coordinate such that 0 is north
    let moon_position = SunCalc.getMoonPosition(date, lngLatEl.lat, lngLatEl.lng)
    moon_position.azimuth = r2d(add_pi(moon_position.azimuth))
    moon_position.altitude = r2d(moon_position.altitude)
    return moon_position
}

export const lunar_angle = (ra: number,
    dec: number, date: Date,
    lngLatEl: LngLatEl,
    mp: SunCalc.GetMoonPositionResult) => {
    const [az, alt] = ra_dec_to_az_alt(ra, dec, date, lngLatEl)
    const angle = angular_separation(az, alt, mp.azimuth, mp.altitude)
    return angle
}


export const make_viz_row = (
    ra: number,
    dec: number,
    datetime: Date,
    lngLatEl: LngLatEl,
    geoModel: GeoModel): VizRow => {
    const [az, alt] = ra_dec_to_az_alt(ra, dec, datetime, lngLatEl)
    return {
        az,
        alt,
        ...alt_az_observable(alt, az, geoModel),
        datetime,
        air_mass: air_mass(alt, lngLatEl.el),
        moon_illumination: SunCalc.getMoonIllumination(datetime),
        moon_position: get_moon_position(datetime, lngLatEl)
    }
}

// Compute when the ra/dec crosses the nasmyth/shutter.
// Given two times, bisect until the crossing is found within
// a tolerance. 
const bisect_alt_crossing = (
    ra: number,
    dec: number,
    limit: number,
    aboveTime: Date,
    belowTime: Date,
    lngLatEl: LngLatEl): Date => {
    let above = aboveTime.getTime()
    let below = belowTime.getTime()
    while (Math.abs(above - below) > CROSSING_TOLERANCE_MS) {
        const mid = Math.round((above + below) / 2)
        const [, alt] = ra_dec_to_az_alt(ra, dec, new Date(mid), lngLatEl)
        if (alt >= limit) above = mid
        else below = mid
    }
    return new Date(above)
}

interface AltCrossing {
    row: VizRow
    rising: boolean
}

const find_alt_crossing = (
    ra: number,
    dec: number,
    limit: number,
    prev: VizRow,
    curr: VizRow,
    lngLatEl: LngLatEl,
    geoModel: GeoModel): AltCrossing | undefined => {
    const prevAbove = prev.alt >= limit
    const currAbove = curr.alt >= limit
    if (prevAbove === currAbove) return undefined //no crossing in this step
    const [aboveTime, belowTime] = prevAbove
        ? [prev.datetime, curr.datetime]
        : [curr.datetime, prev.datetime]
    const datetime = bisect_alt_crossing(ra, dec, limit, aboveTime, belowTime, lngLatEl)
    return { row: make_viz_row(ra, dec, datetime, lngLatEl, geoModel), rising: currAbove }
}

export const add_limit_crossings = (
    ra: number,
    dec: number,
    visibility: VizRow[],
    lngLatEl: LngLatEl,
    geoModel: GeoModel): VizRow[] => {
    if (visibility.length < 2) return visibility

    const crossings: VizRow[] = []
    let firstRise: Date | undefined
    let lastSet: Date | undefined

    for (let idx = 1; idx < visibility.length; idx++) {
        const prev = visibility[idx - 1]
        const curr = visibility[idx]

        const shutter = find_alt_crossing(ra, dec, geoModel.r1, prev, curr, lngLatEl, geoModel)
        if (shutter) {
            crossings.push(shutter.row)
            if (shutter.rising && !firstRise) firstRise = shutter.row.datetime
            if (!shutter.rising) lastSet = shutter.row.datetime
        }

        const nasmyth = find_alt_crossing(ra, dec, geoModel.r3, prev, curr, lngLatEl, geoModel)
        if (nasmyth && nasmyth.row.az >= geoModel.t2 && nasmyth.row.az <= geoModel.t3) {
            crossings.push(nasmyth.row)
        }
    }

    if (crossings.length === 0) return visibility

    const merged = [...visibility, ...crossings]
        .sort((a, b) => a.datetime.getTime() - b.datetime.getTime())

    // Only trim a side that actually starts (or ends) below the shutter - a target already up
    // at dusk, or still up at dawn, keeps the full window on that side.
    const startsBelow = visibility[0].alt < geoModel.r1
    const endsBelow = visibility[visibility.length - 1].alt < geoModel.r1
    const start = startsBelow && firstRise ? firstRise.getTime() : -Infinity
    const end = endsBelow && lastSet ? lastSet.getTime() : Infinity
    return merged.filter((viz) => {
        const t = viz.datetime.getTime()
        return t >= start && t <= end
    })
}

export const sum_observable_hours = (visibility: VizRow[]): number => {
    let hours = 0
    for (let idx = 1; idx < visibility.length; idx++) {
        const prev = visibility[idx - 1]
        const curr = visibility[idx]
        const observableEnds = (prev.observable ? 1 : 0) + (curr.observable ? 1 : 0)
        if (observableEnds === 0) continue
        const gap = (curr.datetime.getTime() - prev.datetime.getTime()) / 3600000
        hours += gap * observableEnds / 2
    }
    return hours
}

export const get_schedule_shapes = async (date: string, dome: number) => {
    const schedule_data = await get_schedule(date, dome)
    const shapes = schedule_data.map((sched) => {

        const startTimeUT = dayjs(sched.Date + 'T' + sched.StartTime).toDate().getTime()
        // const endTimeUT = dayjs(sched.Date + 'T' + sched.EndTime).toDate().getTime()

        const startTime = startTimeUT - 10 * 3600000 //HT to UT
        // const endTime = endTimeUT + 0 * 10 * 3600000 //HT to UT
        const text = `${sched.ProjCode}`
        return {
            type: 'rect',
            xref: 'x',
            yref: 'paper',
            x0: startTime,
            y0: 0,
            x1: startTime + 1,
            y1: 1,
            fillcolor: '#000000',
            layer: 'above',
            opacity: 0.3,
            label: {
                text: text,
                textposition: 'middle left',
            },
            line: {
                width: 2
            }
        } as Plotly.Shape
    })
    return shapes
}


export const get_shapes = (suncalcTimes: DayViz,
    chartType: string,
    tel_geometry: GeoModel,
    deckBlocking: boolean,
    showLimits: boolean) => {
    const shapes: Partial<Plotly.Shape>[] = [
        {
            type: 'rect',
            xref: 'x',
            yref: 'paper',
            x0: suncalcTimes.sunset.getTime(),
            y0: 0,
            x1: suncalcTimes.amateurDusk.getTime(),
            y1: 1,
            fillcolor: TWILIGHT_SHADE,
            layer: 'below',
            opacity: 0.5,
            line: {
                width: 0
            }
        },
        {
            type: 'rect',
            xref: 'x',
            yref: 'paper',
            x0: suncalcTimes.amateurDusk.getTime(),
            y0: 0,
            x1: suncalcTimes.astronomicalDusk.getTime(),
            y1: 1,
            fillcolor: AMATEUR_TWILIGHT_SHADE,
            layer: 'below',
            opacity: 0.5,
            line: {
                width: 0
            }
        },
        {
            type: 'rect',
            xref: 'x',
            yref: 'paper',
            x0: suncalcTimes.astronomicalDusk.getTime(),
            y0: 0,
            x1: suncalcTimes.astronomicalDawn.getTime(),
            y1: 1,
            fillcolor: ASTRONOMICAL_TWILIGHT_SHADE,
            layer: 'below',
            opacity: 0.5,
            line: {
                width: 0
            }
        },
        {
            type: 'rect',
            xref: 'x',
            yref: 'paper',
            x0: suncalcTimes.astronomicalDawn.getTime(),
            y0: 0,
            x1: suncalcTimes.amateurDawn.getTime(),
            y1: 1,
            fillcolor: AMATEUR_TWILIGHT_SHADE,
            layer: 'below',
            opacity: 0.5,
            line: {
                width: 0
            }
        },
        {
            type: 'rect',
            xref: 'x',
            yref: 'paper',
            x0: suncalcTimes.amateurDawn.getTime(),
            y0: 0,
            x1: suncalcTimes.sunrise.getTime(),
            y1: 1,
            fillcolor: TWILIGHT_SHADE,
            layer: 'below',
            opacity: 0.5,
            line: {
                width: 0
            }
        },
    ]


    const el_shapes: Partial<Plotly.Shape>[] = [
        {
            type: 'rect',
            xref: 'paper',
            yref: 'y',
            x0: 0,
            label: {
                text: 'Bottom Shutter Limit',
                textposition: 'top center',
            },
            y0: tel_geometry.r1,
            x1: 1,
            y1: tel_geometry.r1,
            fillcolor: '#eeeeee',
            layer: 'above',
            opacity: 0.5,
            line: {
                width: 1
            }
        },
    ]

    const laser_shapes: Partial<Plotly.Shape>[] = [{
        type: 'rect',
        xref: 'paper',
        yref: 'y',
        x0: 0,
        label: {
            text: 'Laser Limit',
            textposition: 'top center',
        },
        y0: LASER_LIMIT,
        x1: 1,
        y1: LASER_LIMIT,
        fillcolor: '#eeeeee',
        layer: 'above',
        opacity: 0.5,
        line: {
            width: 1
        }
    }]

    const nasdeck_shapes: Partial<Plotly.Shape>[] = [{
        type: 'rect',
        xref: 'paper',
        yref: 'y',
        x0: 0,
        label: {
            text: 'Nasmyth Limit',
            textposition: 'top center',
        },
        y0: tel_geometry.r3,
        x1: 1,
        y1: tel_geometry.r3,
        fillcolor: '#eeeeee',
        layer: 'above',
        opacity: 0.5,
        line: {
            width: 1
        }
    }]

    const az_shapes: Partial<Plotly.Shape>[] = [
        {
            type: 'rect',
            xref: 'paper',
            yref: 'y',
            x0: 0,
            label: {
                text: 'Left/North Wrap limit',
                textposition: 'top center',
            },
            y0: tel_geometry.left_north_wrap,
            x1: 1,
            y1: tel_geometry.left_north_wrap,
            fillcolor: '#eeeeee',
            layer: 'above',
            opacity: 0.5,
            line: {
                width: 1
            }
        },
        {
            type: 'rect',
            xref: 'paper',
            yref: 'y',
            x0: 0,
            label: {
                text: 'Right/South Wrap limit',
                textposition: 'top center',
            },
            y0: tel_geometry.right_south_wrap,
            x1: 1,
            y1: tel_geometry.right_south_wrap,
            fillcolor: '#eeeeee',
            layer: 'above',
            opacity: 0.5,
            line: {
                width: 1
            }
        },
    ]

    if (chartType === 'Azimuth' && showLimits) {
        shapes.push(...az_shapes)
    }
    else if (chartType === 'Elevation' && showLimits) {
        shapes.push(...el_shapes)
        if (deckBlocking) {
            shapes.push(...nasdeck_shapes)
        }
        shapes.push(...laser_shapes)
    }
    return shapes
}

export const get_chart_datum = (ra: number, dec: number, viz: VizRow, chartType: SkyChart, lngLatEl: LngLatEl): number => {
    let val;
    switch (chartType) {
        case 'Elevation': {
            val = viz.alt
            break;
        }
        case 'Airmass': {
            val = viz.air_mass
            break;
        }
        case 'Parallactic': {
            val = parallatic_angle(ra, dec, viz.datetime, lngLatEl)
            break;
        }
        case 'Lunar Angle': {
            val = lunar_angle(ra, dec, viz.datetime, lngLatEl, viz.moon_position)
            break;
        }
        case 'Azimuth': {
            val = viz.az
            break;
        }
        default: {
            val = viz.alt
        }
    }
    return val
}

export const get_curr_loc_trace = (targetView: TargetView[],
    maxAirmass: number,
    minAirmass: number,
    time: Date,
    lngLatEl: LngLatEl,
    chartType: SkyChart,
    geoModel: GeoModel,
    timezone: string,
    date_time_format: string) => {
    //get curr marker
    const traces = targetView.map((tgtv: TargetView, idx: number) => { //add current location trace
        const ra = tgtv.ra_deg as number
        const dec = tgtv.dec_deg as number
        const azEl = ra_dec_to_az_alt(ra, dec, time, lngLatEl)
        const moon_illumination = SunCalc.getMoonIllumination(time)
        let moon_position = get_moon_position(time, lngLatEl)
        const { observable, reasons } = alt_az_observable(azEl[1], azEl[0], geoModel)
        const viz: VizRow = {
            az: azEl[0],
            alt: azEl[1],
            datetime: time,
            moon_illumination,
            moon_position,
            observable,
            reasons,
            air_mass: air_mass(azEl[1], lngLatEl.el)
        }
        const datum = get_chart_datum(ra, dec, viz, chartType, lngLatEl)
        const currTime = hidate(time, timezone)
        const airmass = air_mass(azEl[1], lngLatEl.el)
        maxAirmass = Math.max(maxAirmass, airmass)
        minAirmass = Math.min(minAirmass, airmass)
        let text = `<b>${tgtv.target_name}</b><br>`
        text += `Az: ${azEl[0].toFixed(2)}<br>`
        text += `El: ${azEl[1].toFixed(2)}<br>`
        text += `Airmass: ${airmass.toFixed(2)}<br>`
        chartType.includes('Lunar Angle') && (text += `Moon Fraction: ${viz.moon_illumination.fraction.toFixed(2)}<br>`)
        // text += `Airmass: ${util.air_mass(azEl[1]).toFixed(2)}<br>`
        text += `HT: ${currTime.format(date_time_format)}`

        const trace: Plotly.Data = {
            x: [currTime.toDate()],
            y: [datum],
            text: [text],
            hovertemplate: '<b>%{text}</b>', //disable to show xyz coords
            showlegend: false,
            marker: {
                size: 12,
                // color: 'red',
                color: colors[idx % colors.length],
                line: {
                    color: 'black',
                    width: 3
                }
            },
            textposition: 'top left',
            type: 'scatter',
            mode: 'markers',
            name: tgtv.target_name
        }
        return trace
    })
    return traces
}