import React from "react"
import { Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from "@mui/material"
import { Dayjs } from 'dayjs'
import { get_telescope_schedule, TelSchedule } from "../api/api_root"

interface Props {
    onRowSelect: (entry: TelSchedule) => void
    date: Dayjs | null
    selectedSchedId?: number
}

// Every program scheduled on both telescopes for a chosen night - unlike ObserverScheduleTable,
// which is limited to the logged-in observer's own nights. The date is owned by the parent so
// it stays in step with the form's HST Date; this component only fetches and renders.
export const TelescopeScheduleTable = (props: Props) => {
    const { onRowSelect, date, selectedSchedId } = props

    const [schedule, setSchedule] = React.useState<TelSchedule[]>([])
    const [loading, setLoading] = React.useState(false)

    // A cleared/half-typed picker leaves a non-null but invalid Dayjs, which would format
    // to "Invalid Date" and be sent to the backend verbatim.
    const dateStr = date != null && date.isValid() ? date.format('YYYY-MM-DD') : null

    React.useEffect(() => {
        if (dateStr === null) {
            setSchedule([])
            return
        }

        // Every keystroke in the date field produces a complete, valid-looking date, so typing
        // "09/10/2026" would otherwise fire a request per character - including junk years like
        // 0202. Wait for typing to settle, and still ignore any response that is no longer for
        // the date in the picker, since responses can land out of order.
        let stale = false
        const run = async () => {
            setLoading(true)
            const resp = await get_telescope_schedule(dateStr)
            if (stale) return
            // api_root's helpers resolve with the error object instead of rejecting,
            // so a failed request arrives here as something that is not an array.
            setSchedule(Array.isArray(resp) ? resp : [])
            setLoading(false)
        }
        const timer = setTimeout(run, 400)
        return () => {
            stale = true
            clearTimeout(timer)
        }
    }, [dateStr])

    return (
        <Stack direction='column' spacing={1}>
            {schedule.length === 0 ? (
                <Typography variant="body2" sx={{ padding: '8px' }}>
                    {loading
                        ? 'Loading telescope schedule...'
                        : dateStr === null
                            ? 'Select a date to see the telescope schedule.'
                            : `No programs scheduled on ${dateStr}.`}
                </Typography>
            ) : (
                <TableContainer component={Paper} sx={{ maxHeight: 300 }}>
                    <Table size="small" stickyHeader>
                        <TableHead>
                            <TableRow>
                                <TableCell>Instrument</TableCell>
                                <TableCell>HST Date</TableCell>
                                <TableCell>Telescope</TableCell>
                                <TableCell>Fraction of Night</TableCell>
                                <TableCell>PI</TableCell>
                                <TableCell>Project Code</TableCell>
                                <TableCell>Observers</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {schedule.map((entry, idx) => (
                                <TableRow
                                    key={entry.SchedId ?? idx}
                                    hover
                                    selected={selectedSchedId === entry.SchedId}
                                    onClick={() => onRowSelect(entry)}
                                    sx={{ cursor: 'pointer' }}
                                >
                                    <TableCell>{entry.Instrument}</TableCell>
                                    <TableCell>{entry.Date}</TableCell>
                                    <TableCell>{entry.TelNr}</TableCell>
                                    <TableCell>{entry.FractionOfNight}</TableCell>
                                    <TableCell>{entry.PiLastName}</TableCell>
                                    <TableCell>{entry.ProjCode}</TableCell>
                                    <TableCell>{entry.Observers}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </TableContainer>
            )}
        </Stack>
    )
}
