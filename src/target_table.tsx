import * as React from 'react';
import Box from '@mui/material/Box';
import DeleteIcon from '@mui/icons-material/DeleteOutlined';
import { ErrorObject, JSONSchemaType } from 'ajv/dist/2019'
import { EditToolbarProps, EditToolbar } from './table_toolbar.tsx';
import {
  GridRowModesModel,
  DataGrid,
  GridColDef,
  GridActionsCellItem,
  GridEventListener,
  GridRowId,
  GridRowParams,
  GridRowSelectionModel,
  GridValueParser,
  GridValueSetter,
  GridCellEditStopParams,
  GridRowModel,
  GridValueFormatter,
  GridSortModel,
  GridColumnVisibilityModel,
  useGridApiRef,
} from '@mui/x-data-grid';
import target_schema from './target_schema.json';
import ValidationDialogButton, { validate } from './validation_check_dialog';
import CatalogButton from './catalog_button.tsx';
import { useDebounceCallback } from './use_debounce_callback.tsx';
import { Target, useSnackbarContext, useStateContext, ViewMode } from './App.tsx';
import TargetEditDialogButton, { format_string_array, format_edit_entry, PropertyProps, rowSetter, TargetProps } from './target_edit_dialog.tsx';
import ViewTargetsDialogButton from './two-d-view/view_targets_dialog.tsx';
import { delete_target, submit_target } from './api/api_root.tsx';
import { format_target_property } from './upload_targets_dialog.tsx';
import { ra_dec_to_deg } from './two-d-view/sky_view_util.tsx';
import { Tooltip } from '@mui/material';
import { createEnumParam, useQueryParam, withDefault } from 'use-query-params';
import { DUPLICATE_COORD_TOLERANCE_DEG } from './two-d-view/constants.tsx';


export const convert_schema_to_columns = (schema: JSONSchemaType<Target>) => {
  const columns: GridColDef[] = []
  const properties = schema.properties as Record<string, PropertyProps>
  Object.entries(properties).forEach(([key, valueProps]) => {
    // format value for display
    const valueParser: GridValueParser = (value: unknown) => {
      value = format_target_property(key as keyof Target, value, valueProps)
      if (value && valueProps.type === 'array') { //convert array to string for display
        value = Array.isArray(value) ? (value as string[]).join(',') : value as string
      }
      if (value && key === 'ra' || key === 'dec') { //format ra/dec for display
        console.log('formatting', key, value)
        value = format_edit_entry(key, value as string, true)
        console.log('formatted value', value)
      }
      return value
    }

    const valueSetter: GridValueSetter<Target> = (value: unknown, tgt: Target) => {
      if (valueProps.type === 'array' && value) {
        value = Array.isArray(value) ? (value as string[]).join(',') : value as string
      }
      tgt = { ...tgt, [key]: value }
      if (key === 'ra') {
        tgt = { ...tgt, ra_deg: value ? ra_dec_to_deg(String(value)) : undefined }
      } else if (key === 'dec') {
        tgt = { ...tgt, dec_deg: value ? ra_dec_to_deg(String(value), true) : undefined }
      }
      return tgt
    }

    const valueFormatter: GridValueFormatter = (value) => {
      if ((key === 'ra' || key === 'dec') && typeof value === 'string') {
        const formattedValue = format_edit_entry(key, value)
        return formattedValue
      }
      return value
    }

    const editable = valueProps.type === 'array' ? false : !valueProps.not_editable_by_user
    let width = undefined
    if (key === 'ra' || key === 'dec') width = 150
    if (key === 'target_name') width = 200
    if (key === 'tags') width = 200
    let col = {
      field: key,
      valueParser,
      valueSetter,
      valueFormatter,
      description: valueProps.description,
      // enum-constrained fields (lgs, rotator_mode, telescope_wrap, ...) get a
      // dropdown editor instead of a free-text cell, same options as the edit dialog.
      type: valueProps.enum ? 'singleSelect' : (valueProps.type === 'array' ? 'string' : valueProps.type), //array cells are cast as string
      valueOptions: valueProps.enum,
      headerName: valueProps.short_description ?? valueProps.description,
      editable,
      width
    } as GridColDef

    // priority is typed number|string, so the grid would otherwise sort it as text
    if (key === 'priority') {
      col.sortComparator = (a, b) => priority_value({ priority: a } as Target) - priority_value({ priority: b } as Target)
      col.sortingOrder = ['desc', 'asc', null]
    }

    // ra/dec are stored as sexagesimal strings, so sort by their degree value instead of lexically
    if (key === 'ra' || key === 'dec') {
      col.sortComparator = (a, b) => ra_dec_sort_value(a as string, key === 'dec') - ra_dec_sort_value(b as string, key === 'dec')
    }

    columns.push(col)
  });

  return columns;
}

const ra_dec_sort_value = (value: string | undefined | null, isDec: boolean): number => {
  if (!value) return -Infinity
  const deg = ra_dec_to_deg(value, isDec)
  return Number.isFinite(deg) ? deg : -Infinity
}

export const priority_value = (tgt: Target): number => {
  const priority = Number(tgt.priority)
  return Number.isFinite(priority) ? priority : 0
}

export const sort_by_priority = (targets: Target[]): Target[] => {
  return [...targets].sort((a, b) => priority_value(b) - priority_value(a))
}


// Two targets are duplicates if they share a name, or sit within an arcsecond of
// each other.
export const is_duplicate_target = (a: Target, b: Target): boolean => {
  const sameName = !!a.target_name && a.target_name === b.target_name
  const sameCoords = a.ra_deg != null && a.dec_deg != null
    && b.ra_deg != null && b.dec_deg != null
    && Math.abs(a.ra_deg - b.ra_deg) < DUPLICATE_COORD_TOLERANCE_DEG
    && Math.abs(a.dec_deg - b.dec_deg) < DUPLICATE_COORD_TOLERANCE_DEG
  return sameName || sameCoords
}

export const find_duplicate_target_names = (targets: Target[]): Set<string> => {
  const duplicateNames = new Set<string>()
  for (let i = 0; i < targets.length; i++) {
    const a = targets[i]
    for (let j = i + 1; j < targets.length; j++) {
      const b = targets[j]
      if (is_duplicate_target(a, b)) {
        a.target_name && duplicateNames.add(a.target_name)
        b.target_name && duplicateNames.add(b.target_name)
      }
    }
  }
  return duplicateNames
}

const is_blank = (value: unknown): boolean => {
  return value === undefined || value === null || value === ''
    || (Array.isArray(value) && value.length === 0)
}

const UNMERGEABLE_KEYS: string[] = ['_id', 'status']

// Left-hand merge
export const merge_targets = (target: Target, duplicates: Target[]): { merged: Target, filledKeys: string[] } => {
  let merged = { ...target }
  const filledKeys: string[] = []
  duplicates.forEach((duplicate) => {
    Object.entries(duplicate).forEach(([key, value]) => {
      if (UNMERGEABLE_KEYS.includes(key)) return
      if (is_blank(value)) return
      if (!is_blank(merged[key as keyof Target])) return
      merged = { ...merged, [key]: value }
      filledKeys.push(key)
    })
  })
  return { merged, filledKeys }
}

export interface RowsContext {
  rows: Target[];
  setRows: React.Dispatch<React.SetStateAction<Target[]>>;
}

const init_rows_context = {
  rows: [],
  setRows: () => { }
}

const RowsContext = React.createContext<RowsContext>(init_rows_context);
export const useRowsContext = () => React.useContext(RowsContext);

export const ViewParam = createEnumParam<ViewMode>(['ao', 'non_ao'])

interface TargetTableProps {
  targets: Target[];
}

const get_unique_tags= (rows: Target[]): string[] => {
  const tagsSet = new Set<string>();
  rows.forEach(row => {
    if (row.tags && Array.isArray(row.tags)) {
      row.tags.forEach(tag => tagsSet.add(tag));
    }
  });
  return Array.from(tagsSet).sort();
};

export default function TargetTable(props: TargetTableProps) {
  const { targets } = props
  const context = useStateContext()
  const sbcontext = useSnackbarContext();
  const [rows, setRows] = React.useState(targets as Target[]);
  const [rowModesModel, setRowModesModel] = React.useState<GridRowModesModel>({});
  const [rowSelectionModel, setRowSelectionModel] = React.useState<GridRowSelectionModel>([]);
  const [sortModel, setSortModel] = React.useState<GridSortModel>([]);
  const [selectedTagFilter, setSelectedTagFilter] = React.useState<string | null>(null);
  const apiRef = useGridApiRef();
  const cfg = context.config

  const [viewMode] = useQueryParam<ViewMode>('view_mode', withDefault(ViewParam, 'non_ao' as ViewMode))
  const baseColumns = React.useMemo(() => {
    const columns = convert_schema_to_columns(target_schema as unknown as JSONSchemaType<Target>);
    const leftPinnedFields = cfg.pinned_table_columns.left.filter((field) => field !== 'selected')
    if (viewMode === 'ao') {
      leftPinnedFields.push('lgs')
    }
    const rightPinnedFields = cfg.pinned_table_columns.right
    const defaultFields = cfg.default_table_columns[viewMode].filter((field) => !leftPinnedFields.includes(field))
    const remainingFields = columns
      .map((col) => col.field)
      .filter((field) => ![...leftPinnedFields, ...defaultFields, ...rightPinnedFields].includes(field))
    const sortOrder = [...leftPinnedFields, ...remainingFields, ...defaultFields, ...rightPinnedFields]
    return columns.sort((a, b) => {
      return sortOrder.indexOf(a.field) - sortOrder.indexOf(b.field);
    });
  }, [viewMode, cfg])

  const visibleColumns = React.useMemo(() => Object.fromEntries(baseColumns.map((col) => {
    const visible = cfg.default_table_columns[viewMode].includes(col.field)
    return [col.field, visible]
  })), [baseColumns, viewMode, cfg]);
  const [visibilityOverrides, setVisibilityOverrides] = React.useState<Partial<Record<ViewMode, GridColumnVisibilityModel>>>({})
  const columnVisibilityModel = visibilityOverrides[viewMode] ?? visibleColumns

  const handleColumnVisibilityModelChange = (newModel: GridColumnVisibilityModel) => {
    setVisibilityOverrides((prev) => ({ ...prev, [viewMode]: newModel }))
  }
  const update_context_target = (target: Target) => {
    context.setTargets && context.setTargets((oldTargets) => {
      if (!oldTargets?.some((tgt) => tgt._id === target._id)) {
        return oldTargets
      }
      return oldTargets.map((tgt) => (tgt._id === target._id ? target : tgt))
    })
  }

  const submit_one_target = async (target: Target) => {
    const resp = await submit_target([target])
    if (resp.errors.length > 0) {
      throw new Error('error updating target')
    }
    const submittedTarget = resp.targets.at(0)
    // The grid is keyed solely on _id, so a target that comes back without one
    // would share an `undefined` key with every other such row - deleting any
    // one of them would then remove all of them. Fall back to the id we sent.
    if (submittedTarget && !submittedTarget._id) {
      console.error('submit_target returned a target with no _id; falling back to the submitted id', { sent: target, received: submittedTarget })
      submittedTarget._id = target._id
    }
    //update target in rows
    setRows((oldRows) => oldRows.map((tgt) => {
      return tgt._id === submittedTarget?._id ?
        submittedTarget : tgt
    }))
    if (submittedTarget) {
      update_context_target(submittedTarget)
    }
    return submittedTarget
  }


  const edit_target = async (target: Target) => {
    const resp = await submit_one_target(target)
    return resp
  }

  const merge_duplicates = async (target: Target) => {
    const duplicates = rows.filter((row) => row._id !== target._id && is_duplicate_target(target, row))
    if (duplicates.length === 0) {
      sbcontext.setSnackbarMessage({ severity: 'info', message: 'No duplicates left to merge' })
      sbcontext.setSnackbarOpen(true)
      return
    }
    const { merged, filledKeys } = merge_targets(target, duplicates)
    const duplicateIds = duplicates.map((tgt) => tgt._id).filter((id) => !!id)
    try {
      if (filledKeys.length > 0) {
        await edit_target({ ...merged, status: 'EDITED' })
      }
      const resp = await delete_target(duplicateIds)
      if (resp.status !== 'SUCCESS') {
        // The rows stay put: dropping them locally after a failed delete is what
        // makes a target reappear on the next refresh.
        console.error('error deleting duplicate targets', resp)
        sbcontext.setSnackbarMessage({
          severity: 'error',
          message: 'Merged the target, but its duplicate(s) could not be deleted'
        })
        sbcontext.setSnackbarOpen(true)
        return
      }
      setRows((oldRows) => oldRows.filter((row) => !duplicateIds.includes(row._id)))
      context.setTargets && context.setTargets((oldTargets) => {
        const remaining = (oldTargets ?? []).filter((tgt) => !duplicateIds.includes(tgt._id))
        return remaining.length === (oldTargets?.length ?? 0) ? oldTargets : remaining
      })
      const mergedFields = filledKeys.length > 0 ? `Merged ${filledKeys.join(', ')} and deleted` : 'Deleted'
      sbcontext.setSnackbarMessage({
        severity: 'success',
        message: `${mergedFields} ${duplicateIds.length} duplicate target(s)`
      })
      sbcontext.setSnackbarOpen(true)
    } catch (err) {
      console.error('Failed to merge duplicate targets', err)
      sbcontext.setSnackbarMessage({
        severity: 'error',
        message: `Failed to merge ${target.target_name || 'target'} with its duplicate(s)`
      })
      sbcontext.setSnackbarOpen(true)
    }
  }

  const duplicateNames = React.useMemo(() => find_duplicate_target_names(rows), [rows])

  React.useEffect(() => { // when semid is changed
    setRows(targets)
  }, [targets])

  const handleDeleteClick = async (id: GridRowId) => {
    // Deleting by a null/undefined id would match every row that is also
    // missing an _id, removing all of them instead of just this one.
    if (id === undefined || id === null || id === '') {
      console.error('refusing to delete: row has no _id', { id, rows })
      sbcontext.setSnackbarMessage({ severity: 'error', message: 'Cannot delete target: it has no id' })
      sbcontext.setSnackbarOpen(true)
      return
    }
    const delRow = rows.find((row) => row._id === id);
    console.log('deleting', id, delRow)
    delRow && delete_target([delRow._id as string])
    setRows((oldRows) => oldRows.filter((row) => row._id !== id));
    context.setTargets && context.setTargets((oldTargets) => {
      // Returning the same array when nothing matched matters: filter() allocates a
      // new one unconditionally, and a fresh reference re-fires the [targets] effect
      // below, which resets rows from context.targets and drops any row that only
      // lives in rows.
      const remaining = (oldTargets ?? []).filter((tgt) => tgt._id !== id)
      return remaining.length === (oldTargets?.length ?? 0) ? oldTargets : remaining
    });
  };

  const processRowUpdate = async (newRow: GridRowModel<Target>) => {
    //row is sent to DataGrid rows. Used to match row with what was edited.
    setRows((oldRows) => oldRows.map((row) => (row._id === newRow._id ? newRow : row)));
    update_context_target(newRow);
    return newRow;
  };

  const editedFieldRef = React.useRef<string | undefined>(undefined)

  const handleCellEditStop: GridEventListener<'cellEditStop'> = (params: GridCellEditStopParams) => {
    editedFieldRef.current = params.field
  }

  const handleProcessRowUpdate = async (newRow: GridRowModel<Target>, oldRow: GridRowModel<Target>) => {
    const field = editedFieldRef.current
    editedFieldRef.current = undefined
    const changed = !!field && newRow[field as keyof Target] !== oldRow[field as keyof Target]
    if (!changed) { // focus moved without an edit, or the edit was cancelled
      processRowUpdate(newRow)
      return newRow
    }

    const fieldProps = (target_schema.properties as TargetProps)[field]
    let value: unknown = newRow[field as keyof Target]
    if (fieldProps) {
      const type = fieldProps.type
      if (type === 'array') {
        value = format_string_array(Array.isArray(value) ? value.flat(Infinity) : String(value).split(','))
      } else {
        const isNumber = type.includes('number') || type.includes('integer')
        value = format_edit_entry(field, value as string | number, isNumber)
      }
    }
    const editedRow = rowSetter(newRow as Target, field, value as string | number | string[])

    processRowUpdate(editedRow)
    try {
      await edit_target(editedRow)
    } catch (err) {
      console.error('Failed to save target edit', err)
      sbcontext.setSnackbarMessage({
        severity: 'error',
        message: `Failed to save changes to ${editedRow.target_name || 'target'}`
      })
      sbcontext.setSnackbarOpen(true)
    }
    return editedRow;
  };

  const handleRowModesModelChange = (newRowModesModel: GridRowModesModel) => {
    setRowModesModel(newRowModesModel);
  };

  const validate_sanitized_target = (tgt: Target) => {
    let sanitizedTgt: Partial<Target> = {}
    Object.entries(tgt).forEach(([key, value]) => {
      //allow empty strings to be valid for non-required fields
      const required = value === "" && target_schema.required.includes(key)
      if (value === "" || value === undefined && required) {
        return
      }
      sanitizedTgt[key as keyof Target] = value
    })

    validate(sanitizedTgt as Target)
    return validate.errors ?? []
  }

  const autosizeOptions = {
    includeHeaders: true,
    includeOutliers: false,
    outliersFactor: 1.5,
    expand: false
  }

  const ActionsCell = (params: GridRowParams<Target>) => {
    const { id, row } = params;
    const [editTarget, setEditTarget] = React.useState<Target>(row);
    const [hasCatalog, setHasCatalog] = React.useState(row.tic_id || row.gaia_id ? true : false);
    const editTargetRef = React.useRef<Target>(editTarget);

    const errors = React.useMemo<ErrorObject<string, Record<string, any>, unknown>[]>(() => {
      return validate_sanitized_target(editTarget);
    }, [editTarget])

    // Keeps the ref current for the deferred readers (the debounced save and the
    // merge handler), which would otherwise close over a stale editTarget.
    React.useEffect(() => {
      editTargetRef.current = editTarget;
    }, [editTarget]);

    const handleRowChange = React.useCallback(async (target?: Target) => {
      const tgt = target ?? editTargetRef.current
      const isEdited = tgt.status?.includes('EDITED')
      if (!isEdited) {
        processRowUpdate(tgt)
        return
      }
      try {
        const newTgt = await edit_target(tgt)
        processRowUpdate(tgt)
        if (newTgt) {
          (newTgt.tic_id || newTgt.gaia_id) && setHasCatalog(true)
        }
      } catch (err) {
        console.error('Failed to save target edit', err)
        sbcontext.setSnackbarMessage({
          severity: 'error',
          message: `Failed to save changes to ${tgt.target_name || 'target'}`
        })
        sbcontext.setSnackbarOpen(true)
      }
    }, [id])

    const debouncedHandleRowChange = useDebounceCallback(handleRowChange, 2000)

    const externalSyncRef = React.useRef(false)

    React.useEffect(() => {
      // `row` is the authoritative copy in `rows`. Re-sync when it changes 
      if (row === editTargetRef.current || debouncedHandleRowChange.isPending()) {
        return
      }
      externalSyncRef.current = true
      setEditTarget(row)
    }, [row])

    const hasMountedRef = React.useRef(false)

    React.useEffect(() => { // when targed is edited in target edit dialog or catalog dialog
      // Skip the mount pass. 
      // every remaining call to the debounced save is now a genuine edit.
      if (!hasMountedRef.current) {
        hasMountedRef.current = true
        return
      }
      if (externalSyncRef.current) { // not a user edit - nothing to save back
        externalSyncRef.current = false
        return
      }
      debouncedHandleRowChange()
    }, [editTarget])

    // Cell edits are saved by handleProcessRowUpdate on the table.
    const catalogSetTarget = (updater: (prev: Target) => Target) => {
      const newTgt = updater(editTargetRef.current)
      setEditTarget(newTgt)
      handleRowChange(newTgt) //save immediately
      setHasCatalog(newTgt.tic_id || newTgt.gaia_id ? true : false)
    }

    return [
      <CatalogButton key="catalog" hasCatalog={hasCatalog} target={editTarget} setTarget={catalogSetTarget} />,
      <ViewTargetsDialogButton key="view" targets={[editTarget]} />,
      <ValidationDialogButton
        key="validation"
        errors={errors}
        target={editTarget}
        isDuplicate={!!editTarget.target_name && duplicateNames.has(editTarget.target_name)}
        onMerge={() => merge_duplicates(editTargetRef.current)}
      />,
      <TargetEditDialogButton
        key="edit"
        target={editTarget}
        setTarget={setEditTarget}
      />,
      <GridActionsCellItem
        key="delete"
        icon={
          <Tooltip title="Delete target from database">
            <DeleteIcon />
          </Tooltip>
        }
        label="Delete"
        onClick={() => handleDeleteClick(id)}
        color="inherit"
      />,
    ];
  }

  const actionsCellRef = React.useRef(ActionsCell)
  actionsCellRef.current = ActionsCell

  const columns = React.useMemo((): GridColDef[] => [
    {
      field: 'actions',
      type: 'actions',
      editable: false,
      headerName: 'Actions',
      width: 250,
      disableExport: true,
      cellClassName: 'actions',
      getActions: (params: GridRowParams<Target>) => actionsCellRef.current(params),
    },
    ...baseColumns
  ], [baseColumns]);

  const selectedTargets = rowSelectionModel.map((id) => {
    return rows.find((tgt) => tgt._id === id)
  }).filter((tgt) => tgt !== undefined) as Target[]

  const uniqueTags = get_unique_tags(rows);
  
  const filteredRows = selectedTagFilter
    ? rows.filter(row => row.tags && row.tags.includes(selectedTagFilter))
    : rows;

  return (
    <RowsContext.Provider value={{ rows: rows, setRows: setRows }}>
      <Box
        sx={{
          height: 1000,
          width: '100%',
          '& .actions': {
            color: 'text.secondary',
          },
          '& .textPrimary': {
            color: 'text.primary',
          },
        }}
      >
        {Object.keys(visibleColumns).length > 0 && (
          <DataGrid
            apiRef={apiRef}
            getRowId={(row: Target) => row._id}
            //disableRowSelectionOnClick // turned off for now to allow row edit
            processRowUpdate={handleProcessRowUpdate}
            onCellEditStop={handleCellEditStop}
            autosizeOptions={autosizeOptions}
            checkboxSelection
            rows={filteredRows ?? []}
            columns={columns}
            sortModel={sortModel}
            onSortModelChange={setSortModel}
            rowModesModel={rowModesModel}
            onRowModesModelChange={handleRowModesModelChange}
            slots={{
              //@ts-ignore
              toolbar: EditToolbar,
            }}
            //@ts-ignore
            onRowSelectionModelChange={(newRowSelectionModel) => {
              setRowSelectionModel(newRowSelectionModel);
            }}
            rowSelectionModel={rowSelectionModel}
            columnVisibilityModel={columnVisibilityModel}
            onColumnVisibilityModelChange={handleColumnVisibilityModelChange}
            slotProps={{
              // @ts-ignore
              toolbar: {
                rows,
                setRows,
                processRowUpdate,
                setRowModesModel,
                obsid: context.obsid,
                submit_one_target,
                selectedTargets,
                uniqueTags,
                selectedTagFilter,
                setSelectedTagFilter,
                apiRef
              } as EditToolbarProps,
            }}
            // pinnedColumns: pinnedColumns, // pro version only
          />
        )}
      </Box>
    </RowsContext.Provider>
  );
}
