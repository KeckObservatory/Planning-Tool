/**
 * Lightweight pieces shared by the 2D view, guide star, and starlist modules.
 *
 * These used to live in two_d_view.tsx and target_viz_chart.tsx, which pull in
 * plotly and aladin-lite. Anything importing them dragged ~7MB of charting code
 * into the initial bundle, so keep this module free of heavy imports.
 */
import React from 'react';
import { FormControl, FormControlLabel, FormLabel, Radio, RadioGroup } from '@mui/material';
import { createEnumParam } from 'use-query-params';
import dayjs from 'dayjs';
import { FeatureCollection, MultiPolygon, Polygon } from 'geojson';
import { FOVlink } from './constants.tsx';
import type { GeoModel, Target } from '../App.tsx';
import type { BlockReason, VizRow } from './viz_dialog.tsx';

export type Dome = "Keck 1" | "Keck 2"

export const DomeParam = createEnumParam<Dome>(['Keck 1', 'Keck 2'])

export interface TargetView extends Target {
    dome: Dome,
    date: Date,
    ra_deg: number,
    dec_deg: number,
    visibility: VizRow[],
    visibilitySum: number
}

interface DomeSelectProps {
    dome: Dome
    setDome: (dome: Dome) => void
}

export const DomeSelect = (props: DomeSelectProps) => {
    const { dome, setDome } = props

    const handleDomeChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        setDome(event.target.value as Dome)
    }

    return (
        <FormControl>
            <FormLabel id="dome-row-radio-buttons-group-label">Dome</FormLabel>
            <RadioGroup
                row
                aria-labelledby="dome-row-radio-buttons-group-label"
                name="dome-radio-buttons-group"
                value={dome}
                onChange={handleDomeChange}
            >
                <FormControlLabel value="Keck 1" control={<Radio />} label="Keck 1" />
                <FormControlLabel value="Keck 2" control={<Radio />} label="Keck 2" />
            </RadioGroup>
        </FormControl>
    )
}

export const hidate = (date: Date, timezone: string) => {
    return dayjs(date).tz(timezone)
}

export type ShapeCatagory = 'fov' | 'compass_rose' | 'pointing_origins' | 'laser_contours' | 'fsm' | 'trick_map'

interface ShapeCfgFile {
    fov: FeatureCollection<MultiPolygon>
    compass_rose: FeatureCollection<Polygon>
    pointing_origins: FeatureCollection<GeoJSON.Geometry>
    laser_contours: FeatureCollection<GeoJSON.MultiLineString>
    fsm: FeatureCollection<GeoJSON.MultiLineString>
    trick_map: FeatureCollection<GeoJSON.MultiLineString>
}

let shapesPromise: Promise<ShapeCfgFile> | null = null

const load_shapes = (): Promise<ShapeCfgFile> => {
    if (!shapesPromise) {
        shapesPromise = fetch(FOVlink).then((resp) => resp.json())
    }
    return shapesPromise
}

export const get_shapes = async (fcType: ShapeCatagory) => {
    const json = await load_shapes()
    return json[fcType]
}

export const alt_az_observable = (alt: number, az: number, geoModel: GeoModel) => {
    const minDeckAz = geoModel.t2
    const maxDeckAz = geoModel.t3
    const minAlt = geoModel.r1
    const deckAlt = geoModel.r3
    const trackLimit = geoModel.trackLimit

    const reasons: Array<BlockReason> = []
    //nasdeck is blocking the target?
    const targetOverlapsDeck = az >= minDeckAz && az <= maxDeckAz
    const targetBelowDeck = alt >= minAlt && alt <= deckAlt
    const deckBlocking = targetOverlapsDeck && targetBelowDeck
    deckBlocking && reasons.push('Deck Blocking')

    //target is below telescope horizon?
    const targetBelowHorizon = alt < minAlt
    targetBelowHorizon && reasons.push('Below Horizon')

    //target is above tracking limits?
    const targetAboveTrackingLimits = alt > trackLimit
    targetAboveTrackingLimits && reasons.push('Above Tracking Limits')

    const observable = !deckBlocking && !targetBelowHorizon && !targetAboveTrackingLimits
    return { observable, reasons }
}
