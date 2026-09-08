import * as React from 'react';
import DialogTitle from '@mui/material/DialogTitle';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import Typography from '@mui/material/Typography';
import Tooltip from '@mui/material/Tooltip';
import ApprovalIcon from '@mui/icons-material/Approval';
import VerifiedIcon from '@mui/icons-material/Verified';
import LocalFireDepartmentIcon from '@mui/icons-material/LocalFireDepartment';
import target_schema from './target_schema.json'
import AJV2019, { ErrorObject } from 'ajv/dist/2019'
import { Target } from './App';
import { Button, IconButton } from '@mui/material';


export interface SimpleDialogProps {
  open: boolean;
  handleClose: Function;
  errors: ErrorObject<string, Record<string, any>, unknown>[];
  isDuplicate?: boolean;
  AOTgtHasPM?: boolean;
  targetName?: string;
  onMerge?: () => void | Promise<void>;
}

export interface Props {
  errors : ErrorObject<string, Record<string, any>, unknown>[];
  target : Target
  isDuplicate?: boolean;
  onMerge?: () => void | Promise<void>;
}

const ajv = new AJV2019({allErrors:true, allowUnionTypes: true})
ajv.addKeyword("short_description")
ajv.addKeyword("not_editable_by_user")
ajv.addKeyword("starlist_key")
let ts = target_schema as any
delete ts["$schema"]
export const validate = ajv.compile(ts)

const schema_properties: Record<string, any> = ts.properties

// A blank/unset pm_ra or pm_dec (undefined, null, '') must read as "no proper motion", not as
// a proper motion of NaN - Number(undefined) is NaN, and NaN != 0 is true, so a naive numeric
// comparison would treat every unset field as if it were a real, nonzero measurement. Also
// guards against a plain truthiness check (`value || ...`), which would treat the string "0"
// (what the edit dialog's number fields actually store) as truthy.
export const has_nonzero_value = (value: unknown): boolean => {
  if (value === undefined || value === null || value === '') return false
  const num = Number(value)
  return Number.isFinite(num) && num !== 0
}

// e.g. ['None', '1', '0'] -> "None, 1, or 0"
const format_allowed_values = (values: unknown[]): string => {
  const strs = values.map(String)
  if (strs.length <= 1) return strs.join('')
  if (strs.length === 2) return `${strs[0]} or ${strs[1]}`
  return `${strs.slice(0, -1).join(', ')}, or ${strs[strs.length - 1]}`
}

// Plain-English explanations for the schema's regex patterns, keyed by the exact
// pattern string ajv reports in err.params.pattern - a raw regex means nothing to
// most users. Falls back to a still-regex-free message for any pattern not listed.
const PATTERN_DESCRIPTIONS: Record<string, string> = {
  '^[\\+\\-]?\\d+\\.?\\d*$|^[\\+\\-]?\\.\\d+$|^\\.\\d+$|^\\d+\\.\\d+$': 'Must be a number',
  '^\\d+\\.?\\d*$|^[\\+\\-]?\\.\\d+$|^\\.\\d+$|^\\d+\\.\\d+$': 'Must be a number',
  '^\\w?\\d+\\.?\\d*$|^[\\+\\-]?\\.\\d+$|^\\.\\d+$|^\\d+\\.\\d+$': 'Must be a number',
  '^([\\-\\+]?\\d{2}:\\d{2}:\\d{2}\\.?\\d*)$': 'Must be in HH:MM:SS.SS format',
  '[\\w\\-\\s]+': 'Must contain only letters, numbers, spaces, and hyphens',
  '^[^,]+$': 'Must not contain a comma',
}

function ValidationDialog(props: SimpleDialogProps) {
  const { open, handleClose, onMerge } = props;
  const [isMerging, setIsMerging] = React.useState(false);

  const handleMerge = async () => {
    if (!onMerge || isMerging) return
    setIsMerging(true)
    try {
      await onMerge()
      handleClose()
    } finally {
      setIsMerging(false)
    }
  }

  return (
    <Dialog maxWidth="lg" onClose={() => handleClose()} open={open}>
      <DialogTitle>Target Validation Errors</DialogTitle>
      <DialogContent dividers>
        {props.AOTgtHasPM && (
          <Typography gutterBottom>
            {`Target: ${props.targetName ?? ''}. `}
            LGS or NGS target cannot have proper motion values.
          </Typography>
        )}
        {props.isDuplicate && (
          <Typography gutterBottom>
            {`Duplicate target found: ${props.targetName ?? ''}. `}
            No two targets can share a name, nor the same ra/dec within 1/2 arcsecond
          </Typography>
        )}
        {props.isDuplicate && onMerge && (
          <Tooltip title="Fill this target's blank fields from its duplicate(s), then delete the duplicate(s). Values this target already has are kept.">
            <span>
              <Button
                size="small"
                variant="outlined"
                color="warning"
                onClick={handleMerge}
                disabled={isMerging}
                sx={{ mb: 1, textTransform: 'none' }}
              >
                Merge with duplicate(s)
              </Button>
            </span>
          </Tooltip>
        )}
        {
          props.errors.map((err) => {
            let msg = err.message
            if (err.keyword === 'required') {
              msg = `${err.params.missingProperty}: ${err.message}`
            }
            if (err.keyword === 'type') {
              msg = `${err.instancePath.substring(1)}: ${err.message}`
            }
            if (err.keyword === 'pattern') {
              const friendly = PATTERN_DESCRIPTIONS[err.params.pattern as string] ?? 'is not formatted correctly'
              msg = `${err.instancePath.substring(1)}: ${friendly}`
            }
            if (err.keyword === 'enum') {
              const key = err.instancePath.substring(1)
              const label = schema_properties[key]?.short_description ?? key
              const allowedValues = format_allowed_values(err.params.allowedValues)
              msg = `${label} error: allowed values are: ${allowedValues}`
            }
            return (
              <Typography key={msg} gutterBottom>
                {msg}
              </Typography>)
          })
      }
      </DialogContent>
    </Dialog>
  );
}


export default function ValidationDialogButton(props: Props) {
  const [open, setOpen] = React.useState(false);
  const [icon, setIcon] = React.useState(<ApprovalIcon />)

  //AO targets cannot have proper motion values,
  // so if this is an AO target and it has PM values, it's a problem.
  const isLgsOrNgsTarget = Number(props.target?.lgs) === 0 || Number(props.target?.lgs) === 1
  const AOTgtHasPM = isLgsOrNgsTarget && (has_nonzero_value(props.target?.pm_ra) || has_nonzero_value(props.target?.pm_dec))

  const hasProblems = props.errors.length > 0 || !!props.isDuplicate || AOTgtHasPM

  React.useEffect(() => {
    if (hasProblems) {
      setIcon(<LocalFireDepartmentIcon color="warning" />)
    }
    else {
      setIcon(<VerifiedIcon color="success" />)
    }
  }, [props.target, props.errors, hasProblems])


  const handleClickOpen = () => {
    if (hasProblems) {
      setOpen(true);
    }
  };

  const handleClose = () => {
    setOpen(false);
  };

  return (
    <>
      <Tooltip title="Select to see target validation errors (if any)">
        <IconButton onClick={handleClickOpen}>
          {icon}
        </IconButton>
      </Tooltip>
      <ValidationDialog
        open={open}
        handleClose={handleClose}
        errors={props.errors}
        isDuplicate={props.isDuplicate}
        AOTgtHasPM={AOTgtHasPM}
        targetName={props.target?.target_name}
        onMerge={props.onMerge}
      />
    </>
  );
}