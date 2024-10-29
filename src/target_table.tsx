import * as React from 'react';
import Box from '@mui/material/Box';
import DeleteIcon from '@mui/icons-material/DeleteOutlined';
import { ErrorObject } from 'ajv/dist/2019'
import { EditToolbar } from './table_toolbar.tsx';
import {
  GridRowModesModel,
  GridRowModes,
  DataGridPro,
  GridColDef,
  GridActionsCellItem,
  GridEventListener,
  GridRowId,
  useGridApiContext,
  useGridApiEventHandler,
  GridRowParams,
  GRID_CHECKBOX_SELECTION_COL_DEF,
  GridRowSelectionModel,
  GridValueParser,
  GridValueSetter,
  GridCellEditStopParams,
  GridRowModel,
} from '@mui/x-data-grid-pro';
import target_schema from './target_schema.json';
import ValidationDialogButton, { validate } from './validation_check_dialog';
import SimbadButton from './simbad_button';
import { useDebounceCallback } from './use_debounce_callback.tsx';
import { Target, useStateContext } from './App.tsx';
import TargetEditDialogButton, { format_edit_entry, PropertyProps, raDecFormat, rowSetter, TargetProps } from './target_edit_dialog.tsx';
import { TargetVizButton } from './two-d-view/viz_chart.tsx';
import { delete_target, submit_target } from './api/api_root.tsx';


function convert_schema_to_columns() {
  const columns: GridColDef[] = []
  Object.entries(target_schema.properties).forEach(([key, valueProps]: [string, any]) => {
    // format value for display
    const valueParser: GridValueParser = (value: any) => {
      if (['number', 'integer'].includes(valueProps.type)) {
        return Number(value)
      }
      if (value && ['ra', 'dec'].includes(key)) {
        key === 'ra' && String(value).replace(/[^+-]/, "")
        value = raDecFormat(value as string)
      }
      return value
    }

    //use to update other values when this value is changed (e.g. ra/dec change -> degRa/degDec update)
    const valueSetter: GridValueSetter<Target> = (value: any, tgt: Target) => {
      tgt = { ...tgt, [key]: value }
      return tgt
    }
    let col = {
      field: key,
      valueParser,
      valueSetter,
      description: valueProps.description,
      type: valueProps.type,
      headerName: valueProps.short_description ?? valueProps.description,
      width: 140,
      editable: valueProps.editable ?? true,
    } as GridColDef
    columns.push(col)
  });

  return columns;
}


export const submit_one_target = async (target: Target) => {
  const resp = await submit_target([target])
  if (resp.errors.length > 0) {
    console.error('errors', resp)
    throw new Error('error updating target')
  }
  const submittedTarget = resp.targets[0]
  return submittedTarget
}



export interface TargetsContext {
  targets: Target[];
  setTargets: React.Dispatch<React.SetStateAction<Target[]>>;
}

const init_target_context = {
  targets: [],
  setTargets: () => { }
}

const TargetContext = React.createContext<TargetsContext>(init_target_context);
export const useTargetContext = () => React.useContext(TargetContext);

export default function TargetTable() {
  const context = useStateContext()
  const [rows, setRows] = React.useState(context.targets as Target[]);
  const [rowModesModel, setRowModesModel] = React.useState<GridRowModesModel>({});
  const [rowSelectionModel, setRowSelectionModel] = React.useState<GridRowSelectionModel>([]);
  const cfg = context.config
  let columns = convert_schema_to_columns();
  const sortOrder = cfg.default_table_columns
  columns = columns.sort((a, b) => {
    return sortOrder.indexOf(a.field) - sortOrder.indexOf(b.field);
  });
  const visibleColumns = Object.fromEntries(columns.map((col) => {
    const visible = cfg.default_table_columns.includes(col.field)
    return [col.field, visible]
  }));
  const csvExportColumns = cfg.csv_order
  let pinnedColumns = cfg.pinned_table_columns
  const leftPin = [...new Set([GRID_CHECKBOX_SELECTION_COL_DEF.field, ...cfg.pinned_table_columns.left])]
  pinnedColumns.left = leftPin

  const edit_target = async (target: Target) => {
    console.log('debounced save', target)
    return await submit_one_target(target)
  }

  const debounced_save = useDebounceCallback(edit_target, 2000)

  const handleEditClick = (id: GridRowId) => () => {
    setRowModesModel({ ...rowModesModel, [id]: { mode: GridRowModes.Edit } });
  };

  const handleDeleteClick = async (id: GridRowId) => {
    const delRow = rows.find((row) => row._id === id);
    console.log('deleting', id, delRow)
    delRow && delete_target([delRow._id as string])
    setRows(() => {
      const newRows = rows.filter((row) => row._id !== id)
      return newRows
    });
  };

  const processRowUpdate = async (newRow: GridRowModel<Target>) => {
    //row is sent to DataGrid rows. Used to match row with what was edited.
    const newRows = rows.map((row) => (row._id === newRow._id ? newRow: row))
    setRows(newRows);
    return newRow;
  };

  const handleRowModesModelChange = (newRowModesModel: GridRowModesModel) => {
    setRowModesModel(newRowModesModel);
  };

  const ActionsCell = (params: GridRowParams<Target>) => {
    const { id, row } = params;
    const [editTarget, setEditTarget] = React.useState<Target>(row);
    const [count, setCount] = React.useState(0); //prevents scroll update from triggering save
    const [hasSimbad, setHasSimbad] = React.useState(row.tic_id || row.gaia_id ? true : false);
    validate(row)
    validate.errors && console.log('errors', validate.errors, row)
    const [errors, setErrors] = React.useState<ErrorObject<string, Record<string, any>, unknown>[]>(validate.errors ?? []);
    const debounced_edit_click = useDebounceCallback(handleEditClick, 500)
    const apiRef = useGridApiContext();

    const handleRowChange = async () => {
      if (count > 0) {
        let newTgt: Target | undefined = undefined
        const isEdited = editTarget.status?.includes('EDITED')
        processRowUpdate(editTarget) //TODO: May want to wait till save is successful
        if (isEdited) newTgt = await debounced_save(editTarget)
        if (newTgt) {
          newTgt.tic_id || newTgt.gaia_id && setHasSimbad(true)
          debounced_edit_click(id)
        }
      }
    }


    React.useEffect(() => { // when targed is edited in target edit dialog or simbad dialog
      handleRowChange()
      validate(editTarget)
      setErrors(validate.errors ?? [])
      validate.errors && console.log('errors', validate.errors, editTarget)
      setCount((prev: number) => prev + 1)
    }, [editTarget])



    //NOTE: cellEditStop is fired when a cell is edited and focus is lost. but all cells are updated.
    const handleEvent: GridEventListener<'cellEditStop'> = (params: GridCellEditStopParams) => {
      setTimeout(() => { //wait for cell to update before setting editTarget
        let value = apiRef.current.getCellValue(id, params.field);
        let type = (target_schema.properties as TargetProps)[params.field as keyof PropertyProps].type
        // convert type to string if array
        const changeDetected = editTarget[params.field as keyof Target] !== value
        if (changeDetected) {
          const isNumber = type.includes('number') || type.includes('integer')
          value = format_edit_entry(params.field, value, isNumber)
          const newTgt= rowSetter(editTarget, params.field, value)
          setEditTarget(newTgt)
        }
      }, 300)
    }

    useGridApiEventHandler(apiRef, 'cellEditStop', handleEvent)

    return [
      <SimbadButton hasSimbad={hasSimbad} target={editTarget} setTarget={setEditTarget} />,
      <TargetVizButton target={editTarget} />,
      <ValidationDialogButton errors={errors} target={editTarget} />,
      <TargetEditDialogButton
        target={editTarget}
        setTarget={setEditTarget}
      />,
      <GridActionsCellItem
        icon={<DeleteIcon />}
        label="Delete"
        onClick={() => handleDeleteClick(id)}
        color="inherit"
      />,
    ];
  }

  const addColumns: GridColDef[] = [
    {
      field: 'actions',
      type: 'actions',
      editable: false,
      headerName: 'Actions',
      width: 250,
      disableExport: true,
      cellClassName: 'actions',
      getActions: ActionsCell,
    }
  ];

  columns = [...addColumns, ...columns];

  return (
    <TargetContext.Provider value={{ targets: rows, setTargets: setRows }}>
      <Box
        sx={{
          height: 500,
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
          <DataGridPro
            getRowId={(row) => row._id}
            //disableRowSelectionOnClick // turned off for now to allow row edit
            processRowUpdate={processRowUpdate}
            checkboxSelection
            rows={rows ?? []}
            columns={columns}
            rowModesModel={rowModesModel}
            onRowModesModelChange={handleRowModesModelChange}
            slots={{
              //@ts-ignore
              toolbar: EditToolbar,
            }}
            onRowSelectionModelChange={(newRowSelectionModel) => {
              console.log('row selection', newRowSelectionModel)
              setRowSelectionModel(newRowSelectionModel);
            }}
            rowSelectionModel={rowSelectionModel}
            slotProps={{
              toolbar: {
                setRows,
                processRowUpdate,
                setRowModesModel,
                obsid: context.obsid, //TODO: allow admin to edit obsid
                csvOptions: { fields: csvExportColumns, allColumns: true, fileName: `MyTargets` },
                selectedTargets: rowSelectionModel.map((id) => {
                  return rows.find((row) => row._id === id)
                })
              },
            }}
            initialState={{
              pinnedColumns: pinnedColumns,
              columns: {
                columnVisibilityModel:
                  visibleColumns
              }
            }}
          />
        )}
      </Box>
    </TargetContext.Provider>
  );
}
