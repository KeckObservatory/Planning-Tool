import * as React from 'react';
import Box from '@mui/material/Box';
import Slider from '@mui/material/Slider';
import { Typography } from '@mui/material';
import { MAG_RANGE } from '../two-d-view/constants';

interface Props {
    range?: [string, string]
    disabled?: boolean
    setRange: (newValue: string[]) => void
}

// Magnitude is a "smaller number = brighter" scale, so the big (dim) number
// should show on the left and the small (bright) number on the right. The
// slider's own min/max/value are kept in a negated domain so the underlying
// drag mechanics stay ordinary left-to-right; only the displayed label is
// flipped back to the real magnitude.
const toWorking = (actual: number[]) => actual.map((v) => -v).sort((a, b) => a - b)
const toActual = (working: number[]) => working.map((v) => -v).sort((a, b) => a - b)

export const MagRangeSlider = (props: Props) => {

    const initialActual = props.range ? props.range.map(Number) : MAG_RANGE.map(Number)
    const [workingValue, setWorkingValue] = React.useState(toWorking(initialActual))

    const handleChangeCommitted = (_: Event | React.SyntheticEvent<Element, Event>, newValue: number | number[]) => {
        if (Array.isArray(newValue)) {
            props.setRange(toActual(newValue).map(String));
        }
    };

    const handleChange = (_: Event, newValue: number | number[]) => {
        if (Array.isArray(newValue)) {
            setWorkingValue(newValue)
        }
    }

    return (
        <Box sx={{ width: 300 }}>
            <Typography id="input-slider" gutterBottom>
                Guide Star Magnitude Range
            </Typography>
            <Slider
                getAriaLabel={() => 'Magnitude range'}
                value={workingValue}
                min={-MAG_RANGE[1]}
                step={.2}
                disabled={props.disabled}
                max={-MAG_RANGE[0]}
                onChange={handleChange}
                onChangeCommitted={handleChangeCommitted}
                valueLabelDisplay="auto"
                valueLabelFormat={(v) => -v}
                getAriaValueText={(v) => `${-v} magnitude`}
            />
        </Box>
    );
}
