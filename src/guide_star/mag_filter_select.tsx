import { Autocomplete, Checkbox, TextField, Tooltip } from "@mui/material"
import React from "react"
import CheckBoxOutlineBlankIcon from '@mui/icons-material/CheckBoxOutlineBlank';
import CheckBoxIcon from '@mui/icons-material/CheckBox';

const icon = <CheckBoxOutlineBlankIcon fontSize="small" />;
const checkedIcon = <CheckBoxIcon fontSize="small" />;

// Uses the Target-side field names (post catalog_to_target_map) since guidestars
// are already mapped to Partial<Target> by the time filtering happens.
export const MAG_KEYS = ['v_mag', 'r_mag', 'j_mag', 'h_mag', 'k_mag'] as const
export type MagKey = typeof MAG_KEYS[number]
export type MagFilter = Record<MagKey, boolean>
export const DEFAULT_MAG_FILTER: MagFilter = { v_mag: false, r_mag: false, j_mag: false, h_mag: false, k_mag: false }

const MAG_LABELS: Record<MagKey, string> = { v_mag: 'V', r_mag: 'R', j_mag: 'J', h_mag: 'H', k_mag: 'K' }

type MagOption = MagKey | undefined | 'SELECT_ALL'

interface MagFilterSelectProps {
    filterByMag: MagFilter
    setFilterByMag: React.Dispatch<React.SetStateAction<MagFilter>>
    disabled?: boolean
}

export const MagFilterSelect = (props: MagFilterSelectProps) => {
    const { filterByMag, setFilterByMag, disabled } = props
    const selected = MAG_KEYS.filter((key) => filterByMag[key])

    const onChange = (value: MagOption[]) => {
        if (value?.includes('SELECT_ALL')) {
            setFilterByMag(Object.fromEntries(MAG_KEYS.map((key) => [key, true])) as MagFilter)
        } else if (value?.includes(undefined)) {
            setFilterByMag(Object.fromEntries(MAG_KEYS.map((key) => [key, false])) as MagFilter)
        } else {
            const chosen = value as MagKey[]
            setFilterByMag(Object.fromEntries(MAG_KEYS.map((key) => [key, chosen.includes(key)])) as MagFilter)
        }
    }

    return (
        <Tooltip placement="top" title="Keep only guide stars whose selected magnitude(s) fall within the magnitude range">
            <Autocomplete
                disablePortal
                id="mag-filter-selection"
                disabled={disabled}
                value={selected}
                onChange={(_, value) => onChange(value)}
                options={[undefined, 'SELECT_ALL', ...MAG_KEYS] as MagOption[]}
                sx={{ width: '250px', paddingTop: '9px', margin: '6px' }}
                renderInput={(params) => <TextField {...params} label="Filter by Magnitude" />}
                multiple
                disableCloseOnSelect
                getOptionLabel={(option) => {
                    if (option === 'SELECT_ALL') return 'All';
                    if (option === undefined) return 'None';
                    return MAG_LABELS[option];
                }}
                renderOption={(renderProps, option, { selected: isSelected }) => {
                    const { key, ...optionProps } = renderProps;

                    if (option === 'SELECT_ALL') {
                        const allSelected = selected.length === MAG_KEYS.length;
                        return (
                            <li key={key} {...optionProps}>
                                <Checkbox
                                    icon={icon}
                                    checkedIcon={checkedIcon}
                                    style={{ marginRight: 8 }}
                                    checked={allSelected}
                                    indeterminate={selected.length > 0 && selected.length < MAG_KEYS.length}
                                />
                                <strong>All</strong>
                            </li>
                        );
                    }

                    if (option === undefined) {
                        return (
                            <li key={key} {...optionProps}>
                                <Checkbox
                                    icon={icon}
                                    checkedIcon={checkedIcon}
                                    style={{ marginRight: 8 }}
                                    checked={selected.length === 0}
                                />
                                None
                            </li>
                        );
                    }

                    return (
                        <li key={key} {...optionProps}>
                            <Checkbox
                                icon={icon}
                                checkedIcon={checkedIcon}
                                style={{ marginRight: 8 }}
                                checked={isSelected}
                            />
                            {MAG_LABELS[option]}
                        </li>
                    );
                }}
            />
        </Tooltip>
    )
}
