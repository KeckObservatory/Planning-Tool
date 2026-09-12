import { Target } from "../App"
import React from "react"
import * as d3 from "d3"
import { get_shapes } from "../two-d-view/two_d_view_common"
import { POPointFeature, TelescopeContours } from "../two-d-view/pointing_origin_select"
import { Feature, Point } from "geojson"
import { PointingOriginMarkers, PointingOriginMarker } from "../aladin/pointing_origin_markers"
import { ScaleBar } from "./scale_bar"
import { CompassRose } from "./compass_rose"
import { ZOOM_SPEED, ZOOM_MIN, ZOOM_MAX } from "../two-d-view/constants"
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
    contours?: TelescopeContours// LaserContours
    showTrickMap?: boolean
    trickMap?: any // trick_map FeatureCollection
}
export const GSViewer = (props: Props) => {

  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const svgRef = React.useRef<SVGSVGElement | null>(null);
  const fovSvgRef = React.useRef<SVGSVGElement | null>(null);
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const [zoom, setZoom] = React.useState<number>(1); // zoom level, 1 = no zoom
  const [panOffset, setPanOffset] = React.useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = React.useState<boolean>(false);
  const [dragStart, setDragStart] = React.useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const degPerPixel = (props.size / props.width) / zoom // degrees per pixel, adjusted for zoom
  const [fov, setFOV] = React.useState<any>(null)
  const [laserContours, setLaserContours] = React.useState<Array<{name: string; color: string; lines: Array<Array<[number, number]>>}>>([]);
  const [trickMapContours, setTrickMapContours] = React.useState<Array<{name: string; color: string; lines: Array<Array<[number, number]>>}>>([]);

  const get_offset_ra_dec = () => {
    let ra = props.centerRA;
    let dec = props.centerDec;
    if (props.selPO) { // this offsets the center of the view to the selected pointing origin 
      const [dra, ddec] = props.selPO.geometry.coordinates; // arcseconds offset
      ra = ra - dra / 3600;
      dec = dec - ddec / 3600;
    }
    return [ra, dec];
  }

  // Convert arcseconds offset to pixel coordinates
  const arcsecToPixel = (dra: number, ddec: number): [number, number] => {
    const x = (dra / (3600 * degPerPixel)) + props.width / 2;
    const y = (ddec / (3600 * degPerPixel)) + props.height / 2;
    return [x, y];
  }

  // Convert pointing origins to pixel coordinates for markers
  const pointingOriginMarkers = React.useMemo((): PointingOriginMarker[] => {
    if (!props.pointingOrigins) {
      return [];
    }
    const [offsetRa, offsetDec] = get_offset_ra_dec();

    return props.pointingOrigins.map((feature) => {
      const [dra, ddec] = feature.geometry.coordinates; // arcseconds offset
      const pora = offsetRa + dra / 3600; // convert to degrees
      const podec = offsetDec + ddec / 3600;
      const [x, y] = arcsecToPixel((pora - props.centerRA) * 3600, (podec - props.centerDec) * 3600);
      const name = feature.properties?.name ?? 'Unknown';

      return {
        name,
        position: [x, y] as [number, number]
      };
    });
  }, [props.pointingOrigins, props.centerRA, props.centerDec, props.width, props.height, degPerPixel, props.selPO, zoom, props.fovAngle]);

  // Convert laser contours to pixel coordinates
  React.useMemo(() => {
    
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
  }, [props.contours, props.showLaser, props.width, props.height, degPerPixel, zoom]);

  // Convert trick map to pixel coordinates
  React.useMemo(() => {
    
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
  }, [props.trickMap, props.showTrickMap, props.width, props.height, degPerPixel, zoom]);

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

  React.useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    // Clear previous circles
    d3.select(svg).selectAll('circle').remove();

    const handleStarClick = (event: MouseEvent, d: Target) => {
      event.stopPropagation(); // Prevent pan from triggering
      const starName = d.target_name || `RA: ${d.ra_deg}, Dec: ${d.dec_deg}`;
      if (props.setGuideStarName) {
        props.setGuideStarName(starName);
      }
    };

    // Bind guide stars to circles and add click handlers
    d3.select(svg)
      .selectAll('circle')
      .data(props.guideStars, (d: any) => d.ra_deg + ',' + d.dec_deg)
      .enter()
      .append('circle')
      .attr('cx', (d: Target) => {
        const x = ((d.ra_deg || 0) - props.centerRA) / degPerPixel + props.width / 2;
        return x;
      })
      .attr('cy', (d: Target) => {
        const y = ((d.dec_deg || 0) - props.centerDec) / degPerPixel + props.height / 2;
        return y;
      })
      .attr('r', () => {
        return 5;
      })
      .attr('fill', (d: Target) => {
        // Yellow fill if selected, transparent otherwise
        const starName = d.target_name;
        return starName === props.guideStarName ? 'rgba(255, 255, 0, 0.0)' : 'rgba(255, 0, 0, 0.0)';
      })
      .attr('stroke', (d: Target) => {
        // Yellow stroke if selected, red otherwise
        const starName = d.target_name;
        return starName === props.guideStarName ? 'yellow' : 'red';
      })
      .attr('stroke-width', 2)
      .attr('cursor', 'pointer')
      .on('click', handleStarClick);
  }, [props.guideStars, props.centerRA, props.centerDec, props.width, props.height, degPerPixel, props.guideStarName, zoom, props.fovAngle]);

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
          const dra = coord[0]; // arcseconds offset from center
          const ddec = coord[1]; // arcseconds offset from center
          const x = (dra / (3600 * degPerPixel)) + props.width / 2;
          const y = (ddec / (3600 * degPerPixel)) + props.height / 2;
          return [x, y];
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
        const dra = coord[0]; // arcseconds offset from center
        const ddec = coord[1]; // arcseconds offset from center
        const x = (dra / (3600 * degPerPixel)) + props.width / 2;
        const y = (ddec / (3600 * degPerPixel)) + props.height / 2;
        return [x, y];
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

  return (
    <div 
      ref={containerRef} 
      style={{ 
        position: 'relative', 
        width: props.width, 
        height: props.height, 
        overflow: 'hidden',
        cursor: isDragging ? 'grabbing' : 'grab'
      }}
    >
      {/* DSS Image Layer */}
      <canvas 
        ref={canvasRef} 
        style={{ 
          position: 'absolute', 
          top: 0, 
          left: 0,
          transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoom}) rotate(${props.fovAngle || 0}deg)`,
          transformOrigin: 'center center',
          pointerEvents: 'none',
          filter: props.invertImage !== false ? 'invert(1)' : 'none'
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
          transform: `translate(${panOffset.x}px, ${panOffset.y}px) rotate(${props.fovAngle || 0}deg)`,
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
          transform: `translate(${panOffset.x}px, ${panOffset.y}px) `,
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
      <CompassRose width={props.width} height={props.height} fovAngle={props.fovAngle} invertImage={props.invertImage} />
    </div>
  );
};