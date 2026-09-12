import * as React from 'react';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack'
import Paper from '@mui/material/Paper'
import Tooltip from '@mui/material/Tooltip'
import TextField from '@mui/material/TextField'
import { DialogComponent } from './dialog_component';
import {
    Autocomplete,
    Box,
    Typography
} from '@mui/material'
import EditIcon from '@mui/icons-material/Edit';
import CatalogButton from './catalog_button';
import target_schema from './target_schema.json'
import { Status, Target } from './App';
import { MuiChipsInput } from 'mui-chips-input';
import { ra_dec_to_deg } from './two-d-view/sky_view_util';
import { TARGET_LENGTH } from './two-d-view/constants';

interface Props {
    target: Target
    setTarget: React.Dispatch<React.SetStateAction<Target>> 
}

interface TargetEditProps extends Props {
    handleClose: Function
    open: boolean
}

interface Items extends PropertyProps {
    properties?: { [key: string]: PropertyProps }
}

export interface PropertyProps {
    description: string,
    type: string | string[],
    starlist_key?: string,
    short_description?: string,
    default?: unknown,
    pattern?: string,
    minLength?: number,
    maxLength?: number,
    not_editable_by_user?: boolean,
    enum?: string[],
    items?: Items
}

export interface TargetProps {
    [key: string]: PropertyProps
}

const targetProps = target_schema.properties as TargetProps

export const raDecFormat = (input: string) => {
    // Strip all characters from the input digits and keep pos/neg sign
    const sign = input.length > 0 ? input[0].replace(/[^+-]/, "") : ""
    input = input.replace(/[^0-9]+/g, "");

    // Based upon the length of the string, we add formatting as necessary
    var size = input.length;
    if (size < 2) {
        input = input;
    }
    else if (size < 3) {
        input = input + ':';
    } else if (size < 5) {
        input = input.substring(0, 2) + ':' + input.substring(2, 4) + ':';
    } else if (size < 6) {
        input = input.substring(0, 2) + ':' + input.substring(2, 4) + ':' + input.substring(4, 6);
    } else if (size < 7) {
        input = input.substring(0, 2) + ':' + input.substring(2, 4) + ':' + input.substring(4, 6) + '.';
    } else {
        //allow for up to 4 decimal places
        input = input.substring(0, 2) + ':' + input.substring(2, 4) + ':' + input.substring(4, 6) + '.' + input.substring(6, 10);
    }
    return sign + input;
}

function deg_to_dms(degrees: number) {
    const sign = degrees < 0 ? "-" : ""
    const absDeg = Math.abs(degrees)
    let deg = Math.floor(absDeg)
    deg = deg % 360
    const min = Math.floor((absDeg - deg) * 60)
    const sec = Math.floor((absDeg - deg - min / 60) * 3600)
    return `${sign}${deg}:${min}:${sec}`
}

function deg_to_hms(deg: number) {
    while (deg < 0) deg += 360 //convert to positive degrees
    deg = Math.abs(deg % 360)
    const hours = Math.floor(deg / 15)
    const minutes = Math.floor((deg % 15) * 4)
    const seconds = ((deg % 15) * 4 - minutes) * 60
    return `${hours}:${minutes}:${seconds}`
}

export const rowSetter = (tgt: Target, key: string, value?: string | number | boolean | string[]) => {

    let newTgt = { ...tgt, 'status': 'EDITED' as Status, [key]: value }
    switch (key) {
        case 'ra':
            const ra_deg = value ? ra_dec_to_deg(String(value)) : undefined
            newTgt = {
                ...newTgt,
                ra_deg: ra_deg
            };
            break;
        case 'dec':
            const dec_deg = value ? ra_dec_to_deg(String(value), true) : undefined
            newTgt = {
                ...newTgt,
                dec_deg: dec_deg
            };
            break;
        case 'ra_deg':
            newTgt = {
                ...newTgt, ra: value ? deg_to_hms(value as number) : undefined
            };
            break;
        case 'dec_deg':
            newTgt = { ...newTgt, dec: value ? deg_to_dms(value as number) : undefined };
            break;
    }
    return newTgt
}

const sanitize_number = (value: string) => {
    const pattern = /[^\d.-]/g
    value = value.replace(pattern, '')
    const split = value.split('.')
    if (split.length > 2) {
        value = value.split('.').reduce((acc, val, idx) => {
            console.log('acc', acc, 'val', val, 'idx', idx)
            if (idx === 0) {
                return val + acc
            }
            return acc + val //concatenate strings after first decimal
        }, '.')
    }
    return value
}

export const format_edit_entry = (key: string, value?: string | number, isNumber = false) => {
    //add trailing zero if string ends in a decimal 
    if (isNumber) {
        value = sanitize_number(String(value))
        console.log('value', value)
    }
    if (value && (key === 'ra' || key === 'dec')) {
        key === 'ra' && String(value).replace(/[^+-]/, "")
        value = raDecFormat(value as string)
    }
    if (value && key === 'target_name') {
        value = String(value).replace(/[^\w^\-^\s]+/g, '').replaceAll('^', '') //remove non alphanumeric characters
        value = value.slice(0, TARGET_LENGTH) //truncate to 15 characters
    }
    if (value && key === 'science_target') {
        value = String(value).replace(/[^\w^\-^\s]+/g, '').replaceAll('^', '') //remove non alphanumeric characters
        value = value.slice(0, TARGET_LENGTH) //truncate to 15 characters
    }

    value = String(value).replace(/\t/, '') //remove tabs
    return value
}

export const format_string_array = (array: string[]) => {
    const pattern = /[,]/g
    array = array ?? [] //if tags is undefined, set to empty array
    array = array.map((tag) => tag.trim().replace(pattern, '')).filter((str) => str.length > 0) //no empty strings or whitespace
    array = [...new Set(array)]
    return array
}

export const TargetEditDialog = (props: TargetEditProps) => {

    const { target, setTarget } = props
    const [hasCatalog, setHasCatalog] = React.useState(target.tic_id || target.gaia_id ? true : false)

    React.useEffect(() => {
        setHasCatalog(target.tic_id || target.gaia_id ? true : false)
    }, [target.tic_id, target.gaia_id])

    const handleTextChange = (key: string, value?: string | number, isNumber = false) => {
        value = format_edit_entry(key, value, isNumber)
        setTarget((prev: Target) => {
            return rowSetter(prev, key, value)
        })
    }

    const handleArrayChange = (key: string, value: string[]) => {
        value = format_string_array(value)
        setTarget((prev: Target) => {
            return rowSetter(prev, key, value)
        })
    }

    const input_label = (param: keyof Target, tooltip = false): string => {
        if (param.includes('.')) {
            const [parent, child] = param.split('.')
            const properties = (targetProps[parent as keyof Target] as unknown as TargetProps).properties
            const itemProperties = properties[child as keyof PropertyProps] as PropertyProps
            if (!itemProperties) {
                return ''
            }
            const childLabel = tooltip ? itemProperties.description
                :
                itemProperties?.short_description ?? itemProperties.description
            return childLabel
        }
        return tooltip ?
            targetProps[param].description
            :
            targetProps[param].short_description ?? targetProps[param].description
    }

    const handleCatalogChange = (updater: (prev: Target) => Target) => {
        setTarget(updater)
    }


    const rotOptions = targetProps.rotator_mode?.enum?.map((s) => { return { label: s } })
    const wrapOptions = targetProps.telescope_wrap?.enum?.map((s) => { return { label: s } })
    const lgsOptions = targetProps.lgs.enum?.map((s) => { return { label: s } })

    const titleContent = (
        <Stack direction='row' spacing={2}>
            <Typography
                component="h1"
                variant="h6"
                color="inherit"
                align='center'
                noWrap
            >
                Edit Target
            </Typography>
        </Stack>
    )

    const dialogContent = (
        <Stack sx={{
            paddingTop: '16px',
            display: 'flex',
            flexWrap: 'wrap',
        }}
            justifyContent='center'
            maxWidth='100%'
        >
            <Paper
                sx={{
                    padding: '12px',
                    margin: '6px',
                }}
                elevation={3}
            >
                <Box>
                    <Stack sx={{ marginBottom: '24px' }} width="100%" direction="row" justifyContent='center' spacing={2}>
                        <CatalogButton target={target} label={true} setTarget={handleCatalogChange} hasCatalog={hasCatalog} />
                        <Tooltip title={input_label('target_name', true)}>
                            <TextField
                                label={input_label('target_name')}
                                focused={target.target_name ? true : false}
                                id="target-name"
                                value={target.target_name}
                                sx={{ width: 200 }}
                                onChange={(event) => handleTextChange('target_name', event.target.value)}
                            />
                        </Tooltip>
                        <Tooltip title={input_label('priority', true)}>
                            <TextField
                                label={input_label('priority')}
                                focused={target.priority? true : false}
                                id="priority"
                                value={target.priority}
                                sx={{ width: 100 }}
                                onChange={(event) => handleTextChange('priority', event.target.value)}
                            />
                        </Tooltip>
                    </Stack>
                    <Stack sx={{ marginBottom: '24px' }} width="100%" direction="row" justifyContent='center' spacing={2}>
                        <Tooltip title={input_label('ra', true)}>
                            <TextField
                                label={input_label('ra')}
                                id="ra"
                                focused={target.ra ? true : false}
                                value={target.ra}
                                sx={{ width: 150 }}
                                onChange={(event) => handleTextChange('ra', event.target.value)}
                            />
                        </Tooltip>
                        <Tooltip title={input_label('dec', true)}>
                            <TextField
                                label={input_label('dec')}
                                id="dec"
                                focused={target.dec ? true : false}
                                value={target.dec}
                                sx={{ width: 150 }}
                                onChange={(event) => handleTextChange('dec', event.target.value)}
                            />
                        </Tooltip>
                        <Tooltip title={input_label('ra_deg', true)}>
                            <TextField
                                label={input_label('ra_deg')}
                                id="ra_deg"
                                focused={target.ra_deg ? true : false}
                                value={target.ra_deg}
                                sx={{ width: 125 }}
                                onChange={(event) => handleTextChange('ra_deg', event.target.value, true)}
                            />
                        </Tooltip>
                        <Tooltip title={input_label('dec_deg', true)}>
                            <TextField
                                label={input_label('dec_deg')}
                                id="dec_deg"
                                focused={target.dec_deg ? true : false}
                                value={target.dec_deg}
                                sx={{ width: 125 }}
                                onChange={(event) => handleTextChange('dec_deg', event.target.value)}
                            />
                        </Tooltip>
                    </Stack>
                    <Stack sx={{ marginBottom: '24px' }} width="100%" direction="row" justifyContent='center' spacing={2}>
                        <Tooltip title={input_label('v_mag', true)}>
                            <TextField
                                label={input_label('v_mag')}
                                id="v-magnitude"
                                focused={target.v_mag ? true : false}
                                value={target.v_mag}
                                sx={{ width: 125 }}
                                onChange={(event) => handleTextChange('v_mag', event.target.value, true)}
                            />
                        </Tooltip>
                        <Tooltip title={input_label('j_mag', true)}>
                            <TextField
                                label={input_label('j_mag')}
                                id="j-magnitude"
                                focused={target.j_mag ? true : false}
                                value={target.j_mag}
                                sx={{ width: 125 }}
                                onChange={(event) => handleTextChange('j_mag', event.target.value, true)}
                            />
                        </Tooltip>
                        <Tooltip title={input_label('g_mag', true)}>
                            <TextField
                                label={input_label('g_mag')}
                                id="g-magnitude"
                                focused={target.g_mag ? true : false}
                                value={target.g_mag}
                                sx={{ width: 125 }}
                                onChange={(event) => handleTextChange('g_mag', event.target.value, true)}
                            />
                        </Tooltip>
                    </Stack>
                    <Stack sx={{ marginBottom: '24px' }} width="100%" direction="row" justifyContent='center' spacing={2}>
                        <Tooltip title={input_label('r_mag', true)}>
                            <TextField
                                label={input_label('r_mag')}
                                id="r-magnitude"
                                focused={target.r_mag ? true : false}
                                value={target.r_mag}
                                sx={{ width: 125 }}
                                onChange={(event) => handleTextChange('r_mag', event.target.value, true)}
                            />
                        </Tooltip>
                        <Tooltip title={input_label('b_mag', true)}>
                            <TextField
                                label={input_label('b_mag')}
                                id="b-magnitude"
                                focused={target.b_mag ? true : false}
                                value={target.b_mag}
                                sx={{ width: 125 }}
                                onChange={(event) => handleTextChange('b_mag', event.target.value, true)}
                            />
                        </Tooltip>
                    </Stack>
                    <Stack sx={{ marginBottom: '24px' }} width="100%" direction="row" justifyContent='center' spacing={2}>
                        <Tooltip title={input_label('h_mag', true)}>
                            <TextField
                                label={input_label('h_mag')}
                                id="h-magnitude"
                                focused={target.h_mag ? true : false}
                                value={target.h_mag}
                                sx={{ width: 125 }}
                                onChange={(event) => handleTextChange('h_mag', event.target.value, true)}
                            />
                        </Tooltip>
                        <Tooltip title={input_label('k_mag', true)}>
                            <TextField
                                label={input_label('k_mag')}
                                id="k-magnitude"
                                focused={target.k_mag ? true : false}
                                value={target.k_mag}
                                sx={{ width: 125 }}
                                onChange={(event) => handleTextChange('k_mag', event.target.value, true)}
                            />
                        </Tooltip>
                    </Stack>
                    <Stack sx={{ marginBottom: '24px' }} width="100%" direction="row" justifyContent='center' spacing={2}>
                        <Tooltip title={input_label('b_m_v_mag', true)}>
                            <TextField
                                label={input_label('b_m_v_mag')}
                                id="b-m-v-magnitude"
                                focused={target.b_m_v_mag ? true : false}
                                value={target.b_m_v_mag}
                                sx={{ width: 125 }}
                                onChange={(event) => handleTextChange('b_m_v_mag', event.target.value, true)}
                            />
                        </Tooltip>
                        <Tooltip title={input_label('b_m_r_mag', true)}>
                            <TextField
                                label={input_label('b_m_r_mag')}
                                id="b-m-r-magnitude"
                                focused={target.b_m_r_mag ? true : false}
                                value={target.b_m_r_mag}
                                sx={{ width: 125 }}
                                onChange={(event) => handleTextChange('b_m_r_mag', event.target.value, true)}
                            />
                        </Tooltip>
                    </Stack>
                    <Stack sx={{ marginBottom: '24px' }} width="100%" direction="row" justifyContent='center' spacing={2}>
                        <Tooltip title={input_label('ra_offset', true)}>
                            <TextField
                                label={input_label('ra_offset')}
                                id="ra_offset"
                                focused={target.ra_offset ? true : false}
                                value={target.ra_offset}
                                sx={{ width: 150 }}
                                onChange={(event) => handleTextChange('ra_offset', event.target.value, true)}
                            />
                        </Tooltip>
                        <Tooltip title={input_label('dec_offset', true)}>
                            <TextField
                                label={input_label('dec_offset')}
                                id="dec_offset"
                                focused={target.dec_offset ? true : false}
                                value={target.dec_offset}
                                sx={{ width: 150 }}
                                onChange={(event) => handleTextChange('dec_offset', event.target.value, true)}
                            />
                        </Tooltip>
                        <Tooltip title={input_label('rotator_mode', true)}>
                            <Autocomplete
                                disablePortal
                                id="rotator-mode"
                                value={target.rotator_mode ? { label: target.rotator_mode } : null}
                                onChange={(_, value) => handleTextChange('rotator_mode', value?.label)}
                                options={rotOptions ?? []}
                                sx={{ width: 150 }}
                                renderInput={(params) => <TextField {...params} label={input_label('rotator_mode')} />}
                            />
                        </Tooltip>
                        {target.rotator_mode === 'pa' &&
                            (
                                <Tooltip title={input_label('rotator_pa', true)}>
                                    <TextField
                                        label={input_label('rotator_pa')}
                                        id="rotator-pa"
                                        sx={{ width: 125 }}
                                        value={target.rotator_pa}
                                        onChange={(event) => handleTextChange('rotator_pa', event.target.value, true)}
                                    />
                                </Tooltip>

                            )

                        }
                        <Tooltip title={input_label('telescope_wrap', true)}>
                            <Autocomplete
                                disablePortal
                                id="telescope-wrap"
                                value={target.telescope_wrap ? { label: target.telescope_wrap } : null}
                                onChange={(_, value) => handleTextChange('telescope_wrap', value?.label)}
                                options={wrapOptions ?? []}
                                sx={{ width: 175 }}
                                renderInput={(params) => <TextField {...params} label={input_label('telescope_wrap')} />}
                            />
                        </Tooltip>
                    </Stack>
                    <Stack sx={{ marginBottom: '24px' }} width="100%" direction="row" justifyContent='center' spacing={2}>
                        <Tooltip title={input_label('d_ra', true)}>
                            <TextField
                                label={input_label('d_ra')}
                                id="dra"
                                focused={target.d_ra ? true : false}
                                value={target.d_ra}
                                sx={{ width: 125 }}
                                onChange={(event) => handleTextChange('d_ra', event.target.value, true)}
                            />
                        </Tooltip>
                        <Tooltip title={input_label('d_dec', true)}>
                            <TextField
                                label={input_label('d_dec')}
                                id="d_dec"
                                focused={target.d_dec ? true : false}
                                value={target.d_dec}
                                sx={{ width: 125 }}
                                onChange={(event) => handleTextChange('d_dec', event.target.value, true)}
                            />
                        </Tooltip>
                        <Tooltip title={input_label('gaia_id', true)}>
                            <TextField
                                label={input_label('gaia_id')}
                                id="gaia-id"
                                focused={target.gaia_id ? true : false}
                                value={target.gaia_id}
                                onChange={(event) => handleTextChange('gaia_id', event.target.value)}
                            />
                        </Tooltip>
                        <Tooltip title={input_label('tic_id', true)}>
                            <TextField
                                label={input_label('tic_id')}
                                id="tic"
                                focused={target.tic_id ? true : false}
                                value={target.tic_id}
                                onChange={(event) => handleTextChange('tic_id', event.target.value)}
                            />
                        </Tooltip>
                    </Stack>
                    <Stack sx={{ marginBottom: '24px' }} width="100%" direction="row" justifyContent='center' spacing={2}>
                        <Tooltip title={input_label('pm_ra', true)}>
                            <TextField
                                label={input_label('pm_ra')}
                                id="pm-ra"
                                focused={target.pm_ra ? true : false}
                                value={target.pm_ra}
                                sx={{ width: 125 }}
                                onChange={(event) => handleTextChange('pm_ra', event.target.value, true)}
                            />
                        </Tooltip>
                        <Tooltip title={input_label('pm_dec', true)}>
                            <TextField
                                label={input_label('pm_dec')}
                                id="pm-dec"
                                focused={target.pm_dec ? true : false}
                                value={target.pm_dec}
                                sx={{ width: 125 }}
                                onChange={(event) => handleTextChange('pm_dec', event.target.value, true)}
                            />
                        </Tooltip>
                        <Tooltip title={input_label('equinox', true)}>
                            <TextField
                                label={input_label('equinox')}
                                id="equinox"
                                focused={target.equinox ? true : false}
                                value={target.equinox}
                                sx={{ width: 125 }}
                                onChange={(event) => handleTextChange('equinox', event.target.value)}
                            />
                        </Tooltip>
                        <Tooltip title={input_label('lgs', true)}>
                            <Autocomplete
                                disablePortal
                                id="lgs"
                                value={target.lgs ? { label: target.lgs } : { label: '' }}
                                onChange={(_, value) => handleTextChange('lgs', value?.label)}
                                options={lgsOptions ?? []}
                                sx={{ width: 125 }}
                                renderInput={(params) => <TextField {...params} label={input_label('lgs')} />}
                            />
                        </Tooltip>
                        <Tooltip title={input_label('separation', true)}>
                            <TextField
                                label={input_label('separation')}
                                focused={target.separation ? true : false}
                                id="separation"
                                value={target.separation}
                                sx={{ width: 200 }}
                                onChange={(event) => handleTextChange('separation', event.target.value, true)}
                            />
                        </Tooltip>
                        <Tooltip title={input_label('science_target', true)}>
                            <TextField
                                label={input_label('science_target')}
                                focused={target.science_target ? true : false}
                                id="target-name"
                                value={target.science_target}
                                sx={{ width: 200 }}
                                onChange={(event) => handleTextChange('science_target', event.target.value)}
                            />
                        </Tooltip>
                    </Stack>
                    {/* {magContent} */}
                    <Stack sx={{ marginBottom: '24px' }} width="100%" direction="row" justifyContent='center' spacing={2}>
                        <Tooltip title={input_label('tags', true)}>
                            <MuiChipsInput
                                value={target.tags}
                                onChange={(value) => handleArrayChange('tags', value)}
                                label={input_label('tags')}
                                id="tags"
                            />
                        </Tooltip>
                    </Stack>
                    <Stack sx={{ marginBottom: '24px' }} width="100%" direction="row" justifyContent='center' spacing={2}>
                        <Tooltip title={input_label('comment', true)}>
                            <TextField
                                label={input_label('comment')}
                                id="comments"
                                value={target.comment}
                                sx={{ width: 400 }}
                                onChange={(event) => handleTextChange('comment', event.target.value)}
                            />
                        </Tooltip>
                    </Stack>
                </Box>
            </Paper>
        </Stack>
    )

    return (
        <DialogComponent
            maxWidth={'lg'}
            handleClose={props.handleClose}
            open={props.open}
            titleContent={titleContent}
            children={dialogContent}
        />
    )

}

export default function TargetEditDialogButton(props: Props) {
    const [open, setOpen] = React.useState(false);
    const { target, setTarget } = props

    const handleClickOpen = () => {
        console.log('setting to open')
        setOpen(true);
    };

    const handleClose = () => {
        console.log('setting to close')
        setOpen(false);
    };

    return (
        <>
            <Tooltip title="Select to edit target in dialog window">
                <IconButton onClick={handleClickOpen}>
                    <EditIcon />
                </IconButton>
            </Tooltip>
            <TargetEditDialog
                open={open}
                target={target}
                setTarget={setTarget}
                handleClose={handleClose}
            />
        </>
    );
}