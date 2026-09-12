import * as React from 'react';
import UploadIcon from '@mui/icons-material/Upload';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import Button from '@mui/material/Button';
import { UploadComponent } from './upload_targets_dialog';
import { get_simbad_data } from './catalog_button.tsx';
import Tooltip from '@mui/material/Tooltip';
import Stack from '@mui/material/Stack';
import { useSnackbarContext, useStateContext } from './App.tsx';
// import { save_target } from './api/api_root';
import LinearProgress, { LinearProgressProps } from '@mui/material/LinearProgress';
import { Target } from './App.tsx'
import { useRowsContext } from './target_table.tsx';
import { v4 as randomId } from 'uuid';
import { submit_target } from './api/api_root.tsx';
import { FormControlLabel, FormGroup, Switch } from '@mui/material';



function TargetSubmitter(props: LinearProgressProps &
{
    targets: Target[]
    setTargets: Function,
    open: boolean,
    setOpen: Function
}
) {

    const [targetName, setTargetName] = React.useState('')
    const [useSimbad, setUseSimbad] = React.useState(false)
    const [label, setLabel] = React.useState('Create Targets')
    const context = useStateContext()

    const RowsContext = useRowsContext()
    const snackbarContext = useSnackbarContext()

    const { targets, setTargets, open } = props
    const [progress, setProgress] = React.useState(0)
    const generate_targets_from_list = async () => {
        setLabel('Loading Targets')
        const tgts: Target[] = []
        for (let idx = 0; idx < targets.length; idx++) {
            let tgt = targets[idx]
            const tgtName = tgt.target_name as string
            setTargetName(`on row ${idx + 1} target: ${tgtName}`)
            if (!tgtName) continue
            if (!open) break

            const simbadData = useSimbad ? await get_simbad_data(tgtName) ?? {} : {}
            tgt = { ...simbadData, ...tgt, obsid: context.obsid } as Target
            tgts.push(tgt)
            setProgress(((idx + 1) / targets.length) * 100)
        }

        setProgress(100)
        setTargets(tgts)
        console.log('tgts', tgts)
        setLabel('Targets Created')
        save_targets(tgts)
    }
    const onSimbadSwitchChange = (event: React.SyntheticEvent<Element, Event>) => {
        const value = (event.target as HTMLInputElement).checked
        setUseSimbad(value)
    }

    const save_targets = async (targetsToSave: Target[] = targets) => {
        console.log('saving targets')
        const tgts = targetsToSave.map((tgt) => {
            return { ...tgt, _id: randomId(), obsid: context.obsid } as Target
        })

        const resp = await submit_target(tgts)
        if (resp.errors && resp.errors.length > 0) {
            console.error('errors', resp.errors)
            snackbarContext.setSnackbarMessage({ severity: 'error', message: `Error saving targets ${resp.errors}` })
            snackbarContext.setSnackbarOpen(true);
        }

        const savedTgts = tgts.map((tgt, idx) => {
            const saved = resp.targets?.at(idx)
            return saved?._id ? saved : tgt
        })

        RowsContext.setRows((curTgts) => [...savedTgts, ...curTgts])
        // The uploaded targets have to land in context.targets too. 
        context.setTargets && context.setTargets((oldTargets) => {
            const existing = oldTargets ?? []
            const newTgts = savedTgts.filter((tgt) => !existing.some((old) => old._id === tgt._id))
            return newTgts.length > 0 ? [...newTgts, ...existing] : existing
        })
        props.setOpen(false)
    }

    return (
        <>
            <Tooltip
                title={'Simbad is used to fill in missing target data for a given name (I.E. M31)'}
                placement="right"
            >
                <FormGroup>
                    <FormControlLabel
                        onChange={onSimbadSwitchChange}
                        control={<Switch checked={useSimbad} />}
                        label={'Use Simbad target resolver'} />
                </FormGroup>
            </Tooltip>
            <Button
                disabled={label.includes('Loading')}
                onClick={generate_targets_from_list}>{label}</Button>
            {targetName && (
                <Typography variant="body2" color="text.secondary">
                    {targetName}
                </Typography>
            )}
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
                <Box sx={{ width: '100%', mr: 1 }}>
                    <LinearProgress variant="determinate" value={progress} {...props} />
                </Box>
                <Box sx={{ minWidth: 35 }}>
                    <Typography variant="body2" color="text.secondary">{`${Math.round(
                        progress,
                    )}%`}</Typography>
                </Box>
            </Box>
        </>
    );
}
interface DialogProps {
    open: boolean
    onClose: Function
    setOpen: Function
}

export const TargetWizardDialog = (props: DialogProps) => {

    const { onClose, open, setOpen } = props;
    const [targets, setTargets] = React.useState([] as Target[])

    const handleClose = () => {
        onClose();
    };

    return (
        <Dialog onClose={handleClose} open={open}>
            <DialogTitle>Target Wizard</DialogTitle>
            <Stack direction='column' spacing={2} padding={2}>
                <UploadComponent
                    setTargets={setTargets}
                />
                <TargetSubmitter
                    targets={targets}
                    setTargets={setTargets}
                    setOpen={setOpen}
                    open={open} />
            </Stack>
        </Dialog>
    )
}

export const TargetWizardButton = () => {

    const [open, setOpen] = React.useState(false);
    const handleClickOpen = () => {
        setOpen(true);
    };

    const handleClose = () => {
        setOpen(false);
    };
    return (
        <>
            <Tooltip title="Upload Targets from .json files or in starlist directory">
                <Button id={'upload-targets'} onClick={handleClickOpen} startIcon={<UploadIcon />}>
                    Upload Targets
                </Button>
            </Tooltip>
            <TargetWizardDialog
                open={open}
                setOpen={setOpen}
                onClose={handleClose}
            />
        </>
    )
}