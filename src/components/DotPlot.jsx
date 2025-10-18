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

    // Use ResizeObserver for better performance
    const resizeObserver = new ResizeObserver(() => {
      updateCanvasSize();
    });

    if (canvasRef.current) {
      resizeObserver.observe(canvasRef.current);
    }

    // Fallback to window resize event
    window.addEventListener('resize', updateCanvasSize);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', updateCanvasSize);
    };
  }, []);

  // Calculate visual modifications for this render - memoized for performance
  const visualMods = useMemo(() => {
    return data ? calculateVisualModifications(data.alignments, modifications) : { modifiedAlignments: new Map() };
  }, [data, modifications]);

  // OPTIMIZED: Memoize contig alignments map to avoid rebuilding on every render
  const contigAlignmentsMap = useMemo(() => {
    if (!data || !selectedRef) return new Map();

    const map = new Map();
    data.alignments
      .filter(a => a.ref === selectedRef && (a.tag === 'unique' || a.tag === 'unique_short'))
      .forEach(alignment => {
        if (!map.has(alignment.query)) {
          map.set(alignment.query, []);
        }
        map.get(alignment.query).push(alignment);
      });
    return map;
  }, [data, selectedRef]);

  // OPTIMIZED: Memoize allowed contigs set to avoid recalculating on every render
  const allowedContigsSet = useMemo(() => {
    if (!data || !selectedRef) return new Set();

    const allowed = new Set();

    contigAlignmentsMap.forEach((alignments, contigName) => {
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
        allowed.add(contigName);
        return;
      }

      // Check if contig is marked as uninformative
      if (uninformativeContigs && uninformativeContigs.has(contigName)) {
        return; // Skip
      }

      // Get the actual contig info
      const contigInfo = data.queries.find(q => q.name === contigName);
      if (!contigInfo) return;

      // Check minimum contig size filter
      if (settings.minContigSize && settings.minContigSize > 0) {
        if (contigInfo.length < settings.minContigSize) {
          return; // Skip
        }
      }

      // Calculate total unique alignment length
      const totalLength = alignments.reduce((sum, a) => sum + a.length, 0);

      // Check unique alignment ratio
      const uniqueRatio = totalLength / contigInfo.length;
      if (uniqueRatio >= settings.minUniqueRatio) {
        allowed.add(contigName);
      }
    });

    return allowed;
  }, [data, selectedRef, contigAlignmentsMap, chromosomeGroups, modifications, uninformativeContigs, settings.minContigSize, settings.minUniqueRatio]);

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

      // OPTIMIZED: Use pre-computed memoized allowedContigsSet instead of recalculating
      // Filter out alignments from contigs not in the allowed set
      filteredAlignments = filteredAlignments.filter(a => allowedContigsSet.has(a.query));

      // Create a filtered data object with only visible queries
      // This ensures the Y-axis scale only includes visible contigs (no empty space)
      const filteredData = {
        ...data,
        queries: data.queries.filter(q => allowedContigsSet.has(q.name)),
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

  }, [data, settings, viewMode, selectedRef, zoom, pan, selectedContigs, canvasSize, modifications, visualMods, contigOrder, referenceFlipped, allowedContigsSet, chromosomeGroups]);

  // Redraw when dependencies change
  // OPTIMIZED: Defer canvas rendering to allow UI to update first
  useEffect(() => {
    // Use requestAnimationFrame to defer rendering until after the browser has painted
    // This allows the modal to close and UI to update before heavy canvas rendering
    const rafId = requestAnimationFrame(() => {
      drawDotPlot();
    });

    return () => cancelAnimationFrame(rafId);
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

    const rect = canvasRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Standard panning in exploration mode
    const newX = mouseX - dragStart.x;
    const newY = mouseY - dragStart.y;
    onPanChange({ x: newX, y: newY });
  }, [isDragging, explorationMode, dragStart, onPanChange]);

  const handleMouseUp = useCallback(() => {
    if (isDragging) {
      setIsDragging(false);
    }
  }, [isDragging]);

  const handleMouseLeave = useCallback(() => {
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
        onMouseLeave={handleMouseLeave}
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
        <div className="absolute inset-0 bg-gray-50 bg-opacity-90"></div>
      )}
    </>
  );
};

export default DotPlot;