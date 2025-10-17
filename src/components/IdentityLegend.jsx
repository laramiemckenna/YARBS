// src/components/IdentityLegend.jsx
import React from 'react';

const IdentityLegend = () => {
  // Create gradient stops for the identity scale (25% to 100%)
  const gradientStops = Array.from({ length: 6 }, (_, i) => {
    const percentage = 25 + (i * 15); // 25%, 40%, 55%, 70%, 85%, 100%
    const identityRatio = (percentage - 25) / 75; // Normalize to 0-1 range
    const red = Math.floor(255 * (1 - identityRatio));
    const green = Math.floor(255 * identityRatio);
    return {
      percentage,
      color: `rgb(${red}, ${green}, 0)`
    };
  });

  return (
    <div className="px-4 py-2 bg-gray-50 border-b border-gray-200">
      <div className="flex items-center justify-center">
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium text-gray-700">Sequence Identity:</span>
          
          {/* Color gradient bar */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-600">25%</span>
            
            <div className="relative w-40 h-4 rounded-md overflow-hidden border border-gray-300">
              <div 
                className="w-full h-full"
                style={{
                  background: 'linear-gradient(to right, rgb(255,0,0) 0%, rgb(255,102,0) 20%, rgb(255,204,0) 40%, rgb(128,255,0) 60%, rgb(64,255,0) 80%, rgb(0,255,0) 100%)'
                }}
              />
            </div>
            
            <span className="text-xs text-gray-600">100%</span>
          </div>
          
          {/* Discrete color samples */}
          <div className="flex items-center gap-1 ml-4">
            {gradientStops.map((stop, index) => (
              <div key={index} className="flex flex-col items-center">
                <div 
                  className="w-4 h-4 border border-gray-300 rounded"
                  style={{ backgroundColor: stop.color }}
                  title={`${stop.percentage}% identity`}
                />
                <span className="text-xs text-gray-500 mt-1">
                  {stop.percentage}%
                </span>
              </div>
            ))}
          </div>
          
          {/* Legend for other elements */}
          <div className="flex items-center gap-4 ml-6 text-xs">
            <div className="flex items-center gap-1">
              <div className="w-3 h-1 bg-gray-400 rounded"></div>
              <span className="text-gray-600">Repetitive</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-1 bg-red-500 rounded"></div>
              <span className="text-gray-600">Selected</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-1 bg-purple-500 rounded"></div>
              <span className="text-gray-600">Inverted</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default IdentityLegend;