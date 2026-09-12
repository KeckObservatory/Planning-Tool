import React from "react"
import { Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from "@mui/material"
import { Dayjs } from 'dayjs'
import { get_telescope_schedule, TelSchedule } from "../api/api_root"
import { is_ao_instrument, is_trick_instrument } from "../guide_star/guide_star_dialog"

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

    const dateStr = date != null && date.isValid() ? date.format('YYYY-MM-DD') : null

    React.useEffect(() => {
        if (dateStr === null) {
            setSchedule([])
            return
        }

        let stale = false
        const run = async () => {
            setLoading(true)
            let resp = await get_telescope_schedule(dateStr)
            if (stale) return
            resp = Array.isArray(resp) ? resp : []
            resp = resp.filter((entry) => 
                is_ao_instrument(entry.BaseInstrument ?? '') 
                || is_trick_instrument(entry.BaseInstrument ?? ''))

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
                            : `No AO programs scheduled on ${dateStr}.`}
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
