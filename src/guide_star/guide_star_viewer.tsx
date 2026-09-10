import { Target, useStateContext } from "../App"
import React from "react"
import * as d3 from "d3"
import { useTheme } from "@mui/material/styles"
import { get_shapes } from "../two-d-view/two_d_view_common.tsx"
import { POPointFeature, TelescopeContours } from "../two-d-view/pointing_origin_select"
import { Feature, Point } from "geojson"
import { PointingOriginMarkers, PointingOriginMarker } from "../aladin/pointing_origin_markers"
import { ScaleBar } from "./scale_bar"
import { CompassRose } from "./compass_rose"
import { ZOOM_SPEED, ZOOM_MIN, ZOOM_MAX, MOSFIRE_ZOOM_DEFAULT, ZOOM_DEFAULT } from "../two-d-view/constants"
import IconButton from "@mui/material/IconButton"
import Tooltip from "@mui/material/Tooltip"
import DownloadIcon from '@mui/icons-material/Download'
import { is_guidestar_already_added } from "./guide_star_table.tsx"

// Compute brightness/contrast percentages from a pointer position within the viewer bounds.
// Contrast is driven by the y-axis: top of the viewer = 100%, bottom = 0%.
// Brightness/bias is driven by the x-axis: left of the viewer = 0%, right = 100%.
const computeColorStretch = (
  clientX: number,
  clientY: number,
  bounds: DOMRect
): { brightness: number; contrast: number } => {
  const relX = Math.min(1, Math.max(0, (clientX - bounds.left) / bounds.width));
  const relY = Math.min(1, Math.max(0, (clientY - bounds.top) / bounds.height));
  const brightness = relX * 100;
  const contrast = (1 - relY) * 100;
  return { brightness, contrast };
};

// Marks on-screen controls that live inside the viewer but must stay out of a
// saved image. Anything rendered under this class is skipped when composing the
// export - add it to any future overlay UI.
const VIEWER_CHROME_CLASS = 'gs-viewer-chrome'

// Ray-casting point-in-polygon test, operating in pixel coordinates.
const point_within_polygon = (point: [number, number], polygon: [number, number][]): boolean => {
  const [x, y] = point;
  let inside = false; //start with odd
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    const intersects = ((yi > y) !== (yj > y)) &&
      (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
    if (intersects) inside = !inside; //change parity (even -> odd or odd-> even)
  }
  return inside; //if even, then point is inside polygon
};

interface Props {
  imgUrl: string
  guideStars: Target[]
  height: number // in pixels
  width: number // in pixels
  size: number // in degrees
  centerRA: number // in degrees
  centerDec: number // in degrees
  guideStarName?: string
  setGuideStarName?: (name: string) => void
  setImageLoading: (loading: boolean) => void
  instrumentFOV?: string
  fovAngle?: number
  positionAngle?: number
  selPO?: POPointFeature
  pointingOrigins?: Feature<Point, { name?: string }>[]
  invertImage?: boolean
  showLaser?: boolean
  showCatalog?: boolean
  contours?: TelescopeContours// LaserContours
  showTrickMap?: boolean
  trickMap?: any // trick_map FeatureCollection
  scienceTargetName?: string
}
export const GSViewer = (props: Props) => {

  const theme = useTheme();
  const context = useStateContext();

  const initZoom = props.instrumentFOV === 'MOSFIRE' ? MOSFIRE_ZOOM_DEFAULT : ZOOM_DEFAULT

  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const svgRef = React.useRef<SVGSVGElement | null>(null);
  const fovSvgRef = React.useRef<SVGSVGElement | null>(null);
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const [zoom, setZoom] = React.useState<number>(initZoom); // 1 = no zoom
  const [panOffset, setPanOffset] = React.useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = React.useState<boolean>(false);
  const [dragStart, setDragStart] = React.useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isStretching, setIsStretching] = React.useState<boolean>(false);
  const [brightness, setBrightness] = React.useState<number>(100);
  const [contrast, setContrast] = React.useState<number>(100);
  const degPerPixel = (props.size / props.width) / zoom // degrees per pixel, adjusted for zoom
  const [fov, setFOV] = React.useState<any>(null)
  const [laserContours, setLaserContours] = React.useState<Array<{ name: string; color: string; lines: Array<Array<[number, number]>> }>>([]);
  const [trickMapContours, setTrickMapContours] = React.useState<Array<{ name: string; color: string; lines: Array<Array<[number, number]>> }>>([]);

  // A pointing origin is where the telescope puts the target in the instrument's
  // focal plane, so selecting one re-points the telescope: the whole instrument
  // frame - FOV outline, laser and trick contours, and the pointing origin markers -
  // slides against the sky image, which stays fixed on the target. Measuring every
  // instrument-frame offset from the selected origin puts that origin at the centre,
  // which is where the target is.
  const [selPODra, selPODdec] = props.selPO?.geometry.coordinates ?? [0, 0];

  // Convert an instrument-frame arcseconds offset to pixel coordinates
  const arcsecToPixel = (dra: number, ddec: number): [number, number] => {
    const x = ((dra - selPODra) / (3600 * degPerPixel)) + props.width / 2;
    const y = ((ddec - selPODdec) / (3600 * degPerPixel)) + props.height / 2;
    return [x, y];
  }

  // The image and catalog stay fixed on screen; the instrument-frame overlays (FOV,
  // laser/trick contours, pointing origins) carry the rotation instead, so they turn
  // the opposite way from how the image used to.
  const overlayRotation = -(props.fovAngle || 0);

  // Rotate a pixel coordinate about the viewer center. Positive degrees are clockwise
  // on screen, matching the CSS rotate() applied to the FOV layer.
  const rotateAboutCenter = (x: number, y: number, deg: number): [number, number] => {
    const rad = (deg * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const cx = props.width / 2;
    const cy = props.height / 2;
    const dx = x - cx;
    const dy = y - cy;
    return [cx + dx * cos - dy * sin, cy + dx * sin + dy * cos];
  }

  // Convert pointing origins to pixel coordinates for markers
  const pointingOriginMarkers = React.useMemo((): PointingOriginMarker[] => {
    if (!props.pointingOrigins) {
      return [];
    }

    return props.pointingOrigins.map((feature) => {
      const [dra, ddec] = feature.geometry.coordinates; // arcseconds offset
      const [px, py] = arcsecToPixel(dra, ddec);
      // Rotate the marker position rather than the whole layer, so the labels stay upright.
      const position = rotateAboutCenter(px, py, overlayRotation);
      const name = feature.properties?.name ?? 'Unknown';

      return {
        name,
        position
      };
    });
  }, [props.pointingOrigins, props.centerRA, props.centerDec, props.width, props.height, degPerPixel, props.selPO, zoom, props.fovAngle]);

  // Convert laser contours to pixel coordinates
  React.useEffect(() => {

    if (!props.showLaser || !props.contours) {
      setLaserContours([]);
      return;
    }

    // Handle both FeatureCollection format and direct array format
    const features = (props.contours.features || props.contours) as any[];
    if (!features || features.length === 0) {
      setLaserContours([]);
      return;
    }

    const convertedContours = features.map((feature: any) => {
      const lines = feature.geometry.coordinates.map((lineseg: [[number, number], [number, number]]) => {
        // Convert from arcseconds to pixel coordinates
        const [dra1, ddec1] = lineseg[0]; // arcseconds
        const [dra2, ddec2] = lineseg[1]; // arcseconds
        const [x1, y1] = arcsecToPixel(dra1, ddec1);
        const [x2, y2] = arcsecToPixel(dra2, ddec2);
        return [[x1, y1] as [number, number], [x2, y2] as [number, number]];
      });
      const name = feature.properties?.name ?? 'Unknown';
      const color = feature.properties?.color ?? 'magenta';
      return {
        name,
        color,
        lines
      };
    });

    setLaserContours(convertedContours);
  }, [props.contours, props.showLaser, props.width, props.height, degPerPixel, zoom, props.selPO]);

  // Convert trick map to pixel coordinates
  React.useEffect(() => {

    if (!props.showTrickMap || !props.trickMap) {
      setTrickMapContours([]);
      return;
    }

    // Handle both FeatureCollection format and direct array format
    const features = (props.trickMap.features || props.trickMap) as any[];
    if (!features || features.length === 0) {
      setTrickMapContours([]);
      return;
    }


    const convertedTrickMap = features.map((feature: any) => {
      const lines = feature.geometry.coordinates.map((lineseg: [[number, number], [number, number]]) => {
        // Convert from arcseconds to pixel coordinates
        const [dra1, ddec1] = lineseg[0]; // arcseconds
        const [dra2, ddec2] = lineseg[1]; // arcseconds
        const [x1, y1] = arcsecToPixel(dra1, ddec1);
        const [x2, y2] = arcsecToPixel(dra2, ddec2);
        return [[x1, y1] as [number, number], [x2, y2] as [number, number]];
      });
      const name = feature.properties?.name ?? 'Unknown';
      const color = feature.properties?.color ?? '#FF00FF'; // Default magenta
      return {
        name,
        color,
        lines
      };
    });

    setTrickMapContours(convertedTrickMap);
  }, [props.trickMap, props.showTrickMap, props.width, props.height, degPerPixel, zoom, props.selPO]);

  // Draw laser contours on SVG
  React.useEffect(() => {

    // We'll add the contours to the FOV SVG layer
    const fovSvg = fovSvgRef.current;
    if (!fovSvg) {
      return;
    }

    // Remove previous contour lines (always clear first)
    d3.select(fovSvg).selectAll('line.laser-contour').remove();

    if (!laserContours || laserContours.length === 0) {
      return;
    }


    // Draw each contour
    laserContours.forEach((contour) => {
      contour.lines.forEach((line) => {
        const [x1, y1] = line[0];
        const [x2, y2] = line[1];

        d3.select(fovSvg).append('line')
          .attr('x1', x1)
          .attr('y1', y1)
          .attr('x2', x2)
          .attr('y2', y2)
          .attr('stroke', contour.color)
          .attr('stroke-width', 1.5)
          .attr('opacity', 0.7)
          .attr('class', 'laser-contour');
      });
    });
  }, [laserContours, panOffset, zoom]);

  // Draw trick map contours on SVG
  React.useEffect(() => {

    // We'll add the contours to the FOV SVG layer
    const fovSvg = fovSvgRef.current;
    if (!fovSvg) {
      return;
    }

    // Remove previous trick map lines (always clear first)
    d3.select(fovSvg).selectAll('line.trick-map-contour').remove();

    if (!trickMapContours || trickMapContours.length === 0) {
      return;
    }

    // Draw each contour
    trickMapContours.forEach((contour) => {
      contour.lines.forEach((line) => {
        const [x1, y1] = line[0];
        const [x2, y2] = line[1];

        d3.select(fovSvg).append('line')
          .attr('x1', x1)
          .attr('y1', y1)
          .attr('x2', x2)
          .attr('y2', y2)
          .attr('stroke', contour.color)
          .attr('stroke-width', 1.0)
          .attr('opacity', 0.5)
          .attr('class', 'trick-map-contour');
      });
    });
  }, [trickMapContours, panOffset, zoom]);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const image = new Image();
    image.src = props.imgUrl;
    image.crossOrigin = "Anonymous"; // Handle potential CORS issues if images are external

    image.onload = () => {
      // Set canvas dimensions to match the image
      canvas.width = props.width;
      canvas.height = props.height;
      // Draw the image onto the canvas
      ctx.drawImage(image, 0, 0, props.width, props.height);
      // Draw guide stars on top of the image
      // Image has truly loaded, set loading to false
      props.setImageLoading(false);
    };

    image.onerror = () => {
      // Image failed to load (e.g., 404), keep loading as true
      console.error('Failed to load image:', props.imgUrl);
    };
  }, [props.imgUrl, props.guideStars]); // Redraw if image URL or objects change

  const fovPolygons = React.useMemo((): [number, number][][] => {
    if (!fov) return [];
    const toPixel = (coord: [number, number]): [number, number] => {
      const [dra, ddec] = coord; // arcseconds offset from the instrument origin
      const [x, y] = arcsecToPixel(dra, ddec);
      return rotateAboutCenter(x, y, overlayRotation);
    };
    if (fov.geometry.type === 'MultiPolygon') {
      return fov.geometry.coordinates.map((ring: [number, number][]) => ring.map(toPixel));
    } else if (fov.geometry.type === 'Polygon') {
      return [fov.geometry.coordinates[0].map(toPixel)];
    }
    return [];
  }, [fov, props.width, props.height, degPerPixel, overlayRotation, props.selPO]);

  React.useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    // Clear previous markers (circles for in-FOV catalog targets, x's for out-of-FOV, center marker)
    d3.select(svg).selectAll('circle, path.gs-marker-x, path.gs-center-marker').remove();

    //if show catalog is off, do not draw icons
    if (!props.showCatalog) {
      return
    }

    const handleStarClick = (event: MouseEvent, d: Target) => {
      event.stopPropagation(); // Prevent pan from triggering
      const starName = d.target_name || `RA: ${d.ra_deg}, Dec: ${d.dec_deg}`;
      if (props.setGuideStarName) {
        props.setGuideStarName(starName);
      }
    };

    // RA degrees must be scaled by cos(dec) to get true angular separation on the sky.
    const cosDec = Math.cos(props.centerDec * Math.PI / 180);
    const markerRadius = 5;

    props.guideStars.forEach((d: Target) => {
      const cx = (props.centerRA - (d.ra_deg || 0)) * cosDec / degPerPixel + props.width / 2;
      const cy = (props.centerDec - (d.dec_deg || 0)) / degPerPixel + props.height / 2;
      const selected = d.target_name === props.guideStarName;
      const alreadyAdded = is_guidestar_already_added(d, props.scienceTargetName, context.targets);
      // Yellow if selected, green if already added to the target list, red otherwise;
      // transparent fill either way.
      const fill = selected ? 'rgba(255, 255, 0, 0.0)' : 'rgba(255, 0, 0, 0.0)';
      const stroke = selected ? 'yellow' : (alreadyAdded ? theme.palette.success.main : 'red');
      // No FOV loaded yet means we can't test membership - show everything as a circle.
      const inFov = fovPolygons.length === 0 ||
        fovPolygons.some((poly) => point_within_polygon([cx, cy], poly));

      if (inFov) {
        d3.select(svg).append('circle')
          .attr('cx', cx)
          .attr('cy', cy)
          .attr('r', markerRadius)
          .attr('fill', fill)
          .attr('stroke', stroke)
          .attr('stroke-width', 2)
          .attr('cursor', 'pointer')
          .on('click', (event: MouseEvent) => handleStarClick(event, d));
      } else {
        d3.select(svg).append('path')
          .attr('class', 'gs-marker-x')
          .attr('d', `M${cx - markerRadius},${cy - markerRadius} L${cx + markerRadius},${cy + markerRadius} `
            + `M${cx - markerRadius},${cy + markerRadius} L${cx + markerRadius},${cy - markerRadius}`)
          .attr('stroke', stroke)
          .attr('stroke-width', 2)
          .attr('fill', 'none')
          .attr('cursor', 'pointer')
          .on('click', (event: MouseEvent) => handleStarClick(event, d));
      }
    });

    // Green x marking the center RA/Dec; not clickable.
    const centerX = props.width / 2;
    const centerY = props.height / 2;
    d3.select(svg).append('path')
      .attr('class', 'gs-center-marker')
      .attr('d', `M${centerX - markerRadius},${centerY - markerRadius} L${centerX + markerRadius},${centerY + markerRadius} `
        + `M${centerX - markerRadius},${centerY + markerRadius} L${centerX + markerRadius},${centerY - markerRadius}`)
      .attr('stroke', 'green')
      .attr('stroke-width', 2)
      .attr('fill', 'none');
  }, [props.guideStars, props.centerRA, props.showCatalog, props.centerDec, props.width, props.height, degPerPixel, props.guideStarName, zoom, props.fovAngle, fovPolygons, props.scienceTargetName, context.targets, theme]);

  // Fetch and update FOV shapes
  React.useEffect(() => {
    const updateFOV = async () => {
      if (!props.instrumentFOV) return;
      try {
        const featureCollection = await get_shapes('fov');
        const features = featureCollection['features'].filter((feature: any) => {
          return feature['properties'].type === 'FOV' && feature['properties'].instrument === props.instrumentFOV;
        });
        if (features.length > 0) {
          setFOV(features[0]);
        }
      } catch (error) {
        console.error('Failed to fetch FOV shapes:', error);
      }
    };
    updateFOV();

  }, [props.instrumentFOV]);

  // Draw FOV on SVG
  React.useEffect(() => {
    const fovSvg = fovSvgRef.current;
    if (!fovSvg || !fov) return;

    // Clear previous FOV
    d3.select(fovSvg).selectAll('path').remove();

    const feature = fov;
    if (feature.geometry.type === 'MultiPolygon') {
      const polygons = feature.geometry.coordinates; // array of polygons

      polygons.forEach((coordinates: [number, number][]) => {

        // Transform world coordinates to pixel coordinates
        const points = coordinates.map((coord: [number, number]) => {
          const dra = coord[0]; // arcseconds offset from the instrument origin
          const ddec = coord[1]; // arcseconds offset from the instrument origin
          return arcsecToPixel(dra, ddec);
        });

        // Draw polygon
        d3.select(fovSvg).append('path')
          .attr('d', () => {
            const pathData = (points as Array<[number, number]>).map((p: [number, number], i: number) => {
              return (i === 0 ? 'M' : 'L') + p[0] + ',' + p[1];
            }).join(' ') + 'Z';
            return pathData;
          })
          .attr('fill', 'none')
          .attr('stroke', 'cyan')
          .attr('stroke-width', 2)
          .attr('opacity', 0.7)
      });
    } else if (feature.geometry.type === 'Polygon') {
      const coordinates = feature.geometry.coordinates[0]; // exterior ring

      // Transform world coordinates to pixel coordinates
      const points = coordinates.map((coord: [number, number]) => {
        const dra = coord[0]; // arcseconds offset from the instrument origin
        const ddec = coord[1]; // arcseconds offset from the instrument origin
        return arcsecToPixel(dra, ddec);
      });

      // Draw polygon
      d3.select(fovSvg).append('path')
        .attr('d', () => {
          const pathData = (points as Array<[number, number]>).map((p: [number, number], i: number) => {
            return (i === 0 ? 'M' : 'L') + p[0] + ',' + p[1];
          }).join(' ') + 'Z';
          return pathData;
        })
        .attr('fill', 'none')
        .attr('stroke', 'cyan')
        .attr('stroke-width', 2)
        .attr('opacity', 0.7);
    }
  }, [fov, props.centerRA, props.centerDec, props.width, props.height, degPerPixel, props.selPO, zoom, props.fovAngle]);

  const colorStretchFilter = `${props.invertImage !== false ? 'invert(1) ' : ''}brightness(${brightness}%) contrast(${contrast}%)`

  // Applies the same colour stretch the viewer shows, for browsers without
  // Canvas2D `filter` (Safari < 17). Mirrors the CSS order: invert, then
  // brightness (linear multiply), then contrast (scale about mid-grey).
  const apply_color_stretch = (ctx: CanvasRenderingContext2D) => {
    const image = ctx.getImageData(0, 0, props.width, props.height)
    const data = image.data
    const invert = props.invertImage !== false
    const brightnessScale = brightness / 100
    const contrastScale = contrast / 100
    for (let i = 0; i < data.length; i += 4) {
      for (let channel = 0; channel < 3; channel++) {
        let v = data[i + channel]
        if (invert) v = 255 - v
        v = v * brightnessScale
        v = (v - 127.5) * contrastScale + 127.5
        data[i + channel] = Math.max(0, Math.min(255, v))
      }
    }
    ctx.putImageData(image, 0, 0)
  }

  // Rasterises one overlay layer. Every overlay is an <svg> sized to the viewer,
  // so it can be serialised and drawn at the origin under whatever transform its
  // CSS carries (pan for most, pan + rotation for the FOV layer).
  const draw_svg_layer = (
    ctx: CanvasRenderingContext2D,
    svg: SVGSVGElement,
    transform: (ctx: CanvasRenderingContext2D) => void
  ) => {
    const clone = svg.cloneNode(true) as SVGSVGElement
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
    clone.setAttribute('width', String(props.width))
    clone.setAttribute('height', String(props.height))
    const markup = new XMLSerializer().serializeToString(clone)
    const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(markup)
    return new Promise<void>((resolve) => {
      const img = new Image()
      img.onload = () => {
        ctx.save()
        transform(ctx)
        ctx.drawImage(img, 0, 0)
        ctx.restore()
        resolve()
      }
      // A layer that fails to rasterise shouldn't abort the whole export.
      img.onerror = () => {
        console.error('failed to rasterise overlay layer for export')
        resolve()
      }
      img.src = url
    })
  }

  const save_image = async () => {
    const container = containerRef.current
    const sourceCanvas = canvasRef.current
    if (!container || !sourceCanvas) return

    const out = document.createElement('canvas')
    out.width = props.width
    out.height = props.height
    const ctx = out.getContext('2d')
    if (!ctx) return

    const pan = (c: CanvasRenderingContext2D) => c.translate(panOffset.x, panOffset.y)
    // CSS uses transform-origin: center center, so rotate/scale about the middle.
    const aboutCenter = (c: CanvasRenderingContext2D, apply: () => void) => {
      c.translate(props.width / 2, props.height / 2)
      apply()
      c.translate(-props.width / 2, -props.height / 2)
    }

    // Image layer: same pan/zoom and colour stretch as the on-screen canvas.
    const supportsCtxFilter = 'filter' in ctx
    ctx.save()
    if (supportsCtxFilter) ctx.filter = colorStretchFilter
    pan(ctx)
    aboutCenter(ctx, () => ctx.scale(zoom, zoom))
    ctx.drawImage(sourceCanvas, 0, 0)
    ctx.restore()
    if (!supportsCtxFilter) apply_color_stretch(ctx)

    // Overlay layers, in the same paint order as the DOM.
    if (svgRef.current) {
      await draw_svg_layer(ctx, svgRef.current, pan)
    }
    if (fovSvgRef.current) {
      await draw_svg_layer(ctx, fovSvgRef.current, (c) => {
        pan(c)
        aboutCenter(c, () => c.rotate((overlayRotation * Math.PI) / 180))
      })
    }
    // The remaining layers (pointing origins, scale bar, compass rose) have no
    // refs. Pointing origins sit in a panned wrapper; the other two are static.
    // On-screen controls are skipped via VIEWER_CHROME_CLASS - MUI icons are
    // themselves <svg>, so the download button would otherwise be rasterised
    // into the export, blown up to the full viewer size.
    const remaining = Array.from(container.querySelectorAll('svg'))
      .filter((svg) => svg !== svgRef.current
        && svg !== fovSvgRef.current
        && !svg.closest(`.${VIEWER_CHROME_CLASS}`))
    for (const svg of remaining) {
      const panned = !!svg.closest('.pointing-origin-markers')
      await draw_svg_layer(ctx, svg, panned ? pan : () => { })
    }

    const link = document.createElement('a')
    link.download = `guide-star-${props.instrumentFOV ?? 'view'}.png`
    link.href = out.toDataURL('image/png')
    link.click()
  }

  // Handle mouse wheel zoom
  React.useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();

      const delta = -e.deltaY * ZOOM_SPEED;

      setZoom((prevZoom) => {
        const newZoom = prevZoom * (1 + delta);
        // Clamp zoom between zoomMin and zoomMax
        return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, newZoom));
      });
    };

    container.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      container.removeEventListener('wheel', handleWheel);
    };
  }, []);

  // Handle mouse drag for panning
  React.useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return; // left button only; right button drives color stretch
      setIsDragging(true);
      setDragStart({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y });
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;

      setPanOffset({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    container.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      container.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragStart, panOffset]);

  // Handle right-click drag for brightness/contrast (color stretch)
  React.useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleContextMenu = (e: MouseEvent) => {
      // Right-click is reserved for the color stretch tool, not the browser menu
      e.preventDefault();
    };

    const handleMouseDown = (e: MouseEvent) => {
      if (e.button !== 2) return; // right button only
      e.preventDefault();
      setIsStretching(true);
      const bounds = container.getBoundingClientRect();
      const { brightness: b, contrast: c } = computeColorStretch(e.clientX, e.clientY, bounds);
      setBrightness(b);
      setContrast(c);
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isStretching) return;
      const bounds = container.getBoundingClientRect();
      const { brightness: b, contrast: c } = computeColorStretch(e.clientX, e.clientY, bounds);
      setBrightness(b);
      setContrast(c);
    };

    const handleMouseUp = () => {
      setIsStretching(false);
    };

    container.addEventListener('contextmenu', handleContextMenu);
    container.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      container.removeEventListener('contextmenu', handleContextMenu);
      container.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isStretching]);

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        width: props.width,
        height: props.height,
        overflow: 'hidden',
        cursor: isStretching ? 'crosshair' : (isDragging ? 'grabbing' : 'grab')
      }}
    >
      {/* DSS Image Layer */}
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoom})`,
          transformOrigin: 'center center',
          pointerEvents: 'none',
          filter: colorStretchFilter
        }}
      />
      {/* Targets SVG Layer */}
      <svg
        ref={svgRef}
        width={props.width}
        height={props.height}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          transform: `translate(${panOffset.x}px, ${panOffset.y}px)`,
          transformOrigin: 'center center'
        }}
      />
      {/* FOV SVG Layer */}
      <svg
        ref={fovSvgRef}
        width={props.width}
        height={props.height}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          transform: `translate(${panOffset.x}px, ${panOffset.y}px) rotate(${overlayRotation}deg)`,
          transformOrigin: 'center center',
          pointerEvents: 'none'
        }}
      />
      {/* Render pointing origin markers with labels */}
      {pointingOriginMarkers.length > 0 && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          transform: `translate(${panOffset.x}px, ${panOffset.y}px)`,
          pointerEvents: 'none'
        }}>
          <PointingOriginMarkers
            markers={pointingOriginMarkers}
            width={props.width}
            height={props.height}
            markerSize={8}
            fontSize={14}
            textOffset={35}
            lineColor="#FFD700"   // Gold lines
            textColor="#FFFFFF"   // White text
            markerColor="#FFFF00" // Yellow markers
          />
        </div>
      )}
      <ScaleBar width={props.width} height={props.height} degPerPixel={degPerPixel} invertImage={props.invertImage} />
      {/* The image no longer rotates, so sky north is fixed and the rose stays put */}
      <CompassRose width={props.width} height={props.height} invertImage={props.invertImage} />
      <Tooltip title="Save this view as a PNG, with overlays and colour stretch">
        <IconButton
          onClick={save_image}
          size="small"
          className={VIEWER_CHROME_CLASS}
          sx={{
            position: 'absolute',
            top: 4,
            right: 4,
            zIndex: 2,
            bgcolor: 'background.paper',
            '&:hover': { bgcolor: 'background.paper' },
          }}
        >
          <DownloadIcon fontSize="small" />
        </IconButton>
      </Tooltip>
    </div>
  );
};