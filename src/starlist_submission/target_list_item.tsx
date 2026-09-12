import { IconButton, ListItem, ListItemText, Stack, Tooltip } from "@mui/material"
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardDoubleArrowUpIcon from '@mui/icons-material/KeyboardDoubleArrowUp';
import KeyboardDoubleArrowDownIcon from '@mui/icons-material/KeyboardDoubleArrowDown';

interface Props {
    idx: number,
    starListString: string
    isFirst: boolean
    isLast: boolean
    moveRow: (from: number, to: number) => void
    nRows: number
}


export const TargetListItem = (props: Props) => {
    const { idx, starListString, isFirst, isLast, moveRow, nRows} = props
    return (
        <ListItem
            key={`${idx}-${starListString}`}
            divider
            dense
            secondaryAction={
                <Stack direction='row'>
                    <Tooltip title="Move to top">
                        <span>
                            <IconButton
                                size="small"
                                disabled={isFirst}
                                onClick={() => moveRow(idx, 0)}
                            >
                                <KeyboardDoubleArrowUpIcon fontSize="small" />
                            </IconButton>
                        </span>
                    </Tooltip>
                    <Tooltip title="Move up one row">
                        <span>
                            <IconButton
                                size="small"
                                disabled={isFirst}
                                onClick={() => moveRow(idx, idx - 1)}
                            >
                                <KeyboardArrowUpIcon fontSize="small" />
                            </IconButton>
                        </span>
                    </Tooltip>
                    <Tooltip title="Move down one row">
                        <span>
                            <IconButton
                                size="small"
                                disabled={isLast}
                                onClick={() => moveRow(idx, idx + 1)}
                            >
                                <KeyboardArrowDownIcon fontSize="small" />
                            </IconButton>
                        </span>
                    </Tooltip>
                    <Tooltip title="Move to bottom">
                        <span>
                            <IconButton
                                size="small"
                                disabled={isLast}
                                onClick={() => moveRow(idx, nRows-1)}
                            >
                                <KeyboardDoubleArrowDownIcon fontSize="small" />
                            </IconButton>
                        </span>
                    </Tooltip>
                </Stack>
            }
        >
            <ListItemText
                primary={starListString}
                primaryTypographyProps={{
                    sx: {
                        fontFamily: 'monospace',
                        whiteSpace: 'pre',
                        overflowX: 'auto',
                    }
                }}
            />
        </ListItem>
    )
}