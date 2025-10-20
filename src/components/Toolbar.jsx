// src/components/Toolbar.jsx - Enhanced version with working reset functionality
import React, { useRef } from 'react';
import {
  Upload,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Download,
  Move,
  Scissors,
  Loader2,
  RefreshCw,
  Info,
  Undo
} from 'lucide-react';
import DemoSection from './DemoSection';

const Toolbar = ({
  onFileUpload,
  viewMode,
  onViewModeChange,
  explorationMode,
  onExplorationModeChange,
  zoom,
  onZoomIn,
  onZoomOut,
  onResetView,
  onResetAll,
  onUndo,
  canUndo,
  onExportSession,
  onExportForScaffolding,
  loading,
  hasData,
  hasModifications
}) => {
  const fileInputRef = useRef(null);

  const handleFileInputChange = (event) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      onFileUpload(files);
    }
    // Reset the input so the same files can be selected again
    event.target.value = '';
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleResetView = () => {
    if (onResetView) {
      onResetView();
    }
  };

  const handleResetAll = () => {
    if (onResetAll) {
      const confirmReset = window.confirm(
        'This will reset all modifications, selections, and view settings. Are you sure?'
      );
      if (confirmReset) {
        onResetAll();
      }
    }
  };

  return (
    <div className="p-4 border-b bg-gray-50 border-gray-200">
      <div className="flex items-center justify-between flex-wrap gap-4">
        {/* Left section - File operations */}
        {!hasData && (
          <div className="flex items-center gap-3">
            <button
              onClick={handleUploadClick}
              disabled={loading}
              className={`
                flex items-center gap-3 px-8 py-4 rounded-md font-medium transition-colors text-lg
                ${loading
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'text-white shadow-sm'
                }
              `}
              style={!loading ? { backgroundColor: '#ef4444' } : {}}
              onMouseEnter={(e) => !loading && (e.target.style.backgroundColor = '#dc2626')}
              onMouseLeave={(e) => !loading && (e.target.style.backgroundColor = '#ef4444')}
              title="Upload .coords and .coords.idx files"
            >
              {loading ? (
                <>
                  <Loader2 size={24} className="animate-spin" />
                  Loading...
                </>
              ) : (
                <>
                  <Upload size={24} />
                  Load Files
                </>
              )}
            </button>

            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".coords,.idx,.json"
              onChange={handleFileInputChange}
              className="hidden"
            />
          </div>
        )}

        {/* Center section - View controls */}
        {hasData && (
          <div className="flex items-center gap-2">
            {/* Mode toggle */}
            <button
              onClick={() => onExplorationModeChange(!explorationMode)}
              className={`
                flex items-center gap-2 px-3 py-2 rounded-md font-medium transition-colors shadow-sm
                ${explorationMode
                  ? 'bg-green-500 hover:bg-green-600 text-white'
                  : 'bg-red-500 hover:bg-red-600 text-white'
                }
              `}
              title={explorationMode
                ? 'Switch to scaffolding mode for contig manipulation'
                : 'Switch to exploration mode for viewing and navigation'
              }
            >
              {explorationMode ? <Move size={16} /> : <Scissors size={16} />}
              <span className="hidden sm:inline">
                {explorationMode ? 'Exploration' : 'Scaffolding'}
              </span>
            </button>
          </div>
        )}

        {/* Right section - Navigation and export */}
        <div className="flex items-center gap-2">
          {hasData && (
            <>
              {/* Zoom controls - only show in exploration mode */}
              {explorationMode && (
                <div className="flex items-center bg-white border border-gray-300 rounded-md overflow-hidden shadow-sm">
                  <button
                    onClick={onZoomOut}
                    className="p-2 hover:bg-gray-50 transition-colors"
                    title="Zoom Out (or use mouse wheel)"
                  >
                    <ZoomOut size={16} />
                  </button>
                  
                  <div className="px-3 py-2 text-sm font-mono bg-gray-50 border-l border-r border-gray-300 min-w-[80px] text-center">
                    {zoom.toFixed(1)}x
                  </div>
                  
                  <button
                    onClick={onZoomIn}
                    className="p-2 hover:bg-gray-50 transition-colors"
                    title="Zoom In (or use mouse wheel)"
                  >
                    <ZoomIn size={16} />
                  </button>
                </div>
              )}

              {/* Reset view */}
              <button
                onClick={handleResetView}
                className="p-2 bg-white hover:bg-gray-50 border border-gray-300 rounded-md transition-colors shadow-sm"
                title="Reset zoom and pan to default"
              >
                <RotateCcw size={16} />
              </button>

              {/* Undo button - only show in scaffolding mode */}
              {!explorationMode && canUndo && (
                <button
                  onClick={onUndo}
                  className="flex items-center gap-1 px-3 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-md font-medium transition-colors shadow-sm"
                  title="Undo last action"
                >
                  <Undo size={14} />
                  <span className="hidden sm:inline">Undo</span>
                </button>
              )}

              {/* Reset all modifications */}
              {hasModifications && (
                <button
                  onClick={handleResetAll}
                  className="flex items-center gap-1 px-3 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-md font-medium transition-colors shadow-sm"
                  title="Reset all modifications and selections"
                >
                  <RefreshCw size={14} />
                  <span className="hidden sm:inline">Reset All</span>
                </button>
              )}
            </>
          )}

          {/* Export buttons */}
          {!explorationMode && hasModifications && (
            <>
              <button
                onClick={onExportSession}
                className="flex items-center gap-2 px-3 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-md font-medium transition-colors shadow-sm"
                title="Save your work - Export complete session to reload later (includes all workspaces and settings)"
              >
                <Download size={16} />
                <span className="hidden sm:inline">Save Session</span>
              </button>

              <button
                onClick={onExportForScaffolding}
                className="flex items-center gap-2 px-3 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-md font-medium transition-colors shadow-sm"
                title="Final export - Creates both scaffolding JSON and changes CSV for publications"
              >
                <Download size={16} />
                <span className="hidden sm:inline">Export for Scaffolding</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Secondary toolbar for additional information and controls */}
      {hasData && (
        <div className="mt-3 pt-3 border-t border-gray-200">
          <div className="flex items-center justify-between text-sm text-gray-600">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1">
                Mode: <strong className={explorationMode ? 'text-green-600' : 'text-red-600'}>
                  {explorationMode ? 'Exploration' : 'Scaffolding'}
                </strong>
                {!explorationMode && (
                  <Info size={12} className="text-blue-500" title="Use control panel to make modifications" />
                )}
              </span>
              {zoom !== 1 && (
                <span>Zoom: <strong>{zoom.toFixed(1)}x</strong></span>
              )}
            </div>
            
            <div className="flex items-center gap-4">
              {explorationMode && (
                <span className="text-gray-500 text-xs">
                  Use mouse wheel to zoom, drag to pan
                </span>
              )}
              {hasModifications && (
                <span className="text-purple-600 font-medium">
                  {hasModifications} modifications active
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Help hints and demo section for new users */}
      {!hasData && !loading && (
        <>
          {/* Getting Started guide */}
          <div className="mt-6 pt-6 border-t border-gray-200">
            <div className="text-2xl text-gray-600">
              <div className="flex items-center gap-3 mb-4">
                <Info size={36} className="text-blue-500" />
                <span className="font-medium text-3xl">Getting Started with Your Own Data:</span>
              </div>
              <div className="ml-12 space-y-3 text-xl">
                <p>1. Generate coordinate files using: <code className="bg-gray-100 px-2 py-1 rounded text-lg">python minimap_prep.py -r reference.fasta -q query.fasta -o output</code></p>
                <p>2. Click "Load Files" and select both <code className="bg-gray-100 px-2 py-1 rounded text-lg">.coords</code> and <code className="bg-gray-100 px-2 py-1 rounded text-lg">.coords.idx</code> files</p>
                <p>3. <strong>Optional:</strong> Include a previously exported <code className="bg-gray-100 px-2 py-1 rounded text-lg">.json</code> session file to restore your work</p>
                <p>4. Use Exploration mode for viewing, Scaffolding mode for modifications</p>
              </div>
            </div>
          </div>

          {/* Demo datasets */}
          <DemoSection onFileUpload={onFileUpload} />
        </>
      )}
    </div>
  );
};

export default Toolbar;