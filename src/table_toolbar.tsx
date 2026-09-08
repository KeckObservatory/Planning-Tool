import * as React from 'react';
import target_schema from './target_schema.json';
import AddIcon from '@mui/icons-material/Add';
import { TargetWizardButton } from './target_wizard';
import { TargetVizButton } from './two-d-view/viz_dialog.tsx';
import {
  GridApi,
  GridRowId,
  GridToolbarContainer,
  GridToolbarExportContainer,
  GridExportMenuItemProps,
  GridRowModel,
  GridToolbar,
  GridToolbarProps,
  ToolbarPropsOverrides
} from '@mui/x-data-grid';
import { v4 as randomId } from 'uuid';
import MenuItem from '@mui/material/MenuItem';
import Button, { ButtonProps } from '@mui/material/Button';
import { Target, useSnackbarContext, useStateContext, ViewMode } from './App.tsx';
import { Stack, Autocomplete, TextField, Switch, FormControlLabel, Tooltip } from '@mui/material';
import { useQueryParam, withDefault } from 'use-query-params';
import { ViewParam } from './target_table.tsx';
import ViewTargetsDialogButton from './two-d-view/view_targets_dialog.tsx';
import DeleteDialogButton from './delete_rows_dialog.tsx';
import { ExportTargetsNameDialog, StarListExportDirMenu } from './starlist_export_to_dir.tsx';
import TagDialogButton from './tag_dialog.tsx';
import SemidDialogButton from './semid_dialog.tsx';
import { SemidSelect } from './semid_select.tsx';
import { GuideStarButton } from './guide_star/guide_star_dialog.tsx';
import { TARGET_LENGTH, TARGET_NAME_LENGTH_PADDED } from './two-d-view/constants.tsx';
import { StarlistSubmissionDialog } from './starlist_submission/starlist_submission_dialog.tsx';


const convert_target_to_targetlist_row = (target: Target, includeComments = true) => {
  //required params
  const name = (target.target_name ?? '').slice(0, TARGET_LENGTH).padEnd(TARGET_NAME_LENGTH_PADDED, " ") //columns 1-16 are text last column is a space
  const ra = target.ra?.replaceAll(':', ' ') ?? ''
  const dec = target.dec?.replaceAll(':', ' ') ?? ''
  const equinox = target.equinox ?? '2000'
  let row = `${name} ${ra} ${dec} ${equinox}`
  const valid = target.target_name && target.ra && target.dec && equinox
  row = valid ? row : '# INVALID row: ' + row
  //optional params
  row = target.v_mag ? row + ` vmag=${target.v_mag}` : row
  row = target.j_mag ? row + ` jmag=${target.j_mag}` : row
  row = target.g_mag ? row + ` gmag=${target.g_mag}` : row
  row = target.r_mag ? row + ` rmag=${target.r_mag}` : row
  row = target.b_mag ? row + ` bmag=${target.b_mag}` : row
  row = target.h_mag ? row + ` hmag=${target.h_mag}` : row
  row = target.k_mag ? row + ` kmag=${target.k_mag}` : row
  row = target.b_m_v_mag ? row + ` b-v=${target.b_m_v_mag}` : row
  row = target.b_m_r_mag ? row + ` b-r=${target.b_m_r_mag}` : row
  row = target.ra_offset != null && target.ra_offset !== '' ? row + ` raoffset=${target.ra_offset}` : row
  row = target.dec_offset != null && target.dec_offset !== '' ? row + ` decoffset=${target.dec_offset}` : row
  row = target.rotator_mode ? row + ` rotmode=${target.rotator_mode}` : row
  row = target.rotator_pa != null && target.rotator_pa !== '' ? row + ` rotdest=${target.rotator_pa}` : row
  row = target.telescope_wrap ? row + ` wrap=${target.telescope_wrap}` : row
  row = target.d_dec != null && target.d_dec !== '' ? row + ` ddec=${target.d_dec}` : row
  row = target.d_ra != null && target.d_ra !== '' ? row + ` dra=${target.d_ra}` : row
  row = target.pm_ra != null ? row + ` pmra=${target.pm_ra}` : row
  row = target.pm_dec != null ? row + ` pmdec=${target.pm_dec}` : row
  row = target.science_target ? row + ` target=${target.science_target}` : row
  if (target.lgs === '1') {
    row = row + ` lgs=1`
  }
  else if (target.lgs === '0') {
    row = row + ` lgs=0`
  }
  else { }
  //comment and tags go before the row
  if (includeComments) {
    row = target.comment ? `# ${name} comment: ${target.comment}\n` + row : row
    const tags = target.tags ?? []
    row = tags.length > 0 ? `# ${name} tags: ${tags.join(', ')}\n` + row : row
    const semids = target.semids ?? []
    row = semids.length > 0 ? `# ${name} semids: ${semids.join(', ')}\n` + row : row
  }
  return row
}

export const getStarlist = (targets: Target[], includeComments = true): string => {
  // Select rows and columns
  let rows = ""
  targets.forEach((target) => {
    const row = convert_target_to_targetlist_row(target, includeComments)
    rows += row + '\n'
  })
  return rows
}

const exportBlob = (blob: Blob, filename: string) => {
  // Save the blob in a json file
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();

  setTimeout(() => {
    URL.revokeObjectURL(url);
  });
};

function StarlistSubmissionMenu(props: ExportProps) {

  const [open, setOpen] = React.useState(false)

  return (
    <>
      <MenuItem
        onClick={() => {
          setOpen(true);
        }}
      >
        Send to LGS Submission Dialog
      </MenuItem>
      <StarlistSubmissionDialog {...props} open={open} handleClose={() => setOpen(false)} />
    </>
  )
}

function StarListExportMenu(props: ExportProps) {

  const { exportTargets } = props;
  const [open, setOpen] = React.useState(false);
  const [fileName, setFileName] = React.useState('starlist.txt');

  const onSubmit = () => {

    const txt = getStarlist(exportTargets);
    const blob = new Blob([txt], {
      type: 'text/json',
    });
    exportBlob(blob, fileName);
    setOpen(false);
    // Hide the export menu after the export
  }

  return (
    <>
      <MenuItem
        onClick={() => {
          setOpen(true);
        }}
      >
        Export Starlist Text File
      </MenuItem>
      <ExportTargetsNameDialog
        open={open}
        handleClose={() => setOpen(false)}
        handleSubmit={onSubmit}
        fileName={fileName}
        setFileName={setFileName}
      />
    </>
  );
}

export interface ExportProps extends GridExportMenuItemProps<{}> {
  exportTargets: Target[];
  hideMenu?: () => void;
}

function JsonExportMenuItem(props: ExportProps) {
  const { hideMenu } = props;
  const [open, setOpen] = React.useState(false);
  const [fileName, setFileName] = React.useState('targets.json');

  const onSubmit = () => {
    const targets = props.exportTargets;
    const blob = new Blob([JSON.stringify(targets, null, 2)], {
      type: 'text/json',
    });
    exportBlob(blob, fileName);
    setOpen(false);
    // Hide the export menu after the export
    hideMenu?.();
  }

  return (
    <>
      <MenuItem
        onClick={() => {
          setOpen(true);
        }}
      >
        Export JSON
      </MenuItem>
      <ExportTargetsNameDialog
        open={open}
        handleClose={() => setOpen(false)}
        handleSubmit={onSubmit}
        fileName={fileName}
        setFileName={setFileName}
      />
    </>
  );
}


interface ExportButtonProps extends ButtonProps {
  exportTargets: Target[];
}

function CustomExportButton(props: ExportButtonProps) {

  return (
    <GridToolbarExportContainer {...props} slotProps={{
      tooltip: {
        title: 'Export selected targets (or all if none selected)',
      }
    }}>
      <JsonExportMenuItem exportTargets={props.exportTargets} />
      <StarListExportMenu exportTargets={props.exportTargets} />
      <StarListExportDirMenu exportTargets={props.exportTargets} />
      <StarlistSubmissionMenu exportTargets={props.exportTargets} />
    </GridToolbarExportContainer>
  );
}

export const get_targets_from_selected_targets = (selectedTargets: Target[], targets: Target[]): Target[] => {
  const selectedTargetIds = new Set(selectedTargets.map((target) => target._id))
  //filter out targets that don't have ra and dec
  return targets.filter((target) => selectedTargetIds.has(target._id) && target.ra && target.dec)
}

// Reorders `rows` to match whatever the grid is currently sorted by (any column the user
// clicked, or the table's natural row order when unsorted) - not a fixed priority sort - so
// Submit/Export reflect the arrangement the user actually sees on screen. `sortedIds` only
// covers rows currently passing the tag filter, so anything filtered out of view is appended
// afterward in its original order rather than being dropped from the export.
//
// Takes the sorted id list as a value rather than pulling it from apiRef itself: the grid
// applies a new sort model inside its own layout effect, one render after the one that changed
// it, so a component that reads apiRef.current.getSortedRowIds() during its own render is
// always one sort behind and never catches up on its own. The caller is expected to keep
// `sortedIds` current via the grid's 'sortedRowsSet' event - see EditToolbar.
export const get_targets_in_table_order = (rows: Target[], sortedIds: GridRowId[]): Target[] => {
  if (sortedIds.length === 0) return rows
  const rowsById = new Map(rows.map((row) => [row._id, row]))
  const sorted = sortedIds
    .map((id) => rowsById.get(id as string))
    .filter((row): row is Target => row !== undefined)
  const sortedIdSet = new Set(sorted.map((row) => row._id))
  const remaining = rows.filter((row) => !sortedIdSet.has(row._id))
  return [...sorted, ...remaining]
}

export const create_new_target = (id?: string, obsid?: number, target_name?: string) => {
  let newTarget: Partial<Target> = {}
  Object.entries(target_schema.properties).forEach(([key, value]: [string, any]) => {
    newTarget[key as keyof Target] = value.default
  })
  // Fall back to a name derived from the (unique) id rather than the literal
  // string "undefined" - otherwise every blank new target submitted without
  // an explicit name shares the same target_name, which both trips the
  // client-side duplicate check and can collide server-side.
  const fallbackName = id ? `NEW_${id.slice(0, 8)}` : `NEW_${randomId().slice(0, 8)}`
  newTarget = {
    ...newTarget,
    obsid: obsid,
    _id: id,
    target_name: target_name ?? fallbackName,
    status: 'CREATED'
  }
  return newTarget as Target
}

export interface EditToolbarProps extends Partial<GridToolbarProps & ToolbarPropsOverrides> {
  rows: Target[];
  setRows: React.Dispatch<React.SetStateAction<Target[]>>;
  obsid: number;
  processRowUpdate: (newRow: GridRowModel<Target>) => Promise<GridRowModel<Target>>;
  submit_one_target: Function
  selectedTargets: Target[]
  uniqueTags: string[];
  selectedTagFilter: string | null;
  setSelectedTagFilter: React.Dispatch<React.SetStateAction<string | null>>;
  apiRef: React.RefObject<GridApi>;
}

export function EditToolbar(props: EditToolbarProps) {
  const { rows, setRows, selectedTargets, submit_one_target, uniqueTags, selectedTagFilter, setSelectedTagFilter } = props;

  const [viewMode, setViewMode] = useQueryParam<ViewMode>('view_mode', withDefault(ViewParam, 'non_ao' as ViewMode))

  const snackbarContext = useSnackbarContext()
  const stateContext = useStateContext()

  // Kept in sync via the grid's own 'sortedRowsSet' event, fired every time it finishes
  // (re)sorting - reading apiRef.current.getSortedRowIds() directly during render would return
  // whatever was sorted before the user's last click, since the grid applies a new sort model
  // in its own layout effect and nothing else causes this toolbar to re-render afterward.
  const [sortedRowIds, setSortedRowIds] = React.useState<GridRowId[]>([])
  React.useEffect(() => {
    const api = props.apiRef?.current
    if (!api) return
    setSortedRowIds(api.getSortedRowIds())
    return api.subscribeEvent('sortedRowsSet', () => {
      setSortedRowIds(api.getSortedRowIds())
    })
  }, [props.apiRef])

  // Guards against a double-click submitting two new targets before the
  // first request resolves, which would race on inserting into rows.
  const isAddingTargetRef = React.useRef(false);
  const [isAddingTarget, setIsAddingTarget] = React.useState(false);

  const handleAddTarget = async () => {
    if (isAddingTargetRef.current) {
      return;
    }
    isAddingTargetRef.current = true;
    setIsAddingTarget(true);
    try {
      const id = randomId();
      const newTarget = create_new_target(id, props.obsid)
      const submittedTarget = await submit_one_target(newTarget)
      if (!submittedTarget) {
        console.error('error submitting target')
        snackbarContext.setSnackbarMessage({ severity: 'error', message: 'Error adding target' })
        snackbarContext.setSnackbarOpen(true);
        return
      }
      setRows((oldRows) => {
        // The server is expected to return a fresh, unique _id for a newly
        // created target. If it instead reuses an _id already in the table,
        // inserting another row under that same id would make later deletes
        // of either row remove both (they'd share a getRowId key).
        if (oldRows.some((row) => row._id === submittedTarget._id)) {
          console.error('New target was returned with an _id that already exists in the table', submittedTarget)
          snackbarContext.setSnackbarMessage({ severity: 'error', message: 'Error adding target: server returned a duplicate id' })
          snackbarContext.setSnackbarOpen(true);
          return oldRows
        }
        return [submittedTarget, ...oldRows];
      });
      // Mirror the add into context.targets. TargetTable's per-target sync is
      // update-only (so a late save can't resurrect a deleted row), so a
      // genuine addition has to be inserted here.
      stateContext.setTargets && stateContext.setTargets((oldTargets) => {
        const existing = oldTargets ?? []
        if (existing.some((tgt) => tgt._id === submittedTarget._id)) {
          return existing
        }
        return [submittedTarget, ...existing]
      });
    } finally {
      isAddingTargetRef.current = false;
      setIsAddingTarget(false);
    }
  };

  // Reordered to match the grid's current sort (whatever column the user clicked, or the
  // table's natural order when unsorted) - `rows` is the raw state array, not the grid's
  // displayed (sorted) order - so Submit/Export reflect what's actually arranged on screen.
  const orderedRows = get_targets_in_table_order(rows, sortedRowIds)

  const vizTargets = selectedTargets.length > 0 ?
    get_targets_from_selected_targets(selectedTargets, orderedRows)
    :
    orderedRows.filter((target) => target.ra && target.dec)

  const exportTargets = props.selectedTargets.length > 0 ?
    get_targets_from_selected_targets(selectedTargets, orderedRows)
    : orderedRows

  return (
    // <GridToolbarContainer sx={{ justifyContent: 'center' }}>
    <GridToolbarContainer sx={{ justifyContent: 'space-between', p: 1 }}>
      <Stack justifyContent={'left'} direction="row" spacing={1}>
        <Button color="primary" startIcon={<AddIcon />} onClick={handleAddTarget} disabled={isAddingTarget}>
          Add Target
        </Button>
        <DeleteDialogButton setRows={setRows} targets={props.selectedTargets} color='primary' />
        <TagDialogButton targets={props.selectedTargets} />
        <SemidDialogButton targets={props.selectedTargets} />
        <TargetWizardButton />
        <CustomExportButton exportTargets={exportTargets} />
      </Stack>
      <Stack justifyContent={'center'} direction="row" spacing={1}>
        <ViewTargetsDialogButton targets={props.selectedTargets} color='primary' />
        <TargetVizButton targets={vizTargets} />
        <GuideStarButton targets={vizTargets} />
      </Stack>
      <Stack justifyContent={'right'} direction="row" spacing={1}>
        <Tooltip title="Toggle On to show AO relavent columns">
          <FormControlLabel
            label="AO"
            control={<Switch checked={viewMode === 'ao'} />}
            onChange={(_, checked) => setViewMode(checked ? 'ao' : 'non_ao')}
          />
        </Tooltip>
        <Autocomplete
          disablePortal
          options={uniqueTags}
          value={selectedTagFilter}
          onChange={(_, value) => setSelectedTagFilter(value)}
          sx={{ width: 200 }}
          renderInput={(params) => <TextField {...params} label="Filter by Tag" />}
        />
        <SemidSelect />
        <GridToolbar
          printOptions={{ disableToolbarButton: true }}
          csvOptions={{ disableToolbarButton: true }}
        />
      </Stack>
    </GridToolbarContainer>
  );
}