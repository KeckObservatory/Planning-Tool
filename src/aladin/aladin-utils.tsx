import { cosd, sind, r2d } from '../two-d-view/sky_view_util.tsx'
import { Feature, FeatureCollection, MultiPolygon, Polygon, Position } from 'geojson'
import { get_shapes } from "../two-d-view/two_d_view_common.tsx"

export const rotate_point = (point: Position[], angle: number, pnt=[0,0]) => {
        let [x, y] = point as unknown as [number, number]
        x -= pnt[0]
        y -= pnt[1]
        let newPoint = [
            x * cosd(angle) - y * sind(angle),
            x * sind(angle) + y * cosd(angle)
        ]
        newPoint[0] += pnt[0]
        newPoint[1] += pnt[1]
        return newPoint as unknown as Position[]
}

const rotate_multipolygon = (coords: Position[][][], angle: number, pnt=[0,0]) => {

    const rotFOV = coords.map(shape => {
        const newShape = shape.map(point => {
            const rotatedPoint = rotate_point(point, angle, pnt)
            return rotatedPoint
        })
        return newShape
    })
    return rotFOV
}

const get_angle = (aladin: any) => {
    //Compass rose is a euclidian object put onto a non-euclidian projection, 
    //so we need to calculate the angle of two vectors that are small enough to be approximately euclidian
    //usually 5 arcminutes is good enough
    const [ra, dec] = aladin.getRaDec() as [number, number]
    const dra = 5 / (24 * 60) //hours 5 minutes is probably good
    const ddec = 90 //deg
    // const dra = 5/(24*60) //hours 5 minutes is probably good
    // const ddec = 5/60 //deg

    const [x0, y0] = aladin.world2pix(ra, dec) // originate compass on center of screen
    const [x1, y1] = aladin.world2pix(ra, dec + ddec) //point up 
    const [x2, y2] = aladin.world2pix(ra + dra, dec) //point left 
    const angle = r2d(Math.atan2((y2 - x0) * (x1 - x0) - (y1 - y0) * (x2 - x0), (x1 - x0) * (x2 - x0) + (y1 - y0) * (y2 - y0)))
    return angle
}

export const get_compass = async (aladin: any, height: number, width: number, positionAngle: number) => {
    console.log('Getting compass for aladin', aladin, 'with height', height, 'and width', width, 'and positionAngle', positionAngle)
    const fc = await get_shapes('compass_rose') as FeatureCollection<Polygon>
    const angle = 90 + get_angle(aladin) // rotate to match compass
    const aladinAngle = aladin.getViewCenter2NorthPoleAngle()
    // const wcs = aladin.getViewWCS()
    fc['features'].forEach((f) => {
        let polygon = f.geometry.coordinates
        const offsetx = f.properties?.offsetx
        const offsety = f.properties?.offsety
        const margin = f.properties?.margin ?? 50
        polygon = [...polygon, polygon[0]]
        polygon = polygon.map((point) => {
            const [x, y] = point as unknown as [number, number]
            return [x + width - margin + offsetx, y + height - margin + offsety] as unknown as Position[]
        })
        const rotPnt = [width - margin, height - margin ]
        const compassAngle = -1 * (angle + positionAngle + aladinAngle)
        polygon = rotate_multipolygon([polygon], compassAngle, rotPnt)[0]
        f.geometry.coordinates = polygon
    })
    return fc
}

export const get_fovz = async (ra: number, dec: number, aladin: any, instrumentFOV: string, angle: number, offset: [number, number]) => {
    const fc = await get_shapes('fov')
    const features = fc['features'].filter((f: any) => f['properties'].type === 'FOV')
    const feature = features.find((f: any) => f['properties'].instrument === instrumentFOV)
    if (!feature) return { fov: [], zoom: 5 } 
    const multipolygon = (feature as Feature<MultiPolygon>).geometry.coordinates
    const rotPolygon = rotate_multipolygon(multipolygon, angle, offset )
    const polygons = rotPolygon.map((polygon: Position[][]) => {
        let absPolygon = [...polygon, polygon[0]]
        absPolygon = absPolygon
            .map((point) => {
                const [x, y] = point as unknown as [number, number]
                return [x / 3600 + ra, y / 3600 + dec]
            })
            .map((point) => {
                const [x, y] = point as unknown as [number, number]
                const pix = aladin.world2pix(x, y)
                return pix
            })
        return absPolygon
    })

    const zoom = feature?.properties?.zoom ?? 1
    const out = { fov: polygons as Position[][][], zoom: zoom as number }
    return out 
}