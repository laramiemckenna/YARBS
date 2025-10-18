// src/components/N50Modal.jsx
import React from 'react';
import { AlertTriangle, CheckCircle, X, Info } from 'lucide-react';

const N50Modal = ({ isOpen, n50Stats, onProceed, onCancel }) => {
  if (!isOpen || !n50Stats) return null;

  const { n50, totalLength, contigCount, l50, maxContigLength, minContigLength, meanContigLength } = n50Stats;
  const threshold = 5000000; // 5 Mb
  const isBelowThreshold = n50 < threshold;

  const formatLength = (length) => {
    if (length >= 1000000) {
      return `${(length / 1000000).toFixed(2)} Mb`;
    } else if (length >= 1000) {
      return `${(length / 1000).toFixed(1)} kb`;
    } else {
      return `${length} bp`;
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className={`p-6 border-b ${isBelowThreshold ? 'bg-orange-50' : 'bg-green-50'}`}>
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-3">
              {isBelowThreshold ? (
                <AlertTriangle size={32} className="text-orange-600 flex-shrink-0 mt-1" />
              ) : (
                <CheckCircle size={32} className="text-green-600 flex-shrink-0 mt-1" />
              )}
              <div>
                <h2 className="text-2xl font-bold text-gray-900">
                  Assembly Quality Report
                </h2>
              </div>
            </div>
            <button
              onClick={onCancel}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X size={24} />
            </button>
          </div>
        </div>

        {/* Main Content */}
        <div className="p-6 space-y-6">
          {/* N50 Display */}
          <div className="bg-gray-50 rounded-lg p-6 border-2 border-gray-200">
            <div className="text-center">
              <div className="text-sm font-medium text-gray-600 mb-2">Assembly N50</div>
              <div className={`text-5xl font-bold ${isBelowThreshold ? 'text-orange-600' : 'text-green-600'}`}>
                {formatLength(n50)}
              </div>
              {isBelowThreshold && (
                <div className="mt-3 flex items-center justify-center gap-2 text-orange-700 bg-orange-100 px-4 py-2 rounded-md">
                  <AlertTriangle size={16} />
                  <span className="text-sm font-medium">
                    Below recommended threshold of 5 Mb
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Warning Message */}
          {isBelowThreshold && (
            <div className="bg-orange-50 border-l-4 border-orange-500 p-4 rounded">
              <div className="flex gap-3">
                <Info size={20} className="text-orange-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-orange-800">
                  <p className="font-semibold mb-2">Low N50 Detected</p>
                  <p>
                    Your assembly has an N50 below 5 Mb, which may indicate high fragmentation.
                    This could make scaffolding more challenging and may result in:
                  </p>
                  <ul className="list-disc ml-5 mt-2 space-y-1">
                    <li>More contigs to manually review and organize</li>
                    <li>Potentially ambiguous alignment patterns</li>
                    <li>Increased time needed for scaffolding decisions</li>
                  </ul>
                  <p className="mt-2 font-medium">
                    You can still proceed, but be prepared for a more detailed scaffolding process.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Statistics Table */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <Info size={16} />
              Assembly Statistics
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-gray-50 rounded p-3 border border-gray-200">
                <div className="text-xs text-gray-600 mb-1">Total Assembly Length</div>
                <div className="text-lg font-semibold text-gray-900">{formatLength(totalLength)}</div>
              </div>
              <div className="bg-gray-50 rounded p-3 border border-gray-200">
                <div className="text-xs text-gray-600 mb-1">Number of Contigs</div>
                <div className="text-lg font-semibold text-gray-900">{contigCount.toLocaleString()}</div>
              </div>
              <div className="bg-gray-50 rounded p-3 border border-gray-200">
                <div className="text-xs text-gray-600 mb-1">L50</div>
                <div className="text-lg font-semibold text-gray-900">{l50.toLocaleString()}</div>
                <div className="text-xs text-gray-500 mt-1">contigs contain 50% of assembly</div>
              </div>
              <div className="bg-gray-50 rounded p-3 border border-gray-200">
                <div className="text-xs text-gray-600 mb-1">Mean Contig Length</div>
                <div className="text-lg font-semibold text-gray-900">{formatLength(meanContigLength)}</div>
              </div>
              <div className="bg-gray-50 rounded p-3 border border-gray-200">
                <div className="text-xs text-gray-600 mb-1">Longest Contig</div>
                <div className="text-lg font-semibold text-gray-900">{formatLength(maxContigLength)}</div>
              </div>
              <div className="bg-gray-50 rounded p-3 border border-gray-200">
                <div className="text-xs text-gray-600 mb-1">Shortest Contig</div>
                <div className="text-lg font-semibold text-gray-900">{formatLength(minContigLength)}</div>
              </div>
            </div>
          </div>

          {/* Why Calculate N50 */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex gap-2">
              <Info size={16} className="text-blue-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-blue-900">
                <p className="font-bold mb-2">Why do we calculate your query's N50?</p>
                <p className="mb-3">
                  If your assembly has a low N50 value, reference-based scaffolding will be challenging
                  and may introduce more technical artifacts than a more contiguous assembly. If it is
                  low relative to your genome size, we recommend either 1) sequencing to a higher depth
                  and/or 2) acquiring Hi-C or Omni-C data to more reliably pull your contigs into scaffolds.
                </p>
                <p className="font-bold mb-2">What is a contig N50?</p>
                <p>
                  N50 is a measure of assembly contiguity. It represents the length-weighted median
                  contig size, where 50% of the total assembly is contained in contigs of this length
                  or longer.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t bg-gray-50 flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors font-medium"
          >
            Cancel
          </button>
          <button
            onClick={onProceed}
            className={`px-6 py-2 rounded-md font-medium transition-colors ${
              isBelowThreshold
                ? 'bg-orange-600 hover:bg-orange-700 text-white'
                : 'bg-green-600 hover:bg-green-700 text-white'
            }`}
          >
            {isBelowThreshold ? 'Proceed Anyway' : 'Continue'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default N50Modal;
