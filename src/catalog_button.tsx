
import Tooltip from '@mui/material/Tooltip';
import { IconButton } from '@mui/material';
import { GaiaParams, get_gaia, get_simbad } from './api/api_root';
import ModeStandbyIcon from '@mui/icons-material/ModeStandby';
import { Target } from './App';


export interface Props {
    target: Target
    setTarget: (updater: (prev: Target) => Target) => void //avoids clobbering edits when running get_simbad_and_gaia_target_info, which returns a partial target object
    hasCatalog: boolean
    label?: boolean
}

export const ra_dec_to_deg = (time: string | number, dec = false): number => {
    //if float return
    if (typeof time === 'number') { //already stored as degree
        return time
    }

    let deg = 0;
    let sigfig = 3;
    (time as string).includes('+') || (time as string).includes('-') && (dec = true)
    try {
        let [hours, min, sec] = (time as string).split(':')
        const decimal = sec.split('.').at(1) //sometimes decimal is not present in seconds
        sigfig = (decimal?.length ?? 0) + 5
        if (dec) {
            let sign = 1
            let degrees = hours.trim()
            if (degrees.startsWith('+')) {
                degrees = degrees.substring(1)
            } else if (degrees.startsWith('-')) {
                degrees = degrees.substring(1)
                sign = -1
            }
            deg = sign * (Number(degrees) // dec is already in degrees
                + Number(min) / 60
                + Number(sec) / 3600)
        }

        else {
            deg = Number(hours) * 15 // convert hours to deg
                + Number(min) / 4
                + Number(sec) / 240
        }
    }
    finally {
        return Number(deg.toFixed(sigfig))
    }
}

export interface SimbadTargetData {
    ra?: string,
    dec?: string,
    ra_deg?: number,
    dec_deg?: number,
    pm_ra?: number,
    pm_dec?: number,
    equinox?: number | string,
    epoch?: string,
    parallax?: number,
    tic?: string,
    b_mag?: number | string,
    g_mag?: number | string,
    j_mag?: number | string,
    systemic_velocity?: number
    gaia_id?: string,
    tic_id?: string,
    two_mass_id?: string,
    catalog_comment?: string
}

export const get_simbad_data = async (targetName: string): Promise<SimbadTargetData> => {
    const simbad_output = await get_simbad(targetName)
    const simbadData: SimbadTargetData = {}

    const simbadLines = simbad_output.split('\n')
    let currDr = 0
    let identifiersSection = false
    for (let line of simbadLines) {
        if (!line) continue
        if (!identifiersSection && line.startsWith('Identifiers')) {
            identifiersSection = true
            continue
        }
        if (line.startsWith('!!')) {
            simbadData['catalog_comment'] = line.split('!! ')[1]
        }
        if (line.startsWith('Coordinates(ICRS')) {
            simbadData['ra'] = line.split(': ')[1].split(' ').slice(0, 3).join(':')
            simbadData['dec'] = line.split(': ')[1].split(' ').slice(4, 7).join(':')
            simbadData['ra_deg'] = ra_dec_to_deg(simbadData['ra'])
            simbadData['dec_deg'] = ra_dec_to_deg(simbadData['dec'], true)
            console.log('ra', simbadData['ra'], 'dec', simbadData['dec'], 'ra_deg', simbadData['ra_deg'], 'dec_deg', simbadData['dec_deg'])
            simbadData['equinox'] = line.match( new RegExp("eq=(\\w+)"))?.at(1)
            simbadData['epoch'] = line.match( new RegExp("ep=(\\w+)"))?.at(1)
        }
        else if (line.startsWith('Radial Velocity')) {
            const sysRv = Number(line.split(' ')[2].replace(' ', ''))
            sysRv && (simbadData['systemic_velocity'] = sysRv)
        }
        else if (line.startsWith('Flux J')) {
            const fluxJ = Number(line.split(': ')[1].split(' ')[0])
            fluxJ && (simbadData['j_mag'] = fluxJ)
        }
        else if (line.startsWith('Flux G')) {
            const fluxG = Number(line.split(': ')[1].split(' ')[0])
            fluxG && (simbadData['g_mag'] = fluxG)
        }
        else if (line.startsWith('Parallax')) {
            const parallax = Number(line.split(': ')[1].split(' ')[0])
            parallax && (simbadData['parallax'] = parallax)
        }
        else if (line.startsWith('Proper motions')) {
            const [pmRa, pmDec] = line.split(' ').slice(2, 4);
            Number(pmRa) && (simbadData['pm_ra'] = Number(pmRa)/1000) //convert from mas/yr to arcsec/yr
            Number(pmDec) && (simbadData['pm_dec'] = Number(pmDec)/1000) //convert from mas/yr to arcsec/yr
        }
        else if (identifiersSection) //only check if in identifiers section
        {
            if (!simbadData.tic_id) simbadData['tic_id'] = line.match(new RegExp('TIC\\s(\\w+)'))?.at(1)
            if (!simbadData.two_mass_id) simbadData['two_mass_id'] = line.match(new RegExp('2MASS\\s([-+\\w]+)'))?.at(1)
            const [match, dr, gaia_id] = line.match(new RegExp('Gaia\\s(\\w+)\\s(\\w+)')) ?? []
            if (match) { //replace if gaia version is higher
                Number(dr[2]) > currDr && (
                    simbadData['gaia_id'] = `${dr}_${gaia_id}`)
                currDr = Number(dr[2])
        }
    }
    ;
}
return simbadData
}

export const get_simbad_and_gaia_target_info = async (targetName: string, gaia_id?: string): Promise<SimbadTargetData & GaiaParams> => {
    const simbadData = await get_simbad_data(targetName)
    let gaiaParams: GaiaParams = {}
    const simbadGaia = simbadData.gaia_id
    gaia_id = gaia_id ?? simbadGaia
    let catTarget = { ...simbadData }
    if (gaia_id) {
        const gaiaNumber = String(gaia_id).replace(/DR\d_/, "")
        const gaiaResp = await get_gaia(gaiaNumber)
        gaiaParams = gaiaResp.gaia_params ?? {}
        if (Object.keys(gaiaParams).length === 0) {
            let comment = catTarget.catalog_comment + 'GAIA RESP: ' + gaiaResp.message
            catTarget['catalog_comment'] = comment
        }
    }
    return { ...simbadData, ...gaiaParams, gaia_id: simbadGaia } //simbad gaia includes version.
}


export default function CatalogButton(props: Props) {
    const { target, setTarget } = props
    const targetName = target.target_name
    const gaia_id = target.gaia_id

    const handleClick = async () => {
        if (targetName) {
            const catalogTargetInfo = await get_simbad_and_gaia_target_info(targetName, gaia_id)
            setTarget((prev) => ({ ...prev, ...catalogTargetInfo, "state": 'ROW_EDITED', status: 'EDITED' }))
        }
    }

    return (
        <Tooltip title={`Click to add Simbad and Gaia info to target ${targetName}`}>
            <IconButton onClick={handleClick}>
                <ModeStandbyIcon color={props.hasCatalog ? 'success' : 'inherit'} />
            </IconButton>
        </Tooltip>
    );
}