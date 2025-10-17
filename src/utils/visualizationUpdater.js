// src/utils/visualizationUpdater.js
// Apply modifications to visualization data in real-time

/**
 * Apply all modifications to the visualization data
 * @param {Object} originalData - Original parsed data
 * @param {Array} modifications - Array of modifications to apply
 * @param {Object} contigOrder - Manual contig ordering
 * @returns {Object} Updated data with modifications applied
 */
export const applyModificationsToVisualization = (originalData, modifications, contigOrder) => {
  // Deep copy original data to avoid mutations
  const data = JSON.parse(JSON.stringify(originalData));
  
  // Apply each modification
  modifications.forEach(modification => {
    switch (modification.type) {
      case 'invert':
        applyInversion(data, modification);
        break;
      case 'break':
        applyBreak(data, modification);
        break;
      case 'reorder':
        // Reordering is handled by contigOrder parameter
        break;
      default:
        console.warn('Unknown modification type:', modification.type);
    }
  });
  
  // Apply manual contig ordering
  if (contigOrder && Object.keys(contigOrder).length > 0) {
    applyContigReordering(data, contigOrder);
  }
  
  return data;
};

/**
 * Apply inversion modification to visualization
 * @param {Object} data - Data to modify
 * @param {Object} modification - Inversion modification
 */
const applyInversion = (data, modification) => {
  const { query } = modification;
  
  // Find the query sequence
  const querySeq = data.queries.find(q => q.name === query);
  if (!querySeq) {
    console.warn('Query not found for inversion:', query);
    return;
  }
  
  // Update alignments for this query - COMPLETELY REPLACE coordinates
  data.alignments.forEach(alignment => {
    if (alignment.query === query) {
      // Store original coordinates if not already stored
      if (!alignment.originalQueryStart) {
        alignment.originalQueryStart = alignment.queryStart;
        alignment.originalQueryEnd = alignment.queryEnd;
      }
      
      // Apply inversion: flip coordinates relative to sequence length
      const queryLength = querySeq.length;
      const newQueryStart = queryLength - alignment.originalQueryEnd;
      const newQueryEnd = queryLength - alignment.originalQueryStart;
      
      // REPLACE the coordinates entirely
      alignment.queryStart = newQueryStart;
      alignment.queryEnd = newQueryEnd;
      
      // Mark as inverted for visual styling
      alignment.isInverted = true;
      alignment.wasModified = true;
    }
  });
  
  // Update query orientation and mark as inverted
  querySeq.orientation = querySeq.orientation === '+' ? '-' : '+';
  querySeq.isInverted = true;
};

/**
 * Apply break modification to visualization
 * @param {Object} data - Data to modify  
 * @param {Object} modification - Break modification
 */
const applyBreak = (data, modification) => {
  const { query, position } = modification;
  
  // Find the query sequence
  const querySeq = data.queries.find(q => q.name === query);
  if (!querySeq) {
    console.warn('Query not found for break:', query);
    return;
  }
  
  // Create two new query segments
  const leftSegment = {
    ...querySeq,
    name: `${query}_1`,
    length: position,
    isBroken: true,
    originalName: query,
    segmentNumber: 1
  };
  
  const rightSegment = {
    ...querySeq,
    name: `${query}_2`, 
    length: querySeq.length - position,
    isBroken: true,
    originalName: query,
    segmentNumber: 2
  };
  
  // Replace original query with segments
  const queryIndex = data.queries.findIndex(q => q.name === query);
  data.queries.splice(queryIndex, 1, leftSegment, rightSegment);
  
  // Update alignments
  const alignmentsToUpdate = data.alignments.filter(a => a.query === query);
  const newAlignments = [];
  
  alignmentsToUpdate.forEach(alignment => {
    const { queryStart, queryEnd } = alignment;
    
    // Determine which segment(s) this alignment belongs to
    if (queryEnd <= position) {
      // Alignment is entirely in left segment
      newAlignments.push({
        ...alignment,
        query: `${query}_1`,
        isBrokenAlignment: true
      });
    } else if (queryStart >= position) {
      // Alignment is entirely in right segment
      newAlignments.push({
        ...alignment,
        query: `${query}_2`,
        queryStart: queryStart - position,
        queryEnd: queryEnd - position,
        isBrokenAlignment: true
      });
    } else {
      // Alignment spans the break - split it
      newAlignments.push({
        ...alignment,
        query: `${query}_1`,
        queryEnd: position,
        isBrokenAlignment: true,
        isPartial: true
      });
      
      newAlignments.push({
        ...alignment,
        query: `${query}_2`,
        queryStart: 0,
        queryEnd: queryEnd - position,
        isBrokenAlignment: true,
        isPartial: true
      });
    }
  });
  
  // Remove original alignments and add new ones
  data.alignments = data.alignments.filter(a => a.query !== query);
  data.alignments.push(...newAlignments);
};

/**
 * Apply manual contig reordering to data
 * @param {Object} data - Data to modify
 * @param {Object} contigOrder - Mapping of contig names to order indices
 */
const applyContigReordering = (data, contigOrder) => {
  // Sort queries based on manual ordering
  data.queries.sort((a, b) => {
    const orderA = contigOrder[a.name] !== undefined ? contigOrder[a.name] : 999999;
    const orderB = contigOrder[b.name] !== undefined ? contigOrder[b.name] : 999999;
    return orderA - orderB;
  });
};

/**
 * Calculate visual modifications for rendering
 * @param {Array} alignments - Alignment data
 * @param {Array} modifications - Modification list
 * @returns {Object} Visual modification data
 */
export const calculateVisualModifications = (alignments, modifications) => {
  const visualMods = {
    invertedQueries: new Set(),
    brokenQueries: new Set(),
    modifiedAlignments: new Map()
  };
  
  modifications.forEach(mod => {
    if (mod.type === 'invert') {
      visualMods.invertedQueries.add(mod.query);
    } else if (mod.type === 'break') {
      visualMods.brokenQueries.add(mod.query);
    }
  });
  
  // Mark alignments that are affected by modifications
  alignments.forEach((alignment, index) => {
    if (visualMods.invertedQueries.has(alignment.query) || 
        visualMods.brokenQueries.has(alignment.query) ||
        alignment.isBrokenAlignment ||
        alignment.isInverted) {
      visualMods.modifiedAlignments.set(index, {
        isInverted: alignment.isInverted || visualMods.invertedQueries.has(alignment.query),
        isBroken: alignment.isBrokenAlignment || visualMods.brokenQueries.has(alignment.query),
        isPartial: alignment.isPartial
      });
    }
  });
  
  return visualMods;
};

/**
 * Get query offsets accounting for breaks and reordering
 * @param {Array} queries - Query array (potentially modified)
 * @returns {Object} Query name to offset mapping
 */
export const calculateModifiedQueryOffsets = (queries) => {
  const offsets = {};
  let currentOffset = 0;
  
  queries.forEach(query => {
    offsets[query.name] = currentOffset;
    
    // Add some extra space for broken segments
    const gap = query.isBroken ? query.length * 0.05 : Math.max(1000000, query.length * 0.1);
    currentOffset += query.length + gap;
  });
  
  return offsets;
};

/**
 * Get color for modified alignments
 * @param {Object} alignment - Alignment object
 * @param {Object} visualMods - Visual modifications data
 * @param {string} viewMode - Current view mode
 * @param {Object} settings - Color settings
 * @returns {string} Color string
 */
export const getModifiedAlignmentColor = (alignment, visualMods, viewMode, settings) => {
  const alignmentIndex = alignment.index;
  const modification = visualMods.modifiedAlignments.get(alignmentIndex);
  
  if (!modification) {
    // Use standard coloring
    if (viewMode === 'directionality') {
      if (alignment.tag === 'repetitive') {
        return settings.colors.repetitive;
      } else if (alignment.queryStart < alignment.queryEnd) {
        return settings.colors.uniqueForward;
      } else {
        return settings.colors.uniqueReverse;
      }
    } else {
      const identityRatio = Math.max(0, Math.min(1, (alignment.identity - 60) / 40));
      const red = Math.floor(255 * (1 - identityRatio));
      const green = Math.floor(255 * identityRatio);
      return `rgb(${red}, ${green}, 0)`;
    }
  }
  
  // Modified alignment coloring
  if (modification.isBroken && modification.isPartial) {
    return '#dc2626'; // Red for partial alignments from breaks
  } else if (modification.isBroken) {
    return '#f59e0b'; // Amber for broken segments
  } else if (modification.isInverted) {
    return '#8b5cf6'; // Purple for inverted
  }
  
  return '#6b7280'; // Gray fallback
};

/**
 * Check if a query has been modified
 * @param {string} queryName - Query name to check
 * @param {Array} modifications - List of modifications
 * @returns {boolean} True if modified
 */
export const isQueryModified = (queryName, modifications) => {
  return modifications.some(mod => 
    mod.query === queryName || 
    mod.query === queryName.split('_')[0] // Check original name for broken segments
  );
};