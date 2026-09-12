import * as React from 'react';
import VisibilityIcon from '@mui/icons-material/Visibility';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import { Target } from '../App';
import { DialogComponent } from '../dialog_component';
import { LazyFallback } from '../lazy_fallback';

// plotly + aladin-lite live behind this import. Keep it lazy so they stay out of
// the initial bundle and only load when the dialog is first opened.
const TwoDView = React.lazy(() => import('./two_d_view'));


export interface VTDProps {
  open: boolean;
  handleClose: Function;
  targets: Target[];
}

function ViewTargetsDialog(props: VTDProps) {
  const { open, handleClose, targets } = props;

  const dialogTitle = (
    <div>Selected Target Charts</div>
  );

  const dialogContent = (
    <React.Suspense fallback={<LazyFallback />}>
      <TwoDView targets={targets} />
    </React.Suspense>
  )

  return (
    <DialogComponent 
      open={open}
      handleClose={handleClose}
      titleContent={dialogTitle}
      children={dialogContent}
      maxWidth="xl"
      paperMaxWidth={1700}
    />
  );
}

interface Props {
  targets: Target[];
  color?: 'inherit' | 'default' | 'primary' | 'secondary' | 'error' | 'info' | 'success' | 'warning';
}

export default function ViewTargetsDialogButton(props: Props) {
  const [open, setOpen] = React.useState(false);

  const handleClickOpen = () => {
    setOpen(true);
  };

  const handleClose = () => {
    setOpen(false);
  };

  return (
    <>
      <Tooltip title="Display visibility charts of selected target(s)">
        <IconButton aria-label="help" color={props.color ?? 'default'} onClick={handleClickOpen}>
          <VisibilityIcon />
        </IconButton>
      </Tooltip>
      <ViewTargetsDialog
        open={open}
        targets={props.targets}
        handleClose={handleClose}
      />
    </>
  );
}