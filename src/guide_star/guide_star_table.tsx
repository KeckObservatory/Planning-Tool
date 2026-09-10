import Box from '@mui/material/Box';
import AddIcon from '@mui/icons-material/Add';
import {
    DataGrid,
    GridColDef,
    GridRowParams,
    GridRowSelectionModel,
    useGridApiRef,
} from '@mui/x-data-grid';
import { Target, useSnackbarContext, useStateContext } from '../App.tsx';
import { v4 as randomId } from 'uuid';
import { convert_schema_to_columns } from '../target_table.tsx';
import { IconButton, Tooltip } from '@mui/material';
import React from 'react';
import { create_new_target } from '../table_toolbar.tsx';
import { submit_target } from '../api/api_root.tsx';
import target_schema from '../target_schema.json';
import { JSONSchemaType } from 'ajv/dist/2019';
import { DUPLICATE_COORD_TOLERANCE_DEG } from '../two-d-view/constants.tsx';

export const is_guidestar_already_added = (
    guidestar: Partial<Target>,
    science_target_name: string | undefined,
    existingTargets: Target[] | undefined,
): boolean => {
    if (!existingTargets) {
        return false;
    }
    // target_name is truncated to 15 chars when a guide star is submitted, so
    // compare against the same truncated form.
    const guidestarName = guidestar.target_name != null ? String(guidestar.target_name).slice(0, 15) : undefined;
    return existingTargets.some((t) => {
        if (t.science_target !== science_target_name) {
            return false;
        }
        if (guidestarName && t.target_name === guidestarName) {
            return true;
        }
        if (guidestar.ra_deg == null || guidestar.dec_deg == null || t.ra_deg == null || t.dec_deg == null) {
            return false;
        }
        return (
            Math.abs(t.ra_deg - guidestar.ra_deg) < DUPLICATE_COORD_TOLERANCE_DEG &&
            Math.abs(t.dec_deg - guidestar.dec_deg) < DUPLICATE_COORD_TOLERANCE_DEG 
        );
    });
}

interface AddGuideStarButtonProps {
    guidestar: Partial<Target>;
    science_target_name?: string;
    useLaser?: boolean;
}

const sanitize_guide_star = (guidestar: Partial<Target>) => {
    //remove nulls
    const sanitizedGuideStar = Object.fromEntries(Object.entries(guidestar).filter(([_, v]) => v != null));
    // target_name is capped at 15 chars per the schema.
    if (guidestar.target_name != null) {
        sanitizedGuideStar.target_name = String(guidestar.target_name).slice(0, 15)
    } else {
        delete sanitizedGuideStar.target_name
    }

    // Catalogs signal "no measurement" for a band with a magnitude >= 99.9 -
    // drop any such n_mag key rather than submitting a bogus magnitude.
    Object.entries(sanitizedGuideStar).forEach(([key, value]) => {
        if (/^._mag$/.test(key) && typeof value === 'number' && value >= 99.9) {
            delete sanitizedGuideStar[key]
        }
    })


    return sanitizedGuideStar
}

const AddGuideStarButton = (props: AddGuideStarButtonProps) => {
    const { guidestar, science_target_name } = props

    const context = useStateContext()
    const snackbarContext = useSnackbarContext()

    const alreadyAdded = is_guidestar_already_added(guidestar, science_target_name, context.targets);

    const isSubmittingRef = React.useRef(false);
    const [isSubmitting, setIsSubmitting] = React.useState(false);

    const handleClick = async () => {
        if (isSubmittingRef.current) {
            return;
        }
        isSubmittingRef.current = true;
        setIsSubmitting(true);
        try {
            const id = randomId();
            const sanitizedGuideStar = sanitize_guide_star(guidestar)

            let newTarget = create_new_target(id, context.obsid, guidestar.target_name)
            newTarget = {
                ...newTarget,
                ...sanitizedGuideStar,
                equinox: String(guidestar.equinox ?? '2000'),
                science_target: science_target_name,
            }
            const resp = await submit_target([newTarget])
            if (resp.errors.length > 0) {
                console.error('error submitting target')
                snackbarContext.setSnackbarMessage({ severity: 'error', message: 'Error adding target' })
                snackbarContext.setSnackbarOpen(true);
                return
            }
            snackbarContext.setSnackbarMessage({ severity: 'success', message: 'Guide star added successfully' })
            snackbarContext.setSnackbarOpen(true);
            // context.targets is the single source of truth for the target table:
            // TargetTable resets its own rows from it whenever it changes, so
            // adding here is what puts the guide star in the table.
            const addedTarget = resp.targets[0]
            context.setTargets && context.setTargets((oldTargets) => {
                const existing = oldTargets ?? []
                if (existing.some((tgt) => tgt._id === addedTarget._id)) {
                    return existing;
                }
                // Place the guide star directly beneath its science target if
                // that target is present, otherwise at the top of the list.
                const index = existing.findIndex(tgt => tgt.target_name === science_target_name);
                if (index === -1) {
                    return [addedTarget, ...existing];
                }
                const newTargets = [...existing];
                newTargets.splice(index + 1, 0, addedTarget);
                return newTargets;
            });
        } finally {
            isSubmittingRef.current = false;
            setIsSubmitting(false);
        }
    }

    return (
        <Tooltip title={alreadyAdded ? 'Already added to target list' : 'Add to target list'}>
            <span>
                <IconButton
                    color="primary"
                    onClick={handleClick}
                    disabled={isSubmitting}
                    sx={alreadyAdded ? { color: 'success.main' } : undefined}
                >
                    <AddIcon />
                </IconButton>
            </span>
        </Tooltip>
    )
}


interface Props {
    guidestars?: Partial<Target>[];
    science_target_name?: string;
    selectedGuideStarName?: string;
    setSelectedGuideStarName?: (name: string) => void;
    useLaser?: boolean;
}

export default function GuideStarTable(props: Props) {
    const { guidestars, selectedGuideStarName, setSelectedGuideStarName, science_target_name } = props;
    const context = useStateContext()
    const cfg = context.config
    const sortOrder = cfg.default_guide_star_table_columns;
    const [rowSelectModel, setRowSelectModel] = React.useState<GridRowSelectionModel>([]);
    const apiRef = useGridApiRef();

    React.useEffect(() => {
        setRowSelectModel(selectedGuideStarName ? [selectedGuideStarName] : [])

        if (!selectedGuideStarName) {
            return;
        }

        // Wait a frame so the grid has rendered/paginated before we measure it.
        const frame = requestAnimationFrame(() => {
            const api = apiRef.current;
            if (!api) {
                return;
            }
            const rowIndex = api.getRowIndexRelativeToVisibleRows(selectedGuideStarName);
            const dimensions = api.getRootDimensions();
            if (rowIndex === undefined || rowIndex === null || rowIndex < 0 || !dimensions?.isReady) {
                return;
            }
            const { rowHeight, viewportInnerSize } = dimensions;
            const rowTop = rowIndex * rowHeight;
            const totalHeight = api.getRowsCount() * rowHeight;
            // Try to center the row in the viewport, but clamp so we don't
            // overscroll past the top or bottom of the table.
            const desiredScrollTop = rowTop + rowHeight / 2 - viewportInnerSize.height / 2;
            const maxScrollTop = Math.max(0, totalHeight - viewportInnerSize.height);
            const scrollTop = Math.min(Math.max(desiredScrollTop, 0), maxScrollTop);
            api.scroll({ top: scrollTop });
        });
        return () => cancelAnimationFrame(frame);
    }, [selectedGuideStarName]);

    const ActionsCell = (params: GridRowParams<Partial<Target>>) => {
        const { row } = params;
        return [
            <AddGuideStarButton
                key="add"
                guidestar={row}
                science_target_name={science_target_name}
                useLaser={props.useLaser}
            />
        ];
    }

    const columns = React.useMemo(() => {
        let cols = convert_schema_to_columns(target_schema as unknown as JSONSchemaType<Target>)
            .map((col) => ({ ...col, width: col.field === 'target_name' ? 150 : 100 }))
        //add dist column - API returns degrees, display in arcseconds
        cols.push({
            field: 'dist',
            headerName: 'Separation (arcsec)',
            width: 150,
            type: 'number',
            valueFormatter: (value: number) => typeof value === 'number' ? (value * 3600).toFixed(2) : value,
        });
        cols.sort((a, b) => sortOrder.indexOf(a.field) - sortOrder.indexOf(b.field));

        const addColumns: GridColDef[] = [
            {
                field: 'actions',
                type: 'actions',
                editable: false,
                headerName: 'Add',
                width: 50,
                disableExport: true,
                cellClassName: 'actions',
                getActions: ActionsCell,
            }
        ];
        return [...addColumns, ...cols];
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sortOrder, science_target_name, props.useLaser]);

    const visibleColumns = React.useMemo(() => Object.fromEntries(columns.map((col) => {
        return [col.field, sortOrder.includes(col.field)]
    })), [columns, sortOrder]);

    return (
        <Box
            sx={{
                height: 600,
                width: '100%',
                '& .actions': {
                    color: 'text.secondary',
                },
                '& .textPrimary': {
                    color: 'text.primary',
                },
            }}
        >
            <DataGrid
                apiRef={apiRef}
                getRowId={(row: Partial<Target>) => row.target_name || row._id || `${row.ra_deg ?? ''},${row.dec_deg ?? ''}`}
                rows={guidestars ?? []}
                columns={columns}
                rowSelectionModel={rowSelectModel}
                onRowSelectionModelChange={(newRowSelectionModel) => {
                    setRowSelectModel(newRowSelectionModel);
                    setSelectedGuideStarName && setSelectedGuideStarName(newRowSelectionModel[0] as string);
                }}
                density="compact"
                initialState={{
                    columns: {
                        columnVisibilityModel:
                            visibleColumns
                    },
                    pagination: {
                        paginationModel: { pageSize: 100 }
                    }
                }}
                pageSizeOptions={[10, 25, 50, 100]}
            />
        </Box>
    );
}