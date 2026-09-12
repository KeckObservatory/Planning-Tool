import { useMemo, useState, type JSX, type MouseEvent } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Input from "@mui/material/Input";
import Popover from "@mui/material/Popover";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { cosd, r2d, ra_dec_to_deg, sind, tand } from "../two-d-view/sky_view_util";
import { AGR_LIMIT_DEG, DEFAULT_AGR_OFFSET_DEG } from "../two-d-view/constants";
import { Target, useStateContext } from "../App";


function norm_180(x: number): number {
    //angle is between -180 and 180
    while (x > 180) x -= 360;
    while (x < -180) x += 360;
    return x;
}

const get_parallactic_angle= (haDeg: number, decDeg: number, latitude: number) => {
    const numerator = sind(haDeg)
    const denominator: number = tand(latitude)
        * cosd(decDeg)
        - sind(decDeg) * cosd(haDeg)
    return r2d(Math.atan2(numerator, denominator))
}

const STATUS_OK = 0;
const STATUS_OUT_OF_RANGE = 1;
const STATUS_NO_LIMIT = 2;

type AGRStatus = typeof STATUS_OK | typeof STATUS_OUT_OF_RANGE | typeof STATUS_NO_LIMIT;
type Time2LimitResult = [status: AGRStatus, ttlHours: number, agrDeg: number, msg: string];
type TTLResult = [status: AGRStatus, ttlHours: number, agrDeg: number];

function get_time_to_limit( startHADeg: number, rotdestDeg: number,
    decDeg: number, agrOffsetDeg: number, latDeg: number): Time2LimitResult {

    function calc_agr(ha: number, offset: number): number {
        const parAngle = get_parallactic_angle(ha, decDeg, latDeg);
        return norm_180(rotdestDeg - parAngle + agrOffsetDeg + offset);
    }

    function get_time_to_limit(ha: number, offset = 0): TTLResult {
        const agrStart = calc_agr(ha, offset);
        let a0 = agrStart;
        if (a0 > AGR_LIMIT_DEG || a0 < -AGR_LIMIT_DEG) {
            return [STATUS_OUT_OF_RANGE, 0, agrStart];
        }
        const step = 5;
        for (let t = 0; t < 360; t += step) {
            const ha1 = ha + t;
            const a1 = calc_agr(ha1, offset);
            if (a0 <= AGR_LIMIT_DEG && AGR_LIMIT_DEG < a1) {
                const h = ((AGR_LIMIT_DEG - a0) / (a1 - a0)) * step + t - step;
                return [STATUS_OK, h / 15, agrStart];
            }
            if (a1 <= -AGR_LIMIT_DEG && -AGR_LIMIT_DEG < a0) {
                const h = ((-AGR_LIMIT_DEG - a0) / (a1 - a0)) * step + t - step;
                return [STATUS_OK, h / 15, agrStart];
            }
            a0 = a1;
        }
        return [STATUS_NO_LIMIT, 999, agrStart];
    }

    function get_time_to_limit_2(ha: number): Time2LimitResult {
        const [st1, ttl1, agr1] = get_time_to_limit(ha, 0);
        if (st1 === STATUS_NO_LIMIT) {
            return [st1, ttl1, agr1, "no limit"];
        }
        const [st2, ttl2, agr2] = get_time_to_limit(ha, 180);
        if (st1 === STATUS_OUT_OF_RANGE) {
            return [st2, ttl2, agr2, "bad 1"];
        }
        if (st2 === STATUS_OK) {
            if (ttl1 >= ttl2) {
                return [st1, ttl1, agr1, "good 1"];
            }
            return [st2, ttl2, agr2, "good 2"];
        }
        return [st1, ttl1, agr1, "bad 2"];
    }

    return get_time_to_limit_2(startHADeg);
}

interface AGRResult {
    status: AGRStatus;
    ttl: number;
    agr: number;
    msg: string;
}

interface Props {
    target: Target
    rotatorAngle: number
}

function AGTimeToLimitPanel(props: Props): JSX.Element {
    const { target, rotatorAngle } = props
    // AGR stands for Asterism Generator
    const [haStr, setHaStr] = useState("-02:00:00");
    const [agrOffsetStr, setAgrOffsetStr] = useState(String(DEFAULT_AGR_OFFSET_DEG));

    
    const context = useStateContext() 

    const lngLatEl = context.config.tel_lat_lng_el["Keck 1"] //AGR is always on Keck 1.

    const result = useMemo<AGRResult | null>(() => {
        const haDeg = ra_dec_to_deg(haStr);
        const raDeg = ra_dec_to_deg(target.ra ?? "00:00:00");
        const decDeg = ra_dec_to_deg(target.dec ?? "00:00:00", true);
        const agrOffsetDeg = Number(agrOffsetStr);

        if (
            Number.isNaN(haDeg) ||
            Number.isNaN(raDeg) ||
            Number.isNaN(decDeg) ||
            Number.isNaN(rotatorAngle) ||
            Number.isNaN(agrOffsetDeg)
        ) {
            return null;
        }

        const startHADeg = haDeg;

        const [status, ttl, agr, msg] = get_time_to_limit(
            startHADeg,
            rotatorAngle,
            decDeg,
            agrOffsetDeg,
            lngLatEl.lat
        );

        return { status, ttl, agr, msg };
    }, [haStr, target.ra, target.dec, rotatorAngle, agrOffsetStr]);
    

    let agAngleText = "";
    let ttlText = "";

    if (result) {
        switch (result.status) {
            case STATUS_OK:
                agAngleText = `${result.agr.toFixed(2)} deg`;
                ttlText = `${result.ttl.toFixed(2)} hr`;
                break;
            case STATUS_OUT_OF_RANGE:
                agAngleText = "Out of range";
                ttlText = "";
                break;
            case STATUS_NO_LIMIT:
                agAngleText = `${result.agr.toFixed(2)} deg`;
                ttlText = "No limit";
                break;
            default:
                break;
        }
    }

    return (
        <Box sx={{ padding: 2, maxWidth: 420 }}>
            <Typography variant="subtitle1" gutterBottom>
                AGR Time to Limit
            </Typography>

            <Box
                sx={{
                    display: "grid",
                    gridTemplateColumns: "auto 1fr",
                    columnGap: 1.5,
                    rowGap: 0.75,
                    alignItems: "center",
                }}
            >
                <Typography component="label" htmlFor="agr-ha" variant="body2">
                    Start HA (HH:MM:SS)
                </Typography>
                <Input
                    id="agr-ha"
                    value={haStr}
                    onChange={(e) => setHaStr(e.target.value)}
                />

                <Typography variant="body2">RA (HH:MM:SS)</Typography>
                <Typography variant="body2">{target.ra}</Typography>

                <Typography variant="body2">DEC (DD:MM:SS)</Typography>
                <Typography variant="body2">{target.dec}</Typography>

                <Typography component="label" htmlFor="agr-offset" variant="body2">
                    AGR Rotation Offset (deg)
                </Typography>
                <Input
                    id="agr-offset"
                    value={agrOffsetStr}
                    onChange={(e) => setAgrOffsetStr(e.target.value)}
                />
            </Box>

            <Box
                sx={{
                    display: "grid",
                    gridTemplateColumns: "auto 1fr",
                    columnGap: 1.5,
                    rowGap: 0.5,
                    alignItems: "center",
                    marginTop: 2,
                }}
            >
                <Typography variant="body2" fontWeight="bold">AG Angle</Typography>
                <Typography variant="body2">{result ? agAngleText : "-"}</Typography>

                <Typography variant="body2" fontWeight="bold">Time to Limit</Typography>
                <Typography variant="body2">{result ? ttlText : "-"}</Typography>

                <Typography variant="body2" fontWeight="bold">AGR Range</Typography>
                <Typography variant="body2">
                    -{AGR_LIMIT_DEG}&deg; to +{AGR_LIMIT_DEG}&deg;
                </Typography>
            </Box>

            {!result && (
                <Typography variant="body2" color="error" sx={{ marginTop: 1 }}>
                    Enter valid sexagesimal HA/RA/DEC and numeric angles.
                </Typography>
            )}
        </Box>
    );
}

export default function AGTimeToLimit(props: Props): JSX.Element {
    const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);

    const handleOpen = (e: MouseEvent<HTMLElement>) => setAnchorEl(e.currentTarget);
    const handleClose = () => setAnchorEl(null);

    return (
        <>
            <Tooltip title="Click to compute the Asterism Generator Rotator (AGR) angle and time to limit for this target">
                <Button color="primary" onClick={handleOpen}>
                    AGR Time to Limit
                </Button>
            </Tooltip>
            <Popover
                open={Boolean(anchorEl)}
                anchorEl={anchorEl}
                onClose={handleClose}
                anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
                transformOrigin={{ vertical: "top", horizontal: "left" }}
                // keep the panel mounted so entered HA/offset values survive a close/reopen
                keepMounted
            >
                <AGTimeToLimitPanel {...props} />
            </Popover>
        </>
    );
}
