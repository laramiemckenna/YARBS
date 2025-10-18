// src/utils/drawingUtils.js - Enhanced with modification support

/**
 * Filter alignments based on current settings and selected reference
 * @param {Object} data - Parsed alignment data
 * @param {string} selectedRef - Currently selected reference
 * @param {Object} settings - Visualization settings
 * @returns {Array} Filtered alignments
 */
export const getFilteredAlignments = (data, selectedRef, settings) => {
  if (!data || !data.alignments) {
    return [];
  }

  return data.alignments.filter(alignment => {
    // Filter by reference
    if (selectedRef && alignment.ref !== selectedRef) {
      return false;
    }

    // Filter by repetitive setting
    if (!settings.showRepetitive && alignment.tag === 'repetitive') {
      return false;
    }

    // Filter unique_short alignments based on showAllAlignments setting
    // If showAllAlignments is FALSE (default), hide unique_short alignments
    // If showAllAlignments is TRUE, show them
    if (!settings.showAllAlignments && alignment.tag === 'unique_short') {
      return false;
    }

    // Filter by minimum alignment length
    if (alignment.length < settings.minAlignmentLength) {
      return false;
    }

    return true;
  });
};

/**
 * Calculate scales and dimensions for drawing with modifications
 * @param {Object} data - Parsed alignment data
 * @param {string} selectedRef - Currently selected reference
 * @param {Object} canvasSize - Canvas dimensions
 * @param {Object} contigOrder - Manual contig ordering
 * @returns {Object} Scales and dimensions
 */
export const calculateScales = (data, selectedRef, canvasSize, contigOrder = {}) => {
  const margin = 60; // Margin for labels and padding
  const drawWidth = canvasSize.width - 2 * margin;
  const drawHeight = canvasSize.height - 2 * margin;
  
  // Get reference length
  const reference = data.references.find(r => r.name === selectedRef);
  const refLength = reference ? reference.length : Math.max(...data.references.map(r => r.length));
  
  // Calculate total query space needed with custom ordering
  const orderedQueries = [...data.queries].sort((a, b) => {
    const orderA = contigOrder[a.name] !== undefined ? contigOrder[a.name] : 999999;
    const orderB = contigOrder[b.name] !== undefined ? contigOrder[b.name] : 999999;
    return orderA - orderB;
  });
  
  const queryOffsets = calculateQueryOffsets(orderedQueries);
  const totalQueryLength = Math.max(...Object.values(queryOffsets)) + 
                           Math.max(...orderedQueries.map(q => q.length));
  
  return {
    refScale: drawWidth / refLength,
    queryScale: drawHeight / totalQueryLength,
    margin,
    drawWidth,
    drawHeight,
    refLength,
    totalQueryLength,
    queryOffsets,
    orderedQueries
  };
};

/**
 * Calculate vertical offsets for stacking queries with custom ordering
 * @param {Array} queries - Query sequences (potentially reordered)
 * @returns {Object} Query name to offset mapping
 */
export const calculateQueryOffsets = (queries) => {
  const offsets = {};
  let currentOffset = 0;
  
  queries.forEach(query => {
    offsets[query.name] = currentOffset;
    
    // Add gap based on query type and modifications
    let gap = Math.max(1000000, query.length * 0.1);
    
    // Add extra space for broken queries
    if (query.isBroken) {
      gap *= 0.5; // Smaller gap for broken segments
    }
    
    currentOffset += query.length + gap;
  });
  
  return offsets;
};

/**
 * Draw all alignments on the canvas with modification support
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {Array} alignments - Filtered alignments to draw
 * @param {Object} data - Full parsed data
 * @param {Object} options - Drawing options
 */
export const drawAlignments = (ctx, alignments, data, options) => {
  const {
    width,
    height,
    selectedRef,
    viewMode,
    settings,
    selectedContigs,
    visualMods = { modifiedAlignments: new Map() },
    contigOrder = {},
    referenceFlipped = true,
    zoom = 1,
    pan = { x: 0, y: 0 }
  } = options;

  const scales = calculateScales(data, selectedRef, { width, height }, contigOrder);

  // Set line cap and join for better appearance
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Draw alignments with modification awareness
  alignments.forEach((alignment, index) => {
    // Check if this contig is in a chromosome group
    const isInGroup = options.chromosomeGroups && Object.values(options.chromosomeGroups).some(group =>
      group.contigs && group.contigs.includes(alignment.query)
    );

    drawSingleAlignment(ctx, alignment, scales, {
      viewMode,
      settings,
      isSelected: selectedContigs.includes(alignment.query),
      modification: visualMods.modifiedAlignments.get(index),
      alignmentIndex: index,
      referenceFlipped,
      isContigInverted: visualMods.invertedQueries ? visualMods.invertedQueries.has(alignment.query) : false,
      isInGroup
    });
  });
  
  // Draw contig gridlines
  drawContigGridlines(ctx, scales, { width, height });
  
  // Draw axis lines
  drawAxes(ctx, scales, { width, height });

  // Draw scale indicators with zoom awareness
  drawScaleIndicators(ctx, scales, { width, height, selectedRef, zoom, pan });
  
  // Draw query labels with modification indicators
  drawQueryLabelsWithModifications(ctx, scales, options);
};

/**
 * Draw gridlines between contigs for better visualization
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {Object} scales - Scale information
 * @param {Object} canvasSize - Canvas dimensions
 */
export const drawContigGridlines = (ctx, scales, canvasSize) => {
  const { queryOffsets, queryScale, margin, orderedQueries } = scales;
  
  ctx.strokeStyle = '#e5e7eb';
  ctx.lineWidth = 1;
  ctx.setLineDash([5, 5]); // Dashed line
  
  orderedQueries.forEach((query, index) => {
    if (index > 0) { // Skip the first contig
      const yPos = queryOffsets[query.name] * queryScale + margin;
      
      ctx.beginPath();
      ctx.moveTo(margin, yPos);
      ctx.lineTo(canvasSize.width - margin, yPos);
      ctx.stroke();
    }
  });
  
  ctx.setLineDash([]); // Reset to solid line
};

/**
 * Draw a single alignment line with modification support
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {Object} alignment - Alignment to draw
 * @param {Object} scales - Scale information
 * @param {Object} options - Drawing options
 */
export const drawSingleAlignment = (ctx, alignment, scales, options) => {
  const { viewMode, settings, isSelected, modification } = options;
  const { refScale, queryScale, margin, queryOffsets, drawWidth } = scales;

  // Calculate coordinates - reference displays right to left
  const x1 = drawWidth - (alignment.refStart * refScale) + margin;
  const x2 = drawWidth - (alignment.refEnd * refScale) + margin;

  const queryOffset = queryOffsets[alignment.query] || 0;
  let y1 = (queryOffset + alignment.queryStart) * queryScale + margin;
  let y2 = (queryOffset + alignment.queryEnd) * queryScale + margin;

  // Determine if we need to swap y coordinates based on orientation and inversion
  // Forward alignments normally have positive slope (bottom-left to top-right)
  // Reverse alignments normally have negative slope (top-left to bottom-right)
  // When a contig is inverted, the slope should flip
  let shouldSwapY = alignment.alignedOrientation === '-';

  // If contig is inverted, flip the swap behavior
  if (options.isContigInverted) {
    shouldSwapY = !shouldSwapY;
  }

  if (shouldSwapY) {
    [y1, y2] = [y2, y1]; // Swap y coordinates to create negative slope
  }
  
  // Determine color based on modifications and view mode
  let strokeColor = getAlignmentColor(alignment, viewMode, settings, modification, options);
  let lineWidth = settings.lineThickness;
  let opacity = 1.0;

  // Grey out contigs that have been assigned to a group
  if (options.isInGroup) {
    strokeColor = '#9ca3af'; // Grey color for grouped contigs
    opacity = 0.4; // Make them semi-transparent
  }

  // Highlight selected contigs (overrides grouped styling)
  if (isSelected) {
    strokeColor = '#dc2626'; // Red for selected
    lineWidth = Math.max(lineWidth + 2, 3);
    opacity = 1.0; // Full opacity for selected
  }
  
  // Make modified alignments slightly thicker
  if (modification) {
    lineWidth += 1;
  }
  
  // Set drawing style
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = lineWidth;

  // Adjust opacity for repetitive alignments and grouped contigs
  const baseOpacity = alignment.tag === 'repetitive' ? 0.6 : 0.9;
  const finalOpacity = modification ? Math.min(baseOpacity + 0.2, 1.0) : baseOpacity;
  ctx.globalAlpha = finalOpacity * opacity; // Apply group opacity multiplier

  // Draw the alignment line (no dashed lines - flip suggestions shown in control panel only)
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();

  // Add modification indicators (small circles at endpoints)
  if (modification) {
    ctx.fillStyle = strokeColor;
    ctx.globalAlpha = 1.0;

    // Start point
    ctx.beginPath();
    ctx.arc(x1, y1, 2, 0, 2 * Math.PI);
    ctx.fill();

    // End point
    ctx.beginPath();
    ctx.arc(x2, y2, 2, 0, 2 * Math.PI);
    ctx.fill();
  }

  // Reset alpha
  ctx.globalAlpha = 1.0;
};

/**
 * Get color for an alignment based on view mode and modifications
 * @param {Object} alignment - Alignment object
 * @param {string} viewMode - 'directionality' or 'identity'
 * @param {Object} settings - Color settings
 * @param {Object} modification - Modification data if any
 * @param {Object} options - Additional options (isContigInverted, etc.)
 * @returns {string} Color string
 */
export const getAlignmentColor = (alignment, viewMode, settings, modification = null, options = {}) => {
  // Override with modification colors for breaks only
  if (modification) {
    if (modification.isBroken && modification.isPartial) {
      return '#dc2626'; // Red for partial alignments from breaks
    } else if (modification.isBroken) {
      return '#f59e0b'; // Amber for broken segments
    }
    // Note: inverted contigs use standard coloring with swapped colors (handled below)
  }

  // Standard coloring
  if (viewMode === 'directionality') {
    if (alignment.tag === 'repetitive') {
      return settings.colors.repetitive;
    } else {
      // Use alignedOrientation from minimap2 to determine forward/reverse
      // This applies to both 'unique' and 'unique_short' alignments
      // '+' means forward (same strand), '-' means reverse (opposite strand)
      let isReverse = alignment.alignedOrientation === '-';

      // If this contig has been inverted by user, swap the colors
      // This reflects the new orientation of the inverted contig
      if (options.isContigInverted) {
        isReverse = !isReverse; // Flip the color since contig orientation changed
      }

      return isReverse ? settings.colors.uniqueReverse : settings.colors.uniqueForward;
    }
  } else if (viewMode === 'identity') {
    // Map identity (25-100%) to color gradient (red to green) - UPDATED RANGE
    const identityRatio = Math.max(0, Math.min(1, (alignment.identity - 25) / 75));
    const red = Math.floor(255 * (1 - identityRatio));
    const green = Math.floor(255 * identityRatio);
    return `rgb(${red}, ${green}, 0)`;
  }

  return '#666666'; // Default color
};

/**
 * Draw coordinate axes
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {Object} scales - Scale information
 * @param {Object} canvasSize - Canvas dimensions
 */
export const drawAxes = (ctx, scales, canvasSize) => {
  const { margin, drawWidth, drawHeight } = scales;
  
  ctx.strokeStyle = '#e5e7eb';
  ctx.lineWidth = 1;
  
  // X-axis (reference)
  ctx.beginPath();
  ctx.moveTo(margin, canvasSize.height - margin);
  ctx.lineTo(margin + drawWidth, canvasSize.height - margin);
  ctx.stroke();
  
  // Y-axis (query)
  ctx.beginPath();
  ctx.moveTo(margin, margin);
  ctx.lineTo(margin, margin + drawHeight);
  ctx.stroke();
};

/**
 * Draw scale indicators and labels
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {Object} scales - Scale information
 * @param {Object} options - Drawing options (includes zoom and pan)
 */
export const drawScaleIndicators = (ctx, scales, options) => {
  const { height, width, zoom = 1, selectedRef } = options;
  const { refScale, margin, refLength, drawWidth } = scales;

  ctx.fillStyle = '#6b7280';
  ctx.font = '11px Inter, sans-serif';
  ctx.textAlign = 'center';

  // Adjust number of ticks based on zoom level
  // More zoomed in = more ticks for finer detail
  let numTicks = 5;
  if (zoom > 5) numTicks = 10;
  else if (zoom > 2) numTicks = 7;

  // Reference scale (X-axis) - visual is right-to-left, but labels show left-to-right coordinates
  const refTicks = calculateTicks(refLength, numTicks);
  refTicks.forEach(tick => {
    // Visual position is flipped (right-to-left)
    const x = drawWidth - (tick * refScale) + margin;

    // Draw tick mark
    ctx.strokeStyle = '#d1d5db';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, height - margin);
    ctx.lineTo(x, height - margin + 5);
    ctx.stroke();

    // Draw label showing genomic position (left-to-right coordinates)
    const actualPosition = refLength - tick;
    ctx.fillText(formatBasePairs(actualPosition), x, height - margin + 18);
  });

  // Draw reference chromosome name label on x-axis (within transformed context)
  if (selectedRef) {
    ctx.fillStyle = '#374151';
    ctx.font = '14px Inter, sans-serif';
    ctx.textAlign = 'center';
    const xAxisLabel = `Reference: ${selectedRef}`;
    ctx.fillText(xAxisLabel, width / 2, height - margin + 35);
  }
};

/**
 * Draw query labels with modification indicators
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {Object} scales - Scale information
 * @param {Object} options - Drawing options
 */
export const drawQueryLabelsWithModifications = (ctx, scales, options) => {
  const { selectedContigs = [], chromosomeGroups = {}, settings = {} } = options;
  const { queryOffsets, queryScale, margin } = scales;
  const fontSize = settings.labelFontSize || 14; // Default to 14px if not specified

  ctx.textAlign = 'right';

  scales.orderedQueries.forEach(query => {
    const yPos = (queryOffsets[query.name] + query.length / 2) * queryScale + margin;

    // Highlight selected queries
    const isSelected = selectedContigs.includes(query.name);

    // Check if this contig is in a group
    const isInGroup = Object.values(chromosomeGroups).some(group =>
      group.contigs && group.contigs.includes(query.name)
    );

    // Base label with configurable font size
    ctx.fillStyle = isSelected ? '#dc2626' : (isInGroup ? '#9ca3af' : '#374151');
    ctx.font = isSelected ? `bold ${fontSize}px Inter, sans-serif` : `${fontSize}px Inter, sans-serif`;
    ctx.fillText(query.name, margin - 10, yPos);
    
    // Modification indicators
    let iconOffset = 25;

    if (query.isInverted) {
      ctx.fillStyle = '#374151'; // Gray color to match standard labels
      ctx.fillText('↻', margin - iconOffset, yPos);
      iconOffset += 15;
    }

    if (query.isBroken) {
      ctx.fillStyle = '#f59e0b';
      ctx.fillText('✂', margin - iconOffset, yPos);
      iconOffset += 15;
    }
    
    // Group indicator
    if (query.group) {
      ctx.fillStyle = '#3b82f6';
      ctx.font = '8px Inter, sans-serif';
      ctx.fillText(query.group, margin - iconOffset, yPos);
    }
  });
};

/**
 * Calculate appropriate tick positions for a scale
 * @param {number} maxValue - Maximum value on scale
 * @param {number} targetTicks - Desired number of ticks
 * @returns {Array} Array of tick positions
 */
export const calculateTicks = (maxValue, targetTicks) => {
  const rawStep = maxValue / targetTicks;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const normalizedStep = rawStep / magnitude;
  
  let step;
  if (normalizedStep <= 1) step = magnitude;
  else if (normalizedStep <= 2) step = 2 * magnitude;
  else if (normalizedStep <= 5) step = 5 * magnitude;
  else step = 10 * magnitude;
  
  const ticks = [];
  for (let i = 0; i * step <= maxValue; i++) {
    ticks.push(i * step);
  }
  
  return ticks;
};

/**
 * Format base pair numbers for display
 * @param {number} bp - Base pair count
 * @returns {string} Formatted string
 */
export const formatBasePairs = (bp) => {
  if (bp === 0) return '0';
  if (bp >= 1000000) return `${(bp / 1000000).toFixed(1)}M`;
  if (bp >= 1000) return `${(bp / 1000).toFixed(0)}K`;
  return bp.toString();
};

/**
 * Calculate visible region based on zoom and pan
 * @param {Object} canvasSize - Canvas dimensions
 * @param {number} zoom - Zoom level
 * @param {Object} pan - Pan offset
 * @returns {Object} Visible region bounds
 */
export const getVisibleRegion = (canvasSize, zoom, pan) => {
  const visibleLeft = (-pan.x) / zoom;
  const visibleTop = (-pan.y) / zoom;
  const visibleWidth = canvasSize.width / zoom;
  const visibleHeight = canvasSize.height / zoom;
  
  return {
    left: visibleLeft,
    top: visibleTop,
    right: visibleLeft + visibleWidth,
    bottom: visibleTop + visibleHeight,
    width: visibleWidth,
    height: visibleHeight
  };
};

/**
 * Check if an alignment is visible in the current view
 * @param {Object} alignment - Alignment object
 * @param {Object} scales - Scale information
 * @param {Object} visibleRegion - Visible region bounds
 * @returns {boolean} True if visible
 */
export const isAlignmentVisible = (alignment, scales, visibleRegion) => {
  const { refScale, queryScale, margin, queryOffsets } = scales;
  
  const x1 = alignment.refStart * refScale + margin;
  const x2 = alignment.refEnd * refScale + margin;
  const minX = Math.min(x1, x2);
  const maxX = Math.max(x1, x2);
  
  const queryOffset = queryOffsets[alignment.query] || 0;
  const y1 = (queryOffset + alignment.queryStart) * queryScale + margin;
  const y2 = (queryOffset + alignment.queryEnd) * queryScale + margin;
  const minY = Math.min(y1, y2);
  const maxY = Math.max(y1, y2);
  
  return !(maxX < visibleRegion.left || 
           minX > visibleRegion.right || 
           maxY < visibleRegion.top || 
           minY > visibleRegion.bottom);
};

/**
 * Get contig at specific screen position (for drag and drop)
 * @param {number} x - Screen x coordinate
 * @param {number} y - Screen y coordinate
 * @param {Object} scales - Scale information
 * @param {Object} canvasTransform - Canvas zoom and pan
 * @returns {string|null} Contig name or null
 */
export const getContigAtPosition = (x, y, scales, canvasTransform) => {
  const { zoom, pan } = canvasTransform;
  const { queryOffsets, queryScale, margin } = scales;
  
  // Convert screen coordinates to canvas coordinates
  const canvasX = (x - pan.x) / zoom;
  const canvasY = (y - pan.y) / zoom;
  
  // Check if click is in the query label area
  if (canvasX > margin) return null; // Only allow interactions in label area
  
  // Find which query this Y position corresponds to
  for (const query of scales.orderedQueries) {
    const queryY = queryOffsets[query.name] * queryScale + margin;
    const queryHeight = query.length * queryScale;
    
    if (canvasY >= queryY && canvasY <= queryY + queryHeight) {
      return query.name;
    }
  }
  
  return null;
};