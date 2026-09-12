import React, { useState, useEffect } from 'react'
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'

import { ConfigFile, Target, useStateContext } from '../App';
import { Autocomplete, Box, Stack, TextField, Switch, FormControlLabel, Typography } from '@mui/material';
import { DialogComponent } from '../dialog_component';
import GuideStarTable from './guide_star_table';
import { ra_dec_to_deg } from '../catalog_button';
import { FOVSelect } from '../two-d-view/fov_select';
import { Dome, DomeParam, DomeSelect, get_shapes } from '../two-d-view/two_d_view_common.tsx';
import { ArrayParam, BooleanParam, StringParam, useQueryParam, withDefault } from 'use-query-params';
import { get_catalog_targets, get_catalogs, get_image_catalogs, get_catalog_image } from '../api/api_root';
import UploadDialog from '../upload_targets_dialog';
import { LaserContours, POPointFeature, POPointingOriginCollection, POSelect } from '../two-d-view/pointing_origin_select';
import { LazyFallback } from '../lazy_fallback';
// import AladinViewer from '../aladin/aladin';
import { MagRangeSlider } from './mag_range_slider';
import { DEFAULT_MAG_FILTER, MAG_KEYS, MagFilter, MagFilterSelect } from './mag_filter_select.tsx';
import { MOSFIRE_WINDOW_SIZE, DEFAULT_WINDOW_SIZE, DEFAULT_RA, DEFAULT_DEC, AO_INSTRUMENTS, TRICK_INSTRUMENTS } from '../two-d-view/constants';
import AGTimeToLimit from './asterism_generator.tsx';

// d3 + the aladin marker helpers live behind this import. Keep it lazy so they
// load when the guide star dialog is first opened, not at app startup.
const GSViewer = React.lazy(() => import('./guide_star_viewer').then(m => ({ default: m.GSViewer })))

export interface CatalogTarget {
    name: string | number;
    ra: string;
    dec: string;
    equinox: number;
    pm_ra: number | string;
    pm_dec: number | string;
    dra: number;
    ddec: number;
    mag: number | null;
    jmag: number | null;
    rmag: number | null;
    vmag: number | null;
    hmag: number | null;
    kmag: number | null;
    spec_type: string | null
    galaxy: number
    separation: number
    "B-V": number | null
    "B-R": number | null
}

// Each catalog names its columns differently, so each gets its own interface and
// its own <catalog>_catalog_to_target_map in config. A magnitude of 99.9 is the
// catalogs' "no measurement" sentinel; sanitize_guide_star drops those on submit.

export interface PanstarrsTarget {
    objID: number
    // raMean/decMean duplicate raDeg/decDeg; both are degrees, there is no
    // sexagesimal form in the response.
    raMean: number
    decMean: number
    raDeg: number
    decDeg: number
    epochMean: number
    gMeanApMag: number | null
    rMeanApMag: number | null
    iMeanApMag: number | null
    zMeanApMag: number | null
    yMeanApMag: number | null
    distance: number
}

export interface SAO2000Target {
    SaoNumber: number
    RA: string
    Decl: string
    PMRA: number | null
    PMDec: number | null
    PhotMag: number | null
    VMag: number | null
    SpectralType: string | null
    distance: number
}

export interface HIPTarget {
    HIP_ID: number
    RA: string
    Decl: string
    Vmag: number | null
    Parallax: number | null
    pm_RA: number | null
    pm_Dec: number | null
    BT_Mag: number | null
    Hip_Mag: number | null
    BV_Color: number | null
    distance: number
}

export interface UCAC4Target {
    UCAC_ID: number
    RA: string
    Decl: string
    RA_deg: number
    Decl_deg: number
    PmRA: number | null
    PmDec: number | null
    "2MASS_ID": number | null
    "2MASS_J": number | null
    "2MASS_H": number | null
    "2MASS_K": number | null
    APASS_B: number | null
    APASS_V: number | null
    APASS_g: number | null
    APASS_r: number | null
    APASS_i: number | null
    distance: number
}

export interface TwoMassTarget {
    "2mass_ID": string
    RA: string
    Decl: string
    JMag: number | null
    HMag: number | null
    KMag: number | null
    distance: number
}

export interface GSC240Target {
    HSTID: string
    RA: string
    Decl: string
    PmRA: number | null
    PmDec: number | null
    Vmag: number | null
    Bmag: number | null
    Rmag: number | null
    NpgMag: number | null
    FpgMag: number | null
    JpgMag: number | null
    Imag: number | null
    Jmag: number | null
    Hmag: number | null
    Kmag: number | null
    Classifiaction: number
    distance: number
}

export interface GAIATarget {
    // ID0 is a row counter the response adds; ID is the Gaia source id, sent as
    // a string so its 19 digits survive JSON parsing intact.
    ID0: string
    ID: string
    // Degrees only, as with Panstarrs - no sexagesimal form in the response.
    raDeg: number
    decDeg: number
    pmra: number | null
    pmdec: number | null
    // Already Target-side names. Note the "no measurement" sentinel here is
    // 999.9 rather than the 99.9 the other catalogs use; sanitize_guide_star
    // drops anything >= 99.9, so both are covered.
    g_mag: number | null
    b_mag: number | null
    r_mag: number | null
    distance: number
}

/** A row from any of the source catalogs the catalog API can be asked for. */
export type AnyCatalogTarget =
    | CatalogTarget
    | GSC240Target
    | PanstarrsTarget
    | SAO2000Target
    | HIPTarget
    | UCAC4Target
    | TwoMassTarget
    | GAIATarget

/** Catalog column name -> Target field name, e.g. config.catalog_to_target_map. */
export type CatalogToTargetMap = Record<string, string>

/**
 * Pairs a row with the map that describes it. Keyed off each catalog's unique id
 * column rather than the catalog's name: the name is whatever the catalog API
 * reports, and any drift there would pair rows with the wrong map, which
 * silently strips target_name/ra/dec off every row.
 */
export const pick_catalog_map = (guidestar: AnyCatalogTarget, cfg: ConfigFile): CatalogToTargetMap => {
    if ('HSTID' in guidestar) return cfg.gsc240_catalog_to_target_map
    if ('objID' in guidestar) return cfg.panstarrs_catalog_to_target_map
    if ('SaoNumber' in guidestar) return cfg.sao2000_catalog_to_target_map
    if ('HIP_ID' in guidestar) return cfg.hip_catalog_to_target_map
    if ('UCAC_ID' in guidestar) return cfg.ucac4_catalog_to_target_map
    if ('2mass_ID' in guidestar) return cfg.two_mass_catalog_to_target_map
    if ('ID' in guidestar) return cfg.gaia_catalog_to_target_map
    return cfg.catalog_to_target_map
}

interface ButtonProps {
    targets: Target[]
}

export interface TargetViz extends Target {
}

interface VizDialogProps {
    open: boolean,
    targets: Target[]
    handleClose: () => void
}

export const GuideStarButton = (props: ButtonProps) => {

    const { targets } = props
    const [open, setOpen] = React.useState(false);

    const handleClickOpen = () => {
        setOpen(true);
    };

    const handleClose = () => {
        setOpen(false);
    };

    return (
        <>
            <Tooltip title={`Click to find and add guide stars for selected target(s)`}>
                <IconButton color="primary" onClick={handleClickOpen}>
                    <AutoAwesomeIcon />
                </IconButton>
            </Tooltip>
            {open &&
                <GuideStarDialog
                    open={open}
                    targets={targets}
                    handleClose={handleClose}
                />
            }
        </>
    );
}

const pad = (n: number) => String(n).padStart(2, '0')

// Only the whole-seconds part is padded - padding the formatted number would
// leave "0.024" a single digit wide and fail the schema pattern.
const pad_seconds = (seconds: number) => {
    const [, frac] = String(Number(seconds.toFixed(3))).split('.')
    const whole = pad(Math.floor(seconds))
    return frac ? `${whole}.${frac}` : whole
}

/**
 * Panstarrs reports coordinates in degrees only, so the sexagesimal strings the
 * table shows - and that target_schema's ra/dec pattern requires on submit -
 * have to be derived. Both round to whole milli-units first and decompose
 * after, so rounding can never carry a field to 60, and both zero-pad to the
 * two digits the schema pattern demands.
 */
const deg_to_hms = (deg: number): string => {
    const wrapped = ((deg % 360) + 360) % 360
    // Rounding can land a hair under 360 deg on 24:00:00, which is 00:00:00.
    const totalSec = Math.round((wrapped / 15) * 3600 * 1000) / 1000 % 86400
    const h = Math.floor(totalSec / 3600)
    const m = Math.floor((totalSec - h * 3600) / 60)
    return `${pad(h)}:${pad(m)}:${pad_seconds(totalSec - h * 3600 - m * 60)}`
}

const deg_to_dms = (deg: number): string => {
    const sign = deg < 0 ? '-' : '+'
    const totalArcsec = Math.round(Math.abs(deg) * 3600 * 1000) / 1000
    const d = Math.floor(totalArcsec / 3600)
    const m = Math.floor((totalArcsec - d * 3600) / 60)
    return `${sign}${pad(d)}:${pad(m)}:${pad_seconds(totalArcsec - d * 3600 - m * 60)}`
}

// Catalogs signal "no measurement in this band" with an out-of-range magnitude
// rather than a null - 99.9 for most of them, 999.9 for GAIA.
export const MAG_SENTINEL = 99.9

const is_mag_key = (key: string) => /_mag$/i.test(key)

/** True for a magnitude the catalog actually measured. */
const is_real_mag = (value: unknown): value is number =>
    typeof value === 'number' && value < MAG_SENTINEL

export const guidestar_to_target = (guidestar: AnyCatalogTarget, mapping: CatalogToTargetMap): Partial<Target> => {

    const tgt: Record<string, any> = Object.fromEntries(
        Object.entries(guidestar).map(([key, value]) => [mapping[key] ?? key, value])
    );
    // A GSC240 row can carry both Jmag and JpgMag; JpgMag wins whenever it holds a
    // real measurement - if it's the sentinel it must not displace a good Jmag.
    if ('JpgMag' in guidestar && is_real_mag(guidestar.JpgMag)) {
        tgt.j_mag = guidestar.JpgMag
    }
    // Null every sentinel magnitude so the table renders an empty cell and the
    // magnitude filter doesn't read 99.9 as a real, very faint star.
    Object.entries(tgt).forEach(([key, value]) => {
        if (is_mag_key(key) && typeof value === 'number' && value >= MAG_SENTINEL) {
            tgt[key] = null
        }
    })
    // UCAC4/PANSTARRS/SAO/HIP names come back as numbers, so coerce before trimming.
    if (tgt.target_name != null) {
        tgt.target_name = String(tgt.target_name).trim()
    }
    // Panstarrs reports coordinates in degrees only, so the sexagesimal strings
    // the table displays have to be derived. Catalogs that send both (UCAC4)
    // keep what they sent.
    if (tgt.ra == null && tgt.ra_deg != null) {
        tgt.ra = deg_to_hms(Number(tgt.ra_deg))
    }
    if (tgt.dec == null && tgt.dec_deg != null) {
        tgt.dec = deg_to_dms(Number(tgt.dec_deg))
    }
    if (tgt.ra != null) {
        tgt.ra = String(tgt.ra).replace(/\s+/g, '');
        tgt.ra_deg = tgt.ra_deg ?? ra_dec_to_deg(tgt.ra);
    }
    if (tgt.dec != null) {
        tgt.dec = String(tgt.dec).replace(/\s+/g, '');
        tgt.dec_deg = tgt.dec_deg ?? ra_dec_to_deg(tgt.dec, true);
    }
    if (tgt.separation) {
        tgt.separation = Number(tgt.separation) * 3600
    }
    return tgt as Partial<Target>;
}

export const is_ao_instrument = (instrument: string) => {
    return AO_INSTRUMENTS.some(aoinst => instrument.includes(aoinst))
}
export const is_trick_instrument = (instrument: string) => {
    return TRICK_INSTRUMENTS.some(trickinst => instrument.includes(trickinst))
}

export const GuideStarDialog = (props: VizDialogProps) => {
    // target must have ra dec and be defined

    const context = useStateContext()
    const { targets, open } = props
    const [guideStarName, setGuideStarName] = useState<string>('')
    const [instrumentFOV, setInstrumentFOV] = useQueryParam('instrument_fov', withDefault(StringParam, 'OSIRIS'))
    const init_img_size = instrumentFOV === 'MOSFIRE' ? MOSFIRE_WINDOW_SIZE : DEFAULT_WINDOW_SIZE
    const [imgSize, setImgSize] = useState<number>(init_img_size)
    const [magRange, setMagRange] = useQueryParam('mag_range', withDefault(ArrayParam, undefined)) //set to undefined to prevent unwanted rerenders on initial load
    const [fovs, setFOVs] = React.useState<string[]>([])
    const [pointingOrigins, setPointingOrigins] = React.useState<POPointingOriginCollection | undefined>(undefined)
    const [contours, setContours] = React.useState<LaserContours>([])
    const [trickMap, setTrickMap] = React.useState<any>(undefined)
    const [selPointingOrigins, setSelPointingOrigins] = React.useState<POPointFeature[]>([])
    const [selPO, setSelPO] = React.useState<POPointFeature | undefined>(undefined)

    const [useLaser, setUseLaser] = useQueryParam('show_laser', withDefault(BooleanParam, true))
    const [showCatalog, setShowCatalog] = useQueryParam('show_catalog', withDefault(BooleanParam, true))
    const [showTrickMap, setShowTrickMap] = useQueryParam('show_trick_map', withDefault(BooleanParam, false))
    const [enableMagRange, setEnableMagRange] = React.useState<boolean>(false)
    const [filterByMag, setFilterByMag] = React.useState<MagFilter>(DEFAULT_MAG_FILTER)
    const [disableLaser, setDisableLaser] = React.useState<boolean>(
        is_ao_instrument(instrumentFOV) ? false : true
    )

    const [disableTrickMap, setDisableTrickMap] = React.useState<boolean>(is_trick_instrument(instrumentFOV) ? false : true)

    const [invertImage, setInvertImage] = useQueryParam('invert_image', withDefault(BooleanParam, false))
    const [rotatorAngle, setRotatorAngle] = React.useState(0)

    const [dome, setDome] = useQueryParam<Dome>('dome', withDefault(DomeParam, 'Keck 2' as Dome))

    let initTarget = targets.at(0) ?? {} as Target
    const [target, setTarget] = useState<Target>(initTarget)
    const [guidestars, setGuideStars] = useState<Partial<Target>[]>([])

    const [image, setImage] = useState<string | undefined>(undefined)
    const [imageLoading, setImageLoading] = useState<boolean>(false)
    const [catalogLoading, setCatalogLoading] = useState<boolean>(false)

    const [catalog, setCatalog] = useState<string | undefined>(undefined)
    const [catalogs, setCatalogs] = useState<string[]>([])

    const [imageCatalog, setImageCatalog] = useState<string | undefined>(undefined)
    const [imageCatalogs, setImageCatalogs] = useState<string[]>([])

    useEffect(() => {
        console.log('fetching catalogs and shapes')

        const fetch_and_set_catalogs = async () => {
            const cats = await get_catalogs()
            if (cats) {
                setCatalogs(cats)
                setCatalog(cats.at(0))
            }
            const getImageCat = await get_image_catalogs()
            if (getImageCat) {
                setImageCatalogs(getImageCat)
                setImageCatalog(getImageCat.at(0))
            }
        }

        const fetch_and_set_shapes = async () => {
            const featureCollection = await get_shapes('fov')
            const pos = await get_shapes('pointing_origins') as POPointingOriginCollection
            const cntrs = useLaser ? await get_shapes('laser_contours') : await get_shapes('fsm')
            const trkMap = showTrickMap ? await get_shapes('trick_map') : undefined
            const domeFovFeatures = featureCollection['features'].filter((feature: any) => {
                return feature['properties'].type === 'FOV'
            }).filter((feature: any) => {
                return feature['properties'].dome === dome
            })
            let newFovs = domeFovFeatures.map((feature: any) => feature['properties'].instrument) as string[]
            // filter out non-ao instruments
            newFovs = newFovs.filter((inst) => is_ao_instrument(inst) || is_trick_instrument(inst))
            setFOVs(newFovs)
            setPointingOrigins(pos)
            setContours(cntrs as unknown as LaserContours)
            setTrickMap(trkMap)
        }

        fetch_and_set_catalogs()
        fetch_and_set_shapes()

    }, [])

    useEffect(() => {  //refetch image when fov changes
        setImgSize(instrumentFOV === 'MOSFIRE' ? MOSFIRE_WINDOW_SIZE : DEFAULT_WINDOW_SIZE)
    }, [instrumentFOV])

    useEffect(() => {
        const fetch_and_set_laser_contours = async () => {
            const cntrs = useLaser ? await get_shapes('laser_contours') : await get_shapes('fsm')
            const trkMap = showTrickMap ? await get_shapes('trick_map') : undefined
            setContours(cntrs as unknown as LaserContours)
            setTrickMap(trkMap)
        }
        fetch_and_set_laser_contours()
    }, [useLaser, showTrickMap])

    useEffect(() => {
        if (targets.length > 0) {
            const target = targets.at(0) ?? {} as Target
            setTarget(target)
        }
    }, [targets])

    useEffect(() => {
        const handle_dome_change = async () => {
            if (dome === 'Keck 1') {
                setShowTrickMap(false)
            }
            const featureCollection = await get_shapes('fov')
            const domeFovFeatures = featureCollection['features'].filter((feature: any) => {
                return feature['properties'].type === 'FOV' && feature['properties'].dome === dome
            })
            let newFovs = domeFovFeatures.map((feature: any) => feature['properties'].instrument) as string[]
            newFovs = newFovs.filter((inst) => is_ao_instrument(inst) || is_trick_instrument(inst))
            setFOVs(newFovs)
            !newFovs.includes(instrumentFOV) && setInstrumentFOV(newFovs.at(0) ?? '')
        }
        handle_dome_change()
    }, [dome])

    useEffect(() => {
        setDisableLaser(!is_ao_instrument(instrumentFOV))
        setUseLaser(is_ao_instrument(instrumentFOV) ? useLaser : false)
        setDisableTrickMap(!is_trick_instrument(instrumentFOV))
        setShowTrickMap(is_trick_instrument(instrumentFOV) ? showTrickMap : false)
    }, [instrumentFOV])

    useEffect(() => {
        const fun = async () => {
            const ra = target.ra_deg ?? ra_dec_to_deg(String(target.ra ?? DEFAULT_RA))
            const dec = target.dec_deg ?? ra_dec_to_deg(String(target.dec ?? DEFAULT_DEC), true)
            if (catalog) {
                setCatalogLoading(true)
                let mr = Array.isArray(magRange) && magRange.length >= 2 ?
                    [String(magRange[0]), String(magRange[1])] as [string, string] : undefined
                mr = enableMagRange ? mr : undefined
                const gs = await get_catalog_targets(
                    catalog,
                    ra,
                    dec,
                    imgSize / 6, // use a smaller search radius than the image window size to avoid too many stars in the table
                    mr
                )
                if (Array.isArray(gs)) {

                    const gsTgts = gs.map((star: AnyCatalogTarget) => {
                        const tgt = guidestar_to_target(star, pick_catalog_map(star, context.config))
                        return tgt
                    })
                    setGuideStars(gsTgts)
                }
                setCatalogLoading(false)

            }
            if (imageCatalog) {
                setImageLoading(true)
                const img = get_catalog_image(imageCatalog, ra, dec, imgSize)
                setImage(img)
            }

        }
        fun()
    }, [catalog, target, imageCatalog, imgSize, enableMagRange])

    useEffect(() => {
        const fun = async () => {
            setCatalogLoading(true)
            const ra = target.ra_deg ?? ra_dec_to_deg(String(target.ra ?? 0))
            const dec = target.dec_deg ?? ra_dec_to_deg(String(target.dec ?? 0), true)
            const mr = Array.isArray(magRange) && magRange.length >= 2 ? [String(magRange[0]), String(magRange[1])] as [string, string] : undefined
            if (catalog) {
                console.log('mag range changed. fetching catalog targets with mag range', mr)
                const gs = await get_catalog_targets(
                    catalog,
                    ra,
                    dec,
                    imgSize,
                    mr
                )
                if (Array.isArray(gs)) {
                    const gsTgts = gs.map((star: AnyCatalogTarget) => {
                        const tgt = guidestar_to_target(star, pick_catalog_map(star, context.config))
                        return tgt
                    })
                    setGuideStars(gsTgts)
                }
                setCatalogLoading(false)
            }
        }
        fun()
    }, [magRange, instrumentFOV])


    const onTargetNameSelect = (name: string) => {
        const targetName = target.target_name ?? target._id
        if (name !== targetName) {
            let newTarget = targets.find((t: Target) => t.target_name === name || t._id === name)
            newTarget = (newTarget && newTarget.ra && newTarget.dec) ? newTarget : {} as Target
            setTarget(newTarget)
        }
    }

    // const onGuideStarNameSelect = (name: string) => {
    //     if (name !== guideStarName) { //ignore setting guide star if the target is selected
    //         let newGuideStar = guidestars.find((gs: Partial<Target>) => gs.target_name === name)
    //         if (newGuideStar) {
    //             setGuideStarName(name)
    //         }
    //     }
    // }

    const dialogTitle = (
        <span>Guide Star Selection</span>
    )

    const telContours = contours?.find((feature) => feature.properties.telescope === dome)
    const centerRa = target.ra_deg ?? ra_dec_to_deg(String(target.ra ?? 0))
    const centerDec = target.dec_deg ?? ra_dec_to_deg(String(target.dec ?? 0), true)

    // Client-side refinement on top of whatever the backend already filtered by:
    // keep a guide star only if every magnitude column the user checked falls
    // within magRange. No columns checked ("None") means no extra filtering.
    const activeMagKeys = MAG_KEYS.filter((key) => filterByMag[key])
    const filteredGuideStars = React.useMemo(() => {
        if (activeMagKeys.length === 0 || !Array.isArray(magRange) || magRange.length < 2) {
            return guidestars
        }
        const min = Number(magRange[0])
        const max = Number(magRange[1])
        return guidestars.filter((star) => activeMagKeys.every((key) => {
            const val = star[key]
            return typeof val === 'number' && val >= min && val <= max
        }))
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [guidestars, filterByMag, magRange])

    const dialogContent = (
        <Stack
            sx={{
                paddingTop: '16px',
                display: 'flex',
                flexWrap: 'wrap',
            }}
            direction='column'>
            <Stack direction='row' spacing={0}>
                {
                    imageCatalog && (
                        <Tooltip title={'Select Image Catalog'}>
                            <Autocomplete
                                disablePortal
                                id="selected-image-catalog"
                                value={imageCatalog}
                                onChange={(_, value) => value && (setImageCatalog(value))}
                                options={imageCatalogs}
                                sx={{ width: '150px', paddingTop: '9px', margin: '6px' }}
                                renderInput={(params) => <TextField {...params} label={'Selected Image Catalog'} />}
                            />
                        </Tooltip>
                    )
                }
                {
                    catalog && (
                        <Tooltip title={'Select Guide Star from Catalog'}>
                            <Autocomplete
                                disablePortal
                                id="selected-catalog"
                                value={catalog}
                                onChange={(_, value) => value && (setCatalog(value))}
                                options={catalogs}
                                sx={{ width: '150px', paddingTop: '9px', margin: '6px' }}
                                renderInput={(params) => <TextField {...params} label={'Selected Catalog'} />}
                            />
                        </Tooltip>
                    )
                }
                <Tooltip title={'Target'}>
                    <Autocomplete
                        disablePortal
                        id="selected-target"
                        value={target.target_name ?? target._id}
                        onChange={(_, value) => value && onTargetNameSelect(value)}
                        options={targets.map(target => target.target_name ?? target._id)}
                        sx={{ width: '200px', paddingTop: '9px', margin: '6px' }}
                        renderInput={(params) => <TextField {...params} label={'Selected Target'} />}
                    />
                </Tooltip>
                <Tooltip title={'Rotator angle for Field of View'}>
                    <TextField
                        sx={{ width: '100px', paddingTop: '9px', margin: '6px' }}
                        label={'Rotator Angle'}
                        id="rotator-angle"
                        value={rotatorAngle}
                        onChange={(event) => setRotatorAngle(Number(event.target.value))}
                    />
                </Tooltip>
                <DomeSelect
                    dome={dome}
                    setDome={setDome}
                />
                <FOVSelect
                    fovs={fovs}
                />
                {pointingOrigins && (
                    <POSelect
                        pointing_origins={pointingOrigins}
                        instrument={instrumentFOV}
                        selPointingOrigins={selPointingOrigins}
                        setSelPointingOrigins={setSelPointingOrigins}
                        selPO={selPO}
                        setSelPO={setSelPO}
                    />
                )}
            </Stack>
            <Stack direction='row' spacing={0}>
                <UploadDialog
                    setTargets={setGuideStars}
                />
                <FormControlLabel
                    label="Invert Image"
                    value={invertImage}
                    control={<Switch checked={invertImage} />}
                    onChange={(_, checked) => setInvertImage(checked)}
                />
                <FormControlLabel
                    label="Show Laser"
                    value={useLaser}
                    disabled={disableLaser}
                    control={<Switch checked={useLaser} />}
                    onChange={(_, checked) => setUseLaser(checked)}
                />
                <FormControlLabel
                    label="Show Catalog Icons"
                    value={showCatalog}
                    control={<Switch checked={showCatalog} />}
                    onChange={(_, checked) => setShowCatalog(checked)}
                />
                <FormControlLabel
                    label="Show Trick Map"
                    value={showTrickMap}
                    disabled={disableTrickMap}
                    control={<Switch checked={showTrickMap} />}
                    onChange={(_, checked) => setShowTrickMap(checked)}
                />
                {
                    dome.includes('Keck 1') && 
                    <AGTimeToLimit target={target} rotatorAngle={rotatorAngle}/>
                }
                <Box sx={{ flexGrow: 1 }} />
                <div style={{ marginRight: "16px" }}>
                <MagFilterSelect
                    filterByMag={filterByMag}
                    setFilterByMag={setFilterByMag}
                    disabled={!enableMagRange}
                />
                </div>
                <div style={{ marginRight: "16px" }}>
                    <MagRangeSlider
                        range={magRange as [string, string]}
                        setRange={setMagRange}
                        disabled={!enableMagRange}
                    />
                </div>
                <FormControlLabel
                    label="Enable Mag Range"
                    value={enableMagRange}
                    control={<Switch checked={enableMagRange} />}
                    onChange={(_, checked) => setEnableMagRange(checked)}
                />
            </Stack>
            <Stack direction='row' justifyContent={'center'} spacing={2} sx={{ marginTop: '16px' }}>
                <Stack direction='column' sx={{ position: 'relative', display: 'inline-block' }}>
                    {imageLoading && (
                        <Typography
                            sx={{
                                position: 'absolute',
                                top: '50%',
                                left: '50%',
                                transform: 'translate(-50%, -50%)',
                                fontSize: '24px',
                                fontWeight: 'bold',
                                color: 'white',
                                backgroundColor: 'rgba(0, 0, 0, 0.7)',
                                padding: '16px',
                                borderRadius: '8px',
                                zIndex: 10
                            }}
                        >
                            Loading...
                        </Typography>
                    )}
                    <React.Suspense fallback={<LazyFallback height={600} />}>
                        < GSViewer
                            imgUrl={image ?? ''}
                            guideStars={filteredGuideStars as Target[]}
                            height={600}
                            width={600}
                            size={imgSize} // in degrees
                            centerRA={centerRa} // in degrees
                            centerDec={centerDec} // in degrees
                            guideStarName={guideStarName}
                            setGuideStarName={setGuideStarName}
                            setImageLoading={setImageLoading}
                            instrumentFOV={instrumentFOV}
                            fovAngle={rotatorAngle}
                            positionAngle={target.rotator_pa ? Number(target.rotator_pa) : 0}
                            selPO={selPO}
                            pointingOrigins={selPointingOrigins}
                            invertImage={invertImage}
                            showLaser={useLaser}
                            showCatalog={showCatalog}
                            contours={telContours}
                            showTrickMap={showTrickMap}
                            trickMap={trickMap}
                            scienceTargetName={target.target_name ?? target._id}
                        />
                    </React.Suspense>
                </Stack>
                <Stack direction='column' justifyContent='center' sx={{ position: 'relative', display: 'inline-block' }}>
                    {catalogLoading && (
                        <Typography
                            sx={{
                                position: 'absolute',
                                top: '50%',
                                left: '50%',
                                transform: 'translate(-50%, -50%)',
                                fontSize: '24px',
                                fontWeight: 'bold',
                                color: 'white',
                                backgroundColor: 'rgba(0, 0, 0, 0.7)',
                                padding: '16px',
                                borderRadius: '8px',
                                zIndex: 10
                            }}
                        >
                            Catalog Loading...
                        </Typography>
                    )}
                    <GuideStarTable
                        selectedGuideStarName={guideStarName}
                        setSelectedGuideStarName={setGuideStarName}
                        guidestars={filteredGuideStars}
                        useLaser={useLaser}
                        science_target_name={target.target_name ?? target._id}
                    />
                </Stack>
            </Stack>
        </Stack>
    )

    return (
        <DialogComponent
            open={open}
            handleClose={props.handleClose}
            titleContent={dialogTitle}
            children={dialogContent}
            maxWidth="xl"
            minWidth={1600}
        />
    )
}

