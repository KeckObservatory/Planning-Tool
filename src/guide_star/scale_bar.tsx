import React from 'react';

interface ScaleBarProps {
  width: number;
  height: number;
  invertImage?: boolean;
  degPerPixel: number; // degrees per pixel at the current zoom
}

export const ScaleBar: React.FC<ScaleBarProps> = ({ width, height, degPerPixel, invertImage }) => {

  const rawArcsec = 100 * (3600 * degPerPixel); // calculate the length in pixels that corresponds to 20 arcseconds
  let scaleBarLengthArcsec = Math.floor(rawArcsec / 5) * 5; // Round down to nearest multiple of 10
  scaleBarLengthArcsec = Math.max(scaleBarLengthArcsec, 5); // Minimum length of 5 arcseconds
  if (scaleBarLengthArcsec <= 5) {
      scaleBarLengthArcsec = Math.floor(rawArcsec / 1) * 1; // Round down to nearest multiple of 10
      scaleBarLengthArcsec = Math.max(scaleBarLengthArcsec, 1); // Minimum length of 1 arcsecond
  }

  const scaleBarLengthPxl = scaleBarLengthArcsec / rawArcsec;

  return (
    <svg
      width={width}
      height={height}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        pointerEvents: 'none'
      }}
    >
      {/* Scale bar: 100 pixels = 20 arcseconds */}
      <g transform={`translate(${width - 120}, ${height - 30})`}>
        {/* Horizontal line */}
        <line
          x1="0"
          y1="0"
          x2={`${scaleBarLengthPxl * 100}`}
          y2="0"
          stroke= {invertImage ? "black" : "white"}
          strokeWidth="2"
        />
        {/* Left tick */}
        <line
          x1="0"
          y1="-6"
          x2="0"
          y2="6"
          stroke= {invertImage ? "black" : "white"}
          strokeWidth="4"
        />
        {/* Right tick */}
        <line
          x1={scaleBarLengthPxl * 100}
          y1="-6"
          x2={scaleBarLengthPxl * 100}
          y2="6"
          stroke= {invertImage ? "black" : "white"}
          strokeWidth="4"
        />
        {/* Label */}
        <text
          x="50"
          y="20"
          fontSize="16"
          textAnchor="middle"
          fontFamily="monospace"
          fill={invertImage ? "black" : "white"}
        >
          {`${scaleBarLengthArcsec}"`}
        </text>
      </g>
    </svg>
  );
};
