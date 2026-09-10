import MenuItem from "@mui/material/MenuItem";
import { ExportProps, getStarlist } from "./table_toolbar";
import { SnackbarContextProps, useSnackbarContext } from "./App";
import { DialogComponent } from './dialog_component';
import { Button, Checkbox, FormControlLabel, Stack, TextField } from "@mui/material";
import React from "react";
import { submit_target_to_starlist_dir } from "./api/api_root";

interface ETProps {
    open: boolean;
    handleClose: Function;
    handleSubmit?: Function;
    fileName: string;
    setFileName: Function;
    ignoreComments?: boolean;
    setIgnoreComments?: Function;
}

export function ExportTargetsNameDialog(props: ETProps) {
    const { open, handleClose, fileName, setFileName, handleSubmit, ignoreComments, setIgnoreComments } = props;

    const dialogTitle = (
        <div>Set File Name</div>
    );

    const dialogContent = (
        <Stack sx={{
            paddingTop: '16px',
            display: 'flex',
            flexWrap: 'wrap',
        }}
            justifyContent='center'
            maxWidth='100%'
        >
            <TextField
                required
                id="filename-required"
                label="File Name"
                value={fileName}
                onChange={(e) => setFileName(e.target.value)}
            />
            {setIgnoreComments && (
                <FormControlLabel
                    control={
                        <Checkbox
                            checked={!!ignoreComments}
                            onChange={(e) => setIgnoreComments(e.target.checked)}
                        />
                    }
                    label="Ignore Comments and Tags"
                />
            )}
            <Button
                variant="contained"
                color="primary"
                onClick={() => {
                    if (handleSubmit) {
                        handleSubmit();
                    }
                    handleClose();
                }}>
                Submit
            </Button>
        </ Stack>
    )

    return (
        <DialogComponent
            open={open}
            handleClose={handleClose}
            titleContent={dialogTitle}
            children={dialogContent}
            maxWidth="sm"
        />
    );
}


const exportBlob = (blob: Blob, filename: string, snackbarContext: SnackbarContextProps) => {
    const formData = new FormData();
    formData.append('file', blob, filename);
    submit_target_to_starlist_dir(formData)
        .then(response => {
            const severity = typeof response === 'string' ? 'success' : 'error';
            console.log('export response', response);
            snackbarContext.setSnackbarMessage({ severity, message: `${response}` });
            snackbarContext.setSnackbarOpen(true);
        }
        )
}

export const StarListExportDirMenu = (props: ExportProps) => {
    const [open, setOpen] = React.useState(false);
    const [fileName, setFileName] = React.useState('starlist.txt');
    const [ignoreComments, setIgnoreComments] = React.useState(false);

    const { hideMenu } = props;
    const snackbarContext = useSnackbarContext()

    const handleClose = () => {
        setOpen(false);
    };

    const handleExport = () => {
        const targets = props.exportTargets
        const txt = getStarlist(targets, !ignoreComments);
        const blob = new Blob([txt], {
            type: 'text/json',
        });
        exportBlob(blob, fileName, snackbarContext);
        hideMenu?.();
    }
    return (
        <>
            <MenuItem
                onClick={() => {
                    setOpen(true);
                }}
            >
                Write to Starlist Directory
            </MenuItem >
            <ExportTargetsNameDialog
                open={open}
                handleClose={handleClose}
                handleSubmit={handleExport}
                fileName={fileName}
                setFileName={setFileName}
                ignoreComments={ignoreComments}
                setIgnoreComments={setIgnoreComments}
            />
        </>

    );
}