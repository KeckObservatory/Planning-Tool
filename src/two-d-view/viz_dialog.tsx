import React, { useState, useEffect } from 'react'
import MultilineChartIcon from '@mui/icons-material/MultilineChart';
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import { DomeSelect, Dome, DomeParam } from "./two_d_view_common.tsx";
import { StringParam, useQueryParam, withDefault } from 'use-query-params';
import { Target, useStateContext } from '../App';
import { Autocomplete, Stack, TextField } from '@mui/material';
import { alt_az_observable } from './two_d_view_common.tsx';
import dayjs, { Dayjs, ManipulateType } from 'dayjs';
import utc from 'dayjs/plugin/utc'
import * as SunCalc from 'suncalc'
import timezone from 'dayjs/plugin/timezone'
import { GetTimesResult, GetMoonIlluminationResult, GetMoonPositionResult } from "suncalc";
import { air_mass, get_day_times, get_moon_position, get_suncalc_times, ra_dec_to_az_alt } from './sky_view_util';
import { ROUND_MINUTES, SEMESTER_RANGES } from './constants';
import { DialogComponent } from '../dialog_component';
import { VizChart, VizSelectMenu } from '../viz_select_menu';
import { LazyFallback } from '../lazy_fallback';
dayjs.extend(utc)
dayjs.extend(timezone)

// Both chart modules pull in plotly (~4.9MB). Load them on first render of the
// dialog body rather than shipping them in the initial bundle.
const TargetVizChart = React.lazy(() => import('./target_viz_chart').then(m => ({ default: m.TargetVizChart })))
const MoonVizChart = React.lazy(() => import('./moon_viz_chart').then(m => ({ default: m.MoonVizChart })))

interface ButtonProps {
    targets: Target[]
}

export interface TargetViz extends Target {
    semester: string
    semester_visibility: DayViz[]
    dome: Dome
}

export interface DayViz extends GetTimesResult {
    date: Date,
    visibility: VizRow[]
    visible_hours: number
    civilDawn: Date, // Sun in 6 degrees below the horizon
    civilDusk: Date, // Sun in 6 degrees below the horizon
    amateurDawn: Date, // Sun in 12 degrees below the horizon
    amateurDusk: Date, // Sun in 12 degrees below the horizon
    astronomicalDawn: Date, // Sun is 18 degrees below the horizon
    astronomicalDusk: Date, // Sun is 18 degrees below the horizon
}

export type BlockReason = 'Deck Blocking' | 'Below Horizon' | 'Above Tracking Limits'

export interface VizRow {
    datetime: Date
    alt: number
    az: number
    observable: boolean
    air_mass: number
    reasons: BlockReason[]
    moon_illumination: GetMoonIlluminationResult
    moon_position: GetMoonPositionResult
}

export const dayjs_range = (start: Dayjs, end: Dayjs, unit: ManipulateType = 'day') => {
    const range = [];
    let current = start;
    while (!current.isAfter(end)) {
        range.push(current);
        current = current.add(1, unit);
    }
    return range;
}

const get_curr_semester = (date: Date) => {
    const year = date.getFullYear()
    const month = date.getMonth()
    const sem = month > 1 && month < 8 ? 'A' : 'B'
    return `${year}${sem}`
}

interface VizDialogProps {
    open: boolean,
    target: Target,
    setTarget: (t: Target) => void
    targets: Target[]
    handleClose: () => void
}

interface SemesterSelectProps {
    semester: string
    setSemester: (semester: string) => void
}

const get_semester_dates = (semester: string) => {
    const sem = semester[semester.length - 1] as 'A' | 'B'
    const year = Number(semester.slice(0, 4))
    const plusYear = SEMESTER_RANGES[sem].plus_year ?? 0
    const endYear = year + plusYear
    const range = SEMESTER_RANGES[sem as 'A' | 'B']

    const startDate = dayjs().year(year).month(range.start_month).date(range.start_day)
    const endDate = dayjs().year(endYear).month(range.end_month).date(range.end_day)
    const ranges = dayjs_range(startDate, endDate, 'day')
    return ranges
}

export const TargetVizButton = (props: ButtonProps) => {
    const { targets } = props


    let initTarget = targets.at(0) ?? {} as Target
    const [target, setTarget] = useState<Target>(initTarget)
    const [open, setOpen] = React.useState(false);

    useEffect(() => {
        if (targets.length > 0) {
            const target = targets.at(0) ?? {} as Target
            setTarget(target)
        }
    }, [targets])

    const handleClickOpen = () => {
        setOpen(true);
    };

    const handleClose = () => {
        setOpen(false);
    };

    return (
        <>
            <Tooltip title={`Click to view semester visibility for ${target.target_name ?? target._id}`}>
                <IconButton color="primary" onClick={handleClickOpen}>
                    <MultilineChartIcon/>
                </IconButton>
            </Tooltip>
            {open &&
                <VizDialog
                    open={open}
                    target={target}
                    setTarget={setTarget}
                    targets={targets}
                    handleClose={handleClose}
                />
            }
        </>
    );
}

export const SemesterSelect = (props: SemesterSelectProps) => {
    const { semester, setSemester } = props
    const handleSemesterChange = (semester?: string) => {
        if (semester) setSemester(semester)
    }
    return (
        <Tooltip title="Select Semester visibility Range.">
            <TextField
                // focused
                label={'Semester Select'}
                id="target-name"
                value={semester}
                onChange={(event) => handleSemesterChange(event.target.value)}
            />
        </Tooltip>
    )
}


export const VizDialog = (props: VizDialogProps) => {
    const [dome, setDome] = useQueryParam<Dome>('dome', withDefault(DomeParam, 'Keck 2' as Dome))
    const default_semester = get_curr_semester(new Date())
    const [semester, setSemester] = useQueryParam('semester', withDefault(StringParam, default_semester))
    const [vizType, setVizType] = useState<VizChart>("Target Visibility")
    const context = useStateContext()

    const lngLatEl = context.config.tel_lat_lng_el[dome]
    // target must have ra dec and be defined
    const { target, setTarget, targets, open } = props
    const geoModel = context.config.tel_geometry[dome]
    const regexp = new RegExp("^[12][0-9]{3}[AB]$")

    const targetViz = React.useMemo(() => {
        let tViz = {
            ...target,
            semester,
            dome,
            semester_visibility: []} as TargetViz

        const validSemester = regexp.test(semester)
        if (!validSemester) {
            return tViz 
        }
        const dates = get_semester_dates(semester)

        if (!target.ra_deg || !target.dec_deg) {
            return tViz
        }

        tViz.semester_visibility = dates.map((date: Dayjs) => {
            let suncalc_times = get_suncalc_times(lngLatEl, date.toDate())
            const startTime = suncalc_times.sunset
            const endTime = suncalc_times.nightEnd
            const times = get_day_times(startTime, endTime, ROUND_MINUTES)
            const visibility = times.map((time: Date) => {
                const [az, alt] = ra_dec_to_az_alt(target.ra_deg as number,
                    target.dec_deg as number, time, lngLatEl)
                const air_mass_val = air_mass(alt, lngLatEl.el)
                const moon_position = get_moon_position(time, lngLatEl)
                const moon_illumination = SunCalc.getMoonIllumination(time)
                // const air_mass_val = air_mass(alt)
                const vis: VizRow = {
                    az,
                    alt,
                    ...alt_az_observable(alt, az, geoModel),
                    datetime: time,
                    air_mass: air_mass_val,
                    moon_illumination,
                    moon_position
                }
                return vis
            })

            const vizSum = visibility.reduce((sum: number, viz: VizRow) => {
                return viz.observable ? sum + 1 : sum
            }, 0)

            const visible_hours = vizSum * ROUND_MINUTES / 60

            return { ...suncalc_times, date: date.toDate(), visibility, visible_hours }
        })
        console.log('targetViz', tViz)
        return tViz
    }, [semester, dome, target])

    const onTargetNameSelect = (name: string) => {
        console.log('name', name, 'targetName',)
        console.log('targets', targets)
        const targetName = target.target_name ?? target._id
        if (name !== targetName) {
            let newTarget = targets.find((t: Target) => t.target_name === name || t._id === name)
            newTarget = (newTarget && newTarget.ra && newTarget.dec) ? newTarget : {} as Target
            setTarget(newTarget)
        }
    }

    const dialogTitle = (
        <span>Target Visability Chart</span>
    )

    const dialogContent = (
        <Stack
            sx={{
                paddingTop: '16px',
                display: 'flex',
                flexWrap: 'wrap',
            }}
            direction='column'>
            <Stack direction='row' spacing={1}>
                <SemesterSelect semester={semester} setSemester={setSemester} />
                <DomeSelect dome={dome} setDome={setDome} />
                <Tooltip title={'Target'}>
                    <Autocomplete
                        disablePortal
                        id="selected-target"
                        value={target.target_name ?? target._id}
                        onChange={(_, value) => value && onTargetNameSelect(value)}
                        options={targets.map(target => target.target_name ?? target._id)}
                        sx={{ width: 250 }}
                        renderInput={(params) => <TextField {...params} label={'Selected Target'} />}
                    />
                </Tooltip>
                <VizSelectMenu vizType={vizType} setVizType={setVizType} />
            </Stack>
            <React.Suspense fallback={<LazyFallback />}>
                {vizType === "Target Visibility" && targetViz.ra_deg && targetViz.dec_deg ?
                    (<TargetVizChart targetViz={targetViz} />)
                    :
                    (<MoonVizChart targetViz={targetViz} vizType={vizType} />)
                }
            </React.Suspense>
        </Stack>
    )

    return (
        <DialogComponent
            open={open}
            handleClose={props.handleClose}
            titleContent={dialogTitle}
            children={dialogContent}
            maxWidth="xl"
        />
    )
}
