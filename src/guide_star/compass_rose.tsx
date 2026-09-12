import React from 'react';

interface CompassRoseProps {
  width: number;
  height: number;
  fovAngle?: number;
  invertImage?: boolean;
}

export const CompassRose: React.FC<CompassRoseProps> = ({ width, height, fovAngle, invertImage }) => {
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
      {/* Compass rose in bottom left corner */}
      <g transform={`translate(45, ${height - 45}) rotate(${fovAngle || 0})`}>
        {/* Outer circle */}
        <circle
          cx="0"
          cy="0"
          r="30"
          fill="none"
          stroke={invertImage ? "black" : "white"}
          strokeWidth="1.5"
          opacity="0.7"
        />
        
        {/* North arrow (red) */}
        <line x1="0" y1="0" x2="0" y2="-25" stroke="#FF6B6B" strokeWidth="2" />
        <polygon
          points="0,-25 -4,-15 4,-15"
          fill="#FF6B6B"
        />
        
        {/* South arrow (blue) */}
        <line x1="0" y1="0" x2="0" y2="25" stroke="#4ECDC4" strokeWidth="1.5" opacity="0.7" />
        
        {/* East arrow (green) */}
        <line x1="0" y1="0" x2="-25" y2="0" stroke="#95E77D" strokeWidth="1.5" opacity="0.7" />
        
        {/* West arrow (yellow) */}
        <line x1="0" y1="0" x2="25" y2="0" stroke="#FFE66D" strokeWidth="1.5" opacity="0.7" />
        
        {/* Cardinal direction labels */}
        <text
          x="0"
          y="-35"
          fill={invertImage ? "black" : "white"}
          fontSize="14"
          fontWeight="bold"
          textAnchor="middle"
          fontFamily="sans-serif"
        >
          N
        </text>
        <text
          x="0"
          y="40"
          fill={invertImage ? "black" : "white"}
          fontSize="14"
          textAnchor="middle"
          fontFamily="sans-serif"
          opacity="0.7"
        >
          S
        </text>
        <text
          x="38"
          y="4"
          fill={invertImage ? "black" : "white"}
          fontSize="14"
          textAnchor="middle"
          fontFamily="sans-serif"
          opacity="0.7"
        >
          W
        </text>
        <text
          x="-38"
          y="4"
          fill={invertImage ? "black" : "white"}
          fontSize="14"
          textAnchor="middle"
          fontFamily="sans-serif"
          opacity="0.7"
        >
          E
        </text>
      </g>
    </svg>
  );
};
