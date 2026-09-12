import * as React from 'react';
import DeleteIcon from '@mui/icons-material/DeleteOutlined';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import { Target, useSnackbarContext, useStateContext } from './App';
import { DialogComponent } from './dialog_component';
import { Button, Typography } from '@mui/material';
import { delete_target, submit_target } from './api/api_root';



export interface VTDProps {
  open: boolean;
  handleClose: Function;
  targets: Target[];
  setRows: Function;
}

interface Props {
  targets: Target[];
  setRows: Function;
  color?: 'inherit' | 'default' | 'primary' | 'secondary' | 'error' | 'info' | 'success' | 'warning';
}

function DeleteTargets(props: { targets: Target[], setRows: Function }) {
  const { targets, setRows } = props;
  const snackbarContext = useSnackbarContext()
  const context = useStateContext()
  const [enableUndo, setEnableUndo] = React.useState(false);
  const [deletedTargets, setDeletedTargets] = React.useState<Target[]>([]);

  const onDeleteClick = async () => {
    const ids = targets.map((target) => target._id);
    const resp = await delete_target(ids)
    if (resp.status !== 'SUCCESS') {
      console.error('error deleting targets', resp)
      snackbarContext.setSnackbarMessage({ severity: 'error', message: 'Error deleting targets' })
      snackbarContext.setSnackbarOpen(true)
      return
    }
    setDeletedTargets(targets)
    setRows((oldRows: Target[]) => {
      const newRows = oldRows.filter((row: any) => !ids.includes(row._id))
      return newRows
    });
    context.setTargets && context.setTargets((oldTargets) => {
      const remaining = (oldTargets ?? []).filter((tgt) => !ids.includes(tgt._id))
      return remaining.length === (oldTargets?.length ?? 0) ? oldTargets : remaining
    });
    setEnableUndo(true)
  }

  const onUndoClick = async () => {
    const resp = await submit_target(deletedTargets)
    if (resp.errors.length>0) {
      console.error('error while undoing target delete', resp)
      const msg = 'error when undoing deleted targets: ' + resp.errors.join(', ')
      snackbarContext.setSnackbarMessage({ severity: 'error', message: msg })
      snackbarContext.setSnackbarOpen(true)
      return
    }
    snackbarContext.setSnackbarMessage({ severity: 'info', message: 'Resubmitted deleted targets' })
    snackbarContext.setSnackbarOpen(true)
    // Restore from deletedTargets, not the `targets` prop: that prop is the table's
    // selected rows, and onDeleteClick already removed these from rows, so the
    // selection resolves to nothing by the time undo runs. Prefer the copies the
    // backend echoed back - their _ids are what deletes and edits key on next.
    const restoredTargets = deletedTargets.map((tgt, idx) => {
      const saved = resp.targets?.at(idx)
      return saved?._id ? saved : tgt
    })
    setRows((oldRows: Target[]) => {
      const missing = restoredTargets.filter((tgt) => !oldRows.some((row) => row._id === tgt._id))
      return missing.length > 0 ? [...missing, ...oldRows] : oldRows
    });
    context.setTargets && context.setTargets((oldTargets) => {
      const existing = oldTargets ?? []
      const missing = restoredTargets.filter((tgt) => !existing.some((old) => old._id === tgt._id))
      return missing.length > 0 ? [...missing, ...existing] : existing
    });
    setDeletedTargets([])
    setEnableUndo(false)
  }

  const targetList = targets.map((target, index) => {
    return (
      <div key={index}>
        {target.target_name}
      </div>
    );
  });

  return (
    <div>
      <Button onClick={onDeleteClick}>Confirm Delete?</Button>
      {enableUndo && (
        <Button onClick={onUndoClick}>Undo Delete?</Button>
      )}
      <Typography>Targets to be deleted:</Typography>
      {targetList}
    </div>
  );
}

function DeleteTargetsDialog(props: VTDProps) {
  const { open, handleClose, targets, setRows } = props;

  const dialogTitle = (
    <div>Delete Targets</div>
  );

  const dialogContent = (
    <DeleteTargets targets={targets} setRows={setRows} />
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

export default function DeleteDialogButton(props: Props) {
  const [open, setOpen] = React.useState(false);

  const handleClickOpen = () => {
    setOpen(true);
  };

  const handleClose = () => {
    setOpen(false);
  };

  return (
    <>
      <Tooltip title="Delete selected target(s)">
        <IconButton aria-label="help" color={props.color ?? 'default'} onClick={handleClickOpen}>
          <DeleteIcon />
        </IconButton>
      </Tooltip>
      <DeleteTargetsDialog
        open={open}
        setRows={props.setRows}
        targets={props.targets}
        handleClose={handleClose}
      />
    </>
  );
}