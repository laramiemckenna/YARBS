// src/components/DotPlot.jsx - Enhanced version with mouse wheel zoom in exploration mode
import React, { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import { drawAlignments, getFilteredAlignments } from '../utils/drawingUtils';
import { calculateVisualModifications } from '../utils/visualizationUpdater';

const DotPlot = ({
  data,
  settings,
  viewMode,
  selectedRef,
  selectedContigs,
  explorationMode,
  zoom,
  onZoomChange,
  pan,
  onPanChange,
  loading,
  modifications,
  contigOrder,
  referenceFlipped,
  uninformativeContigs,
  chromosomeGroups
}) => {
  const canvasRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 600 });

  // Update canvas size on mount and window resize
  useEffect(() => {
    const updateCanvasSize = () => {
      if (canvasRef.current) {
        const rect = canvasRef.current.getBoundingClientRect();
        setCanvasSize({ width: rect.width, height: rect.height });
      }
    };

    updateCanvasSize();
    window.addEventListener('resize', updateCanvasSize);
    return () => window.removeEventListener('resize', updateCanvasSize);
  }, []);

  // Calculate visual modifications for this render - memoized for performance
  const visualMods = useMemo(() => {
    return data ? calculateVisualModifications(data.alignments, modifications) : { modifiedAlignments: new Map() };
  }, [data, modifications]);

  // Main drawing function
  const drawDotPlot = useCallback(() => {
    if (!data || !canvasRef.current) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    
    // Set canvas size with device pixel ratio for crisp rendering
    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvasSize.width * dpr;
    canvas.height = canvasSize.height * dpr;
    canvas.style.width = `${canvasSize.width}px`;
    canvas.style.height = `${canvasSize.height}px`;
    ctx.scale(dpr, dpr);
    
    // Clear canvas
    ctx.clearRect(0, 0, canvasSize.width, canvasSize.height);
    
    // Apply transformations
    ctx.save();
    ctx.translate(pan.x, pan.y);
    ctx.scale(zoom, zoom);
    
    try {
      // Get filtered alignments based on current settings
      let filteredAlignments = getFilteredAlignments(data, selectedRef, settings);

      // Further filter alignments to only show contigs that pass the filters
      // This matches the same filtering logic used in ControlPanel
      const effectiveMinLength = settings.minAlignmentLength || 50000;

      // Build a set of contigs that should be hidden
      const hiddenContigs = new Set();

      // For each contig, check if it should be hidden based on filters
      const contigAlignments = new Map();
      filteredAlignments.forEach(alignment => {
        if (!contigAlignments.has(alignment.query)) {
          contigAlignments.set(alignment.query, []);
        }
        contigAlignments.get(alignment.query).push(alignment);
      });

      contigAlignments.forEach((alignments, contigName) => {
        // Check if contig is in a chromosome group
        const isInGroup = chromosomeGroups && Object.values(chromosomeGroups).some(group =>
          group.contigs && group.contigs.includes(contigName)
        );

        // Check if contig has modifications
        const hasModifications = modifications && modifications.some(m =>
          m.query === contigName || m.contigName === contigName
        );

        // Always show grouped or modified contigs
        if (isInGroup || hasModifications) {
          return;
        }

        // Check if contig is marked as uninformative
        if (uninformativeContigs && uninformativeContigs.has(contigName)) {
          hiddenContigs.add(contigName);
          return;
        }

        // Check minimum contig size filter (convert kb to bp)
        const contigInfo = data.queries.find(q => q.name === contigName);
        if (contigInfo && settings.minContigSize && settings.minContigSize > 0) {
          const minSizeInBp = settings.minContigSize * 1000;
          if (contigInfo.length < minSizeInBp) {
            hiddenContigs.add(contigName);
            return;
          }
        }

        // Calculate total alignment length for this contig
        const totalLength = alignments.reduce((sum, a) => sum + (a.refEnd - a.refStart), 0);

        // Check alignment length threshold
        if (totalLength < effectiveMinLength) {
          hiddenContigs.add(contigName);
          return;
        }

        // Check unique alignment ratio
        if (contigInfo) {
          const uniqueRatio = totalLength / contigInfo.length;
          if (uniqueRatio < settings.minUniqueRatio) {
            hiddenContigs.add(contigName);
          }
        }
      });

      // Filter out alignments from hidden contigs
      filteredAlignments = filteredAlignments.filter(a => !hiddenContigs.has(a.query));

      // Create a filtered data object with only visible queries
      // This ensures the Y-axis scale only includes visible contigs (no empty space)
      const filteredData = {
        ...data,
        queries: data.queries.filter(q => !hiddenContigs.has(q.name)),
        alignments: filteredAlignments
      };

      if (filteredAlignments.length === 0) {
        ctx.restore();
        ctx.fillStyle = '#666';
        ctx.font = '16px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(
          'No alignments to display',
          canvasSize.width / 2,
          canvasSize.height / 2
        );
        ctx.fillText(
          'Try adjusting filters or loading different data',
          canvasSize.width / 2,
          canvasSize.height / 2 + 25
        );
        return;
      }

      // Draw the alignments using the filtered data
      // This ensures contigs are packed tightly without gaps
      drawAlignments(
        ctx,
        filteredAlignments,
        filteredData, // Use filtered data instead of original data
        {
          width: canvasSize.width,
          height: canvasSize.height,
          selectedRef,
          viewMode,
          settings,
          selectedContigs,
          visualMods,
          contigOrder,
          referenceFlipped,
          zoom,
          pan,
          chromosomeGroups
        }
      );
      
    } catch (error) {
      console.error('Error drawing dot plot:', error);
      ctx.restore();
      ctx.fillStyle = '#dc2626';
      ctx.font = '16px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(
        'Error rendering visualization', 
        canvasSize.width / 2, 
        canvasSize.height / 2
      );
    }
    
    ctx.restore();

    // Draw static Y-axis label (Query) - outside transformed context
    ctx.fillStyle = '#374151';
    ctx.font = '14px Inter, sans-serif';
    ctx.save();
    ctx.translate(15, canvasSize.height / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillText('Query', 0, 0);
    ctx.restore();

    // Draw modification indicators (static overlay)
    if (modifications.length > 0) {
      ctx.fillStyle = '#f59e0b';
      ctx.font = 'bold 10px Inter, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(`${modifications.length} modifications applied`, canvasSize.width - 10, 25);
    }
    
  }, [data, settings, viewMode, selectedRef, zoom, pan, selectedContigs, canvasSize, modifications, visualMods, contigOrder, referenceFlipped, uninformativeContigs, chromosomeGroups]);

  // Redraw when dependencies change
  useEffect(() => {
    drawDotPlot();
  }, [drawDotPlot]);

  // Enhanced mouse wheel handler for zooming
  const handleWheel = useCallback((e) => {
    e.preventDefault();
    
    if (!explorationMode) return; // No zooming in scaffolding mode
    
    const delta = e.deltaY * -0.001;
    const rect = canvasRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    // Calculate new zoom
    const newZoom = Math.max(0.1, Math.min(10, zoom + delta));
    const zoomRatio = newZoom / zoom;
    
    // Adjust pan to keep mouse position stationary
    const newPanX = mouseX - (mouseX - pan.x) * zoomRatio;
    const newPanY = mouseY - (mouseY - pan.y) * zoomRatio;
    
    onZoomChange(newZoom);
    onPanChange({ x: newPanX, y: newPanY });
  }, [explorationMode, zoom, pan, onZoomChange, onPanChange]);

  // Mouse event handlers are only active in exploration mode
  // In scaffolding mode, all interactions are done through the control panel

  // Mouse event handlers for panning (exploration mode only)
  const handleMouseDown = useCallback((e) => {
    if (loading || !explorationMode) return;

    // Standard panning in exploration mode
    setIsDragging(true);
    const rect = canvasRef.current.getBoundingClientRect();
    setDragStart({
      x: e.clientX - rect.left - pan.x,
      y: e.clientY - rect.top - pan.y
    });
  }, [explorationMode, pan, loading]);

  const handleMouseMove = useCallback((e) => {
    if (!explorationMode || !isDragging) return;

    // Standard panning in exploration mode
    const rect = canvasRef.current.getBoundingClientRect();
    const newX = e.clientX - rect.left - dragStart.x;
    const newY = e.clientY - rect.top - dragStart.y;
    onPanChange({ x: newX, y: newY });
  }, [isDragging, explorationMode, dragStart, onPanChange]);

  const handleMouseUp = useCallback(() => {
    if (isDragging) {
      setIsDragging(false);
    }
  }, [isDragging]);

  // Touch event handlers for mobile support
  const handleTouchStart = useCallback((e) => {
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      handleMouseDown({ clientX: touch.clientX, clientY: touch.clientY });
    }
  }, [handleMouseDown]);

  const handleTouchMove = useCallback((e) => {
    if (e.touches.length === 1) {
      e.preventDefault();
      const touch = e.touches[0];
      handleMouseMove({ clientX: touch.clientX, clientY: touch.clientY });
    }
  }, [handleMouseMove]);

  const handleTouchEnd = useCallback((e) => {
    handleMouseUp(e);
  }, [handleMouseUp]);

  // Determine cursor style
  const getCursorStyle = () => {
    if (loading) return 'wait';
    if (!explorationMode) return 'default'; // No interaction in scaffolding mode
    if (isDragging) return 'grabbing';
    return 'grab';
  };

  return (
    <>
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        style={{ 
          cursor: getCursorStyle(),
          touchAction: 'none'
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      />
      
      {/* Zoom indicator */}
      <div className="absolute top-4 left-4 bg-black bg-opacity-75 text-white text-sm px-3 py-1 rounded-md">
        Zoom: {zoom.toFixed(1)}x
      </div>
      
      {/* Mode indicator */}
      <div className={`absolute top-4 right-4 text-sm px-3 py-1 rounded-md ${
        explorationMode 
          ? 'bg-green-100 text-green-800 border border-green-200' 
          : 'bg-red-100 text-red-800 border border-red-200'
      }`}>
        {explorationMode ? 'Exploration Mode' : 'Scaffolding Mode'}
      </div>
      
      
      {/* Loading overlay */}
      {loading && (
        <div className="absolute inset-0 bg-gray-50 bg-opacity-90 flex items-center justify-center">
          <div className="flex items-center space-x-3">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
            <span className="text-gray-600">Loading alignments...</span>
          </div>
        </div>
      )}
      
      {/* No data overlay */}
      {!data && !loading && (
        <div className="absolute inset-0 bg-gray-50 bg-opacity-90 flex items-center justify-center">
          <div className="text-center">
            <div className="text-6xl mb-4">🧬</div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              Load Coordinate Files
            </h3>
            <p className="text-gray-600 mb-4">
              Upload .coords and .coords.idx files to begin visualization
            </p>
            <p className="text-sm text-gray-500">
              Generate these files using the minimap_prep.py script
            </p>
          </div>
        </div>
      )}
    </>
  );
};

export default DotPlot;