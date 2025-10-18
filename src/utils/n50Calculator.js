// src/utils/n50Calculator.js

/**
 * Calculate N50 statistic for a set of sequences
 * N50 is the sequence length of the shortest contig at 50% of the total assembly length
 *
 * @param {Array} queries - Array of query objects with name and length properties
 * @returns {Object} Object with n50, totalLength, and contigCount
 */
export const calculateN50 = (queries) => {
  if (!queries || queries.length === 0) {
    return {
      n50: 0,
      totalLength: 0,
      contigCount: 0,
      l50: 0
    };
  }

  // Extract lengths and sort in descending order
  const lengths = queries.map(q => q.length).sort((a, b) => b - a);

  // Calculate total assembly length
  const totalLength = lengths.reduce((sum, len) => sum + len, 0);
  const halfLength = totalLength / 2;

  // Find N50 - the length where cumulative length >= 50% of total
  let cumulativeLength = 0;
  let n50 = 0;
  let l50 = 0; // Number of contigs that contain 50% of the assembly

  for (let i = 0; i < lengths.length; i++) {
    cumulativeLength += lengths[i];
    if (cumulativeLength >= halfLength) {
      n50 = lengths[i];
      l50 = i + 1;
      break;
    }
  }

  return {
    n50,
    totalLength,
    contigCount: lengths.length,
    l50,
    // Additional useful statistics
    maxContigLength: lengths[0],
    minContigLength: lengths[lengths.length - 1],
    meanContigLength: Math.round(totalLength / lengths.length)
  };
};

/**
 * Format N50 value for display
 * @param {number} n50 - N50 value in base pairs
 * @returns {string} Formatted string (e.g., "5.2 Mb" or "450 kb")
 */
export const formatN50 = (n50) => {
  if (n50 >= 1000000) {
    return `${(n50 / 1000000).toFixed(2)} Mb`;
  } else if (n50 >= 1000) {
    return `${(n50 / 1000).toFixed(1)} kb`;
  } else {
    return `${n50} bp`;
  }
};

/**
 * Determine if N50 is below recommended threshold
 * @param {number} n50 - N50 value in base pairs
 * @param {number} threshold - Threshold in base pairs (default 5Mb)
 * @returns {boolean} True if N50 is below threshold
 */
export const isN50BelowThreshold = (n50, threshold = 5000000) => {
  return n50 < threshold;
};
