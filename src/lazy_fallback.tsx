import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';

interface Props {
    height?: number
}

/**
 * Placeholder shown while a lazily-loaded chart chunk (plotly, aladin-lite, d3)
 * downloads. These libraries are ~7MB of the build, so they are split out of the
 * initial bundle and fetched the first time a dialog that needs them is opened.
 */
export const LazyFallback = ({ height = 500 }: Props) => (
    <Stack width="100%" direction="row" justifyContent="center">
        <Skeleton variant="rectangular" width="100%" height={height} />
    </Stack>
)
