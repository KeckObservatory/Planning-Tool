import { useState } from 'react'

import { Stack, TextField, List, Typography, Button } from '@mui/material';
import { DialogComponent } from '../dialog_component';
import { Dome, DomeParam, DomeSelect } from '../two-d-view/two_d_view_common.tsx';
import { useQueryParam, withDefault } from 'use-query-params';
import { ExportProps, getStarlist } from '../table_toolbar';
import { useSnackbarContext, useStateContext } from '../App';
import React from 'react';
import { get_user_schedule, Schedule, submit_starlist, SubmittedStarList } from '../api/api_root';
import { TargetListItem } from './target_list_item';
import { ScheduleTable } from './schedule_table';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { DesktopDatePicker } from '@mui/x-date-pickers/DesktopDatePicker';
import dayjs, { Dayjs } from 'dayjs';
import { Target } from '../App';
import { config } from '../config.tsx';
import { has_nonzero_value } from '../validation_check_dialog.tsx';

interface StarlistSubmissionDialogProps extends ExportProps {
    open: boolean,
    handleClose: () => void
}

const moveItem = (rows: string[], from: number, to: number): string[] => {
    const newRows = [...rows]
    const [row] = newRows.splice(from, 1)
    newRows.splice(to, 0, row)
    return newRows
}

// Flags problems with individual targets in the export list: missing names, and
// targets that are duplicated - either sharing a name, or whose ra_deg/dec_deg fall
// within tolerance of another target's. Returns one warning message per problem found.
const find_malformed_targets = (targets: Target[]): string[] => {
    const warnings: string[] = []

    const unnamedCount = targets.filter((tgt) => !tgt.target_name).length
    if (unnamedCount > 0) {
        warnings.push(`${unnamedCount} target(s) are missing a name.`)
    }

    const duplicates = new Set<string>()

    const nameCounts = new Map<string, number>()
    targets.forEach((tgt) => {
        if (!tgt.target_name) return
        nameCounts.set(tgt.target_name, (nameCounts.get(tgt.target_name) ?? 0) + 1)
    })
    nameCounts.forEach((count, name) => {
        if (count > 1) duplicates.add(name)
    })

    for (let i = 0; i < targets.length; i++) {
        const a = targets[i]
        if (a.ra_deg == null || a.dec_deg == null) continue
        for (let j = i + 1; j < targets.length; j++) {
            const b = targets[j]
            if (b.ra_deg == null || b.dec_deg == null) continue
            if (Math.abs(a.ra_deg - b.ra_deg) < config.duplicate_radec_tolerance_deg &&
                Math.abs(a.dec_deg - b.dec_deg) < config.duplicate_radec_tolerance_deg) {
                a.target_name && duplicates.add(a.target_name)
                b.target_name && duplicates.add(b.target_name)
            }
        }
    }

    if (duplicates.size > 0) {
        warnings.push(`Duplicate targets found (name or RA/Dec): ${[...duplicates].join(', ')}`)
    }

    return warnings
}

// Whether any target being submitted has a real (nonzero) proper motion - LGS/NGS targets
// cannot have proper motion, so this gates the Submit button.
const has_nonzero_pm = (targets: Target[]): boolean =>
    targets.some((tgt) => has_nonzero_value(tgt.pm_ra) || has_nonzero_value(tgt.pm_dec))

// A pm_ra/pm_dec of exactly zero means "no measurement", not "measured to be zero" - strip it
// so the generated starlist never writes a meaningless pmra=0/pmdec=0.
const strip_zero_pm = (targets: Target[]): Target[] => targets.map((tgt) => {
    const pm_ra = has_nonzero_value(tgt.pm_ra) ? tgt.pm_ra : undefined
    const pm_dec = has_nonzero_value(tgt.pm_dec) ? tgt.pm_dec : undefined
    if (pm_ra === tgt.pm_ra && pm_dec === tgt.pm_dec) return tgt
    return { ...tgt, pm_ra, pm_dec }
})

export const StarlistSubmissionDialog = (props: StarlistSubmissionDialogProps) => {
    // target must have ra dec and be defined
    const [dome, setDome] = useQueryParam<Dome>('dome', withDefault(DomeParam, 'Keck 2' as Dome))
    const [piName, setPiName] = useState<string>("")
    const [date, setDate] = useState<Dayjs | null>(dayjs())
    const [comments, setComments] = useState<string>("")
    const [schedule, setSchedule] = useState<Schedule[]>([])
    const [selectedSchedId, setSelectedSchedId] = useState<number | undefined>(undefined)
    const context = useStateContext()
    const snackbarContext = useSnackbarContext()

    // populates the form from a scheduled night. add new form values here.
    const onScheduleRowSelect = (entry: Schedule) => {
        setSelectedSchedId(entry.SchedId)
        setPiName(entry.PiLastName)
        setDate(dayjs(entry.Date))
    }

    React.useEffect(() => {
        const run = async () => {
            setSchedule(await get_user_schedule(context.obsid))
        }
        run()
    }, [context.obsid])

    const starListTextInit = getStarlist(strip_zero_pm(props.exportTargets), false)
    const starListInit = starListTextInit.split('\n').filter( row => row.length > 0)

    const malformedTargetWarnings = React.useMemo(
        () => find_malformed_targets(props.exportTargets),
        [props.exportTargets]
    )
    const hasMalformedTargets = malformedTargetWarnings.length > 0

    // LGS/NGS targets cannot have proper motion, so a real (nonzero) pm_ra/pm_dec blocks
    // submission entirely rather than just warning.
    const hasNonzeroPM = React.useMemo(
        () => has_nonzero_pm(props.exportTargets),
        [props.exportTargets]
    )

    React.useEffect(() => {
        if (!props.open) return

        // The app's global snackbar only holds one message at a time, so every
        // warning found is combined into a single message rather than firing
        // setSnackbarMessage repeatedly (which would just have the last call win).
        const warnings: string[] = []

        const anyLgs = props.exportTargets.some(tgt => tgt.lgs === '1')
        if (!anyLgs) {
            warnings.push("There are no LGS targets being submitted!")
        }

        const pmTargetNames = props.exportTargets
            .filter(tgt => has_nonzero_value(tgt.pm_ra) || has_nonzero_value(tgt.pm_dec))
            .map(tgt => tgt.target_name)
            .filter((name): name is string => !!name)
        if (pmTargetNames.length > 0) {
            warnings.push(`Targets should not have proper motion: ${pmTargetNames.join(', ')}`)
        }

        warnings.push(...malformedTargetWarnings)

        if (props.exportTargets.length > config.full_night_target_limit) {
            warnings.push(
                `${props.exportTargets.length} targets submitted - only ${config.full_night_target_limit} `
                + `are allowed for a full night (${config.half_night_target_limit} for a half night).`
            )
        }

        if (warnings.length > 0) {
            snackbarContext.setSnackbarMessage({ severity: 'warning', message: warnings.join('\n') })
            snackbarContext.setSnackbarOpen(true)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [props.exportTargets, props.open])

    const [starListStrings, setStarListStrings] = useState<string[] | undefined>(starListInit)

    const moveRow = (from: number, to: number) => {
        setStarListStrings((rows) => rows ? moveItem(rows, from, to) : rows)
    }

    const starListItems = (starListStrings ?? []).map((starListString, idx, rows) => {
        const isFirst = idx === 0
        const isLast = idx === rows.length - 1
        return (
            <TargetListItem
                idx={idx}
                starListString={starListString}
                isFirst={isFirst}
                isLast={isLast}
                moveRow={moveRow}
                nRows={rows.length}
            />
        )
    })

    // A cleared/partially-typed picker leaves a non-null but invalid Dayjs, not null,
    // so `date ? ... : ""` alone let an unformattable date slip through to the backend.
    const isDateValid = date != null && date.isValid()
    const isPiNameValid = piName.trim().length > 0

    const submit_starlist_to_database = async () => {
        if (!isDateValid) {
            snackbarContext.setSnackbarMessage({ severity: 'error', message: 'Please select a valid HST date before submitting.' })
            snackbarContext.setSnackbarOpen(true)
            return
        }
        if (!isPiNameValid) {
            snackbarContext.setSnackbarMessage({ severity: 'error', message: 'Please enter a PI name before submitting.' })
            snackbarContext.setSnackbarOpen(true)
            return
        }
        if (hasMalformedTargets) {
            snackbarContext.setSnackbarMessage({ severity: 'error', message: 'Please fix the malformed targets before submitting.' })
            snackbarContext.setSnackbarOpen(true)
            return
        }
        if (hasNonzeroPM) {
            snackbarContext.setSnackbarMessage({ severity: 'error', message: 'LGS/NGS targets cannot have proper motion. Please remove proper motion values before submitting.' })
            snackbarContext.setSnackbarOpen(true)
            return
        }
        const form: SubmittedStarList = {
            telescope: dome.slice(dome.length - 1),
            hstDate: date.format('YYYY-MM-DD'),
            piname: piName,
            comments: comments ?? "",
            slist: (starListStrings ?? []).join('\n'),
        }
        const submit_status = await submit_starlist(form)
        if (submit_status.includes("File saved sucessfully")) {
            snackbarContext.setSnackbarMessage({severity: 'success', message:submit_status})
            snackbarContext.setSnackbarOpen(true)
            props.handleClose()
        }
        else {
            snackbarContext.setSnackbarMessage({severity: 'error', message: submit_status})
            snackbarContext.setSnackbarOpen(true)
        }
    }

    const dialogTitle = (
        <span>LGS List Submission</span>
    )

    const dialogActions = (
        <Button
            variant="contained"
            color="primary"
            disabled={!isDateValid || !isPiNameValid || hasMalformedTargets || hasNonzeroPM}
            onClick={submit_starlist_to_database}
        >
            Submit
        </Button>
    )
    const dialogContent = (
        <Stack
            sx={{
                paddingTop: '16px',
                display: 'flex',
                flexWrap: 'wrap',
            }}
            direction='column' spacing={2}>
            <Typography variant="subtitle1">
                Schedule
            </Typography>
            <ScheduleTable
                schedule={schedule}
                onRowSelect={onScheduleRowSelect}
                selectedSchedId={selectedSchedId}
            />
            <DomeSelect
                dome={dome}
                setDome={setDome}
            />
            <LocalizationProvider dateAdapter={AdapterDayjs}>
                <DesktopDatePicker
                    sx={{ width: '25%' }}
                    views={['year', 'month', 'day']}
                    label="HST Date"
                    value={date}
                    onChange={(newDate) => setDate(newDate)}
                    slotProps={{
                        textField: {
                            error: !isDateValid,
                            helperText: isDateValid ? undefined : 'Required',
                        },
                    }}
                />
            </LocalizationProvider>
            <TextField
                label="PI Name"
                value={piName}
                focused={piName ? true : false}
                onChange={(e) => setPiName(e.target.value)}
                required
                error={!isPiNameValid}
                helperText={isPiNameValid ? undefined : 'Required'}
                sx={{ width: '25%' }}
            />
            <TextField
                label="Comments"
                value={comments}
                sx={{ width: '100%' }}
                onChange={(e) => setComments(e.target.value)}
                multiline
                rows={4}
            />
            <Typography variant="subtitle1" sx={{ paddingTop: '16px' }}>
                Star List
            </Typography>
            <List
                dense
                sx={{
                    maxHeight: 400,
                    overflowY: 'auto',
                    width: '100%',
                }}
            >
                {starListItems}
            </List>
        </Stack>
    )

    return (
        <DialogComponent
            open={props.open}
            handleClose={props.handleClose}
            titleContent={dialogTitle}
            children={dialogContent}
            actions={dialogActions}
            maxWidth="xl"
            minWidth={1000}
        />
    )
}
