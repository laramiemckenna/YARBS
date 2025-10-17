// src/App.js - Enhanced version with reference-scoped workspaces
import React, { useState, useEffect, useMemo } from 'react';
import DotPlot from './components/DotPlot';
import ControlPanel from './components/ControlPanel';
import Toolbar from './components/Toolbar';
import SaveDialog from './components/SaveDialog';
import { parseCoordinateFiles } from './utils/fileParser';
import { applyModificationsToVisualization } from './utils/visualizationUpdater';
import './App.css';

function App() {
  // Main application state
  const [data, setData] = useState(null);
  const [originalData, setOriginalData] = useState(null); // Keep original for reset
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // Visualization state
  const [viewMode, setViewMode] = useState('directionality'); // 'directionality' | 'identity'
  const [explorationMode, setExplorationMode] = useState(true);
  const [selectedRef, setSelectedRef] = useState('');
  const [referenceFlipped, setReferenceFlipped] = useState(true); // Reference displayed right-to-left
  
  // Canvas interaction state
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  
  // NEW: Reference-scoped workspaces - each reference gets its own isolated state
  const [referenceWorkspaces, setReferenceWorkspaces] = useState({});

  // Legacy state for backward compatibility during migration (will be removed)
  const [lockedChromosomes, setLockedChromosomes] = useState(new Set());

  // Helper function to get or create workspace for a reference
  const getWorkspace = (refName) => {
    if (!refName) return null;
    if (!referenceWorkspaces[refName]) {
      return {
        contigOrder: {}, // Reference-specific contig order mapping
        modifications: [],
        chromosomeGroups: {},
        uninformativeContigs: new Set(),
        selectedContigs: [],
        saved: true,
        lastModified: null,
        history: [] // Per-reference undo history
      };
    }
    return referenceWorkspaces[refName];
  };

  // Helper function to update workspace for a reference
  const updateWorkspace = (refName, updates) => {
    setReferenceWorkspaces(prev => ({
      ...prev,
      [refName]: {
        ...getWorkspace(refName),
        ...prev[refName],
        ...updates,
        saved: false,
        lastModified: Date.now()
      }
    }));
  };

  // Get current workspace state (derived from selectedRef) - memoized to prevent recreation
  const currentWorkspace = useMemo(() => getWorkspace(selectedRef), [selectedRef, referenceWorkspaces]);
  const selectedContigs = useMemo(() => currentWorkspace?.selectedContigs || [], [currentWorkspace]);
  const modifications = useMemo(() => currentWorkspace?.modifications || [], [currentWorkspace]);
  const chromosomeGroups = useMemo(() => currentWorkspace?.chromosomeGroups || {}, [currentWorkspace]);
  const contigOrder = useMemo(() => currentWorkspace?.contigOrder || {}, [currentWorkspace]);
  const uninformativeContigs = useMemo(() => currentWorkspace?.uninformativeContigs || new Set(), [currentWorkspace]);
  const history = useMemo(() => currentWorkspace?.history || [], [currentWorkspace]);

  // Visualization settings
  const [settings, setSettings] = useState({
    showRepetitive: true,
    showAllAlignments: true, // Show all unique alignments by default (includes unique_short)
    minAlignmentLength: 0,
    minUniqueRatio: 0.05, // Minimum ratio of unique alignment to total contig length (5% default)
    minContigSize: 0, // Minimum contig size to display (kb)
    lineThickness: 5, // Default 5x (range 1-10)
    labelFontSize: 14, // Default 14px (range 8-24)
    colors: {
      uniqueForward: '#0081b0',
      uniqueReverse: '#87ba2d',
      repetitive: '#ef8717'
    }
  });

  // Set up global zoom update function for mouse wheel
  useEffect(() => {
    window.updateZoom = setZoom;
    return () => {
      delete window.updateZoom;
    };
  }, []);

  // File upload handler
  const handleFileUpload = async (files) => {
    if (files.length !== 2) {
      setError('Please select both .coords and .coords.idx files');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const coordsFile = Array.from(files).find(f => f.name.endsWith('.coords'));
      const idxFile = Array.from(files).find(f => f.name.endsWith('.coords.idx'));
      
      if (!coordsFile || !idxFile) {
        throw new Error('Please select .coords and .coords.idx files');
      }

      console.log('Loading files:', coordsFile.name, idxFile.name);
      
      const coordsText = await coordsFile.text();
      const idxText = await idxFile.text();
      
      const parsedData = parseCoordinateFiles(coordsText, idxText);
      
      // Store both original and working copies
      setOriginalData(JSON.parse(JSON.stringify(parsedData))); // Deep copy
      setData(parsedData);

      // Initialize workspaces for all references
      const initialWorkspaces = {};

      parsedData.references.forEach(ref => {
        // Create reference-specific contig order
        // Only include contigs that have alignments to this reference
        const contigsForRef = {};
        let orderIndex = 0;

        // Get all unique contigs that align to this reference
        const contigsInRef = new Set();
        parsedData.alignments
          .filter(a => a.ref === ref.name)
          .forEach(a => contigsInRef.add(a.query));

        // Assign order indices based on original query order
        parsedData.queries.forEach((query) => {
          if (contigsInRef.has(query.name)) {
            contigsForRef[query.name] = orderIndex++;
          }
        });

        initialWorkspaces[ref.name] = {
          contigOrder: contigsForRef, // Reference-specific contig order
          modifications: [],
          chromosomeGroups: {},
          uninformativeContigs: new Set(),
          selectedContigs: [],
          saved: true,
          lastModified: null,
          history: []
        };
      });

      setReferenceWorkspaces(initialWorkspaces);

      // Set default reference
      if (parsedData.references.length > 0) {
        setSelectedRef(parsedData.references[0].name);
      }

      // Reset legacy state
      setLockedChromosomes(new Set());
      
      console.log('Successfully loaded data:', parsedData);
    } catch (err) {
      console.error('Error loading files:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Apply modifications to visualization in real-time
  useEffect(() => {
    if (originalData && modifications.length > 0) {
      const updatedData = applyModificationsToVisualization(originalData, modifications, contigOrder);
      setData(updatedData);
    } else if (originalData) {
      setData(JSON.parse(JSON.stringify(originalData))); // Reset to original
    }
  }, [modifications, originalData, contigOrder]);

  // Save current workspace state to history before making changes
  const saveToHistory = () => {
    if (!selectedRef) return;

    const workspace = getWorkspace(selectedRef);
    const snapshot = {
      modifications: JSON.parse(JSON.stringify(workspace.modifications)),
      chromosomeGroups: JSON.parse(JSON.stringify(workspace.chromosomeGroups)),
      contigOrder: JSON.parse(JSON.stringify(workspace.contigOrder)),
      uninformativeContigs: new Set(workspace.uninformativeContigs),
      selectedContigs: [...workspace.selectedContigs]
    };

    updateWorkspace(selectedRef, {
      history: [...workspace.history, snapshot].slice(-50) // Keep last 50 states
    });
  };

  // Undo last action for current reference
  const handleUndo = () => {
    if (!selectedRef || history.length === 0) return;

    const previousState = history[history.length - 1];
    updateWorkspace(selectedRef, {
      modifications: previousState.modifications,
      chromosomeGroups: previousState.chromosomeGroups,
      contigOrder: previousState.contigOrder,
      uninformativeContigs: previousState.uninformativeContigs,
      selectedContigs: previousState.selectedContigs,
      history: history.slice(0, -1) // Remove this state from history
    });
  };

  // Modification handlers - now workspace-scoped
  const addModification = (modification) => {
    if (!selectedRef) return;
    saveToHistory();
    updateWorkspace(selectedRef, {
      modifications: [...modifications, { ...modification, timestamp: Date.now() }]
    });
  };

  const removeModification = (index) => {
    if (!selectedRef) return;
    saveToHistory();
    updateWorkspace(selectedRef, {
      modifications: modifications.filter((_, i) => i !== index)
    });
  };

  // Chromosome grouping for polyploids - now workspace-scoped
  const createChromosomeGroup = (groupName, contigs) => {
    if (!selectedRef) return;
    saveToHistory();

    // Create group with relative ordering preserved
    const newGroup = {
      contigs: [...contigs],
      order: contigs.map((_, i) => i), // Preserve relative order
      visible: true,
      createdOn: selectedRef
    };

    updateWorkspace(selectedRef, {
      chromosomeGroups: {
        ...chromosomeGroups,
        [groupName]: newGroup
      }
    });
  };

  const deleteChromosomeGroup = (groupName) => {
    if (!selectedRef) return;
    saveToHistory();

    const updated = { ...chromosomeGroups };
    delete updated[groupName];

    updateWorkspace(selectedRef, {
      chromosomeGroups: updated
    });
  };

  const lockChromosome = (refName) => {
    setLockedChromosomes(prev => new Set([...prev, refName]));
  };

  const unlockChromosome = (refName) => {
    setLockedChromosomes(prev => {
      const newSet = new Set(prev);
      newSet.delete(refName);
      return newSet;
    });
  };

  // Save/discard dialog state
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [pendingRefChange, setPendingRefChange] = useState(null);

  // Save the current workspace (mark as saved)
  const saveWorkspace = () => {
    if (!selectedRef) return;
    setReferenceWorkspaces(prev => ({
      ...prev,
      [selectedRef]: {
        ...prev[selectedRef],
        saved: true
      }
    }));
  };

  // Discard changes to the current workspace (reset to saved state or initial state)
  const discardWorkspace = () => {
    if (!selectedRef) return;

    // Reset to initial state for this reference (reference-specific contig order)
    const initialOrder = {};
    let orderIndex = 0;

    if (originalData) {
      // Get contigs that align to this reference
      const contigsInRef = new Set();
      originalData.alignments
        .filter(a => a.ref === selectedRef)
        .forEach(a => contigsInRef.add(a.query));

      // Assign order based on original query order
      originalData.queries.forEach((query) => {
        if (contigsInRef.has(query.name)) {
          initialOrder[query.name] = orderIndex++;
        }
      });
    }

    setReferenceWorkspaces(prev => ({
      ...prev,
      [selectedRef]: {
        contigOrder: initialOrder,
        modifications: [],
        chromosomeGroups: {},
        uninformativeContigs: new Set(),
        selectedContigs: [],
        saved: true,
        lastModified: null,
        history: []
      }
    }));
  };

  // Handle reference change with save/discard prompt
  const handleReferenceChange = (newRef) => {
    if (newRef === selectedRef) return;

    // Check if current reference has unsaved changes
    const workspace = getWorkspace(selectedRef);
    if (workspace && !workspace.saved && !lockedChromosomes.has(selectedRef)) {
      // Show save dialog
      setPendingRefChange(newRef);
      setShowSaveDialog(true);
    } else {
      // No unsaved changes, switch directly
      setSelectedRef(newRef);
    }
  };

  // Confirm reference change after save/discard decision
  const confirmReferenceChange = (action) => {
    if (action === 'save') {
      saveWorkspace();
    } else if (action === 'discard') {
      discardWorkspace();
    }

    // Switch to pending reference
    if (pendingRefChange) {
      setSelectedRef(pendingRefChange);
    }

    // Close dialog
    setShowSaveDialog(false);
    setPendingRefChange(null);
  };

  // Cancel reference change
  const cancelReferenceChange = () => {
    setShowSaveDialog(false);
    setPendingRefChange(null);
  };

  // Reset view to original state
  const resetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  // Zoom to a specific contig
  const zoomToContig = (contigName) => {
    if (!data || !selectedRef) return;

    // Find the contig's alignments to calculate its position
    const contigAlignments = data.alignments.filter(
      a => a.query === contigName && a.ref === selectedRef
    );

    if (contigAlignments.length === 0) return;

    // Calculate the bounding box of this contig's alignments
    const refPositions = contigAlignments.flatMap(a => [a.refStart, a.refEnd]);

    const minRef = Math.min(...refPositions);
    const maxRef = Math.max(...refPositions);

    // Calculate zoom level to fit this contig (with some padding)
    const refRange = maxRef - minRef;

    const refObj = data.references.find(r => r.name === selectedRef);
    if (!refObj) return;

    // Set zoom to show this region (aim for ~20% of screen)
    const targetZoom = Math.min(
      refObj.length / (refRange * 3),
      5 // Max zoom of 5x
    );

    setZoom(targetZoom);

    // Center the pan on this contig
    // This is a simplified calculation - in reality would need canvas dimensions
    setPan({ x: 0, y: 0 }); // Reset pan for now - proper centering would require canvas coordinates
  };

  // Reset all modifications for current workspace
  const resetAllModifications = () => {
    if (!selectedRef) return;

    // Reset to initial state for this reference (reference-specific contig order)
    const initialOrder = {};
    let orderIndex = 0;

    if (originalData) {
      // Get contigs that align to this reference
      const contigsInRef = new Set();
      originalData.alignments
        .filter(a => a.ref === selectedRef)
        .forEach(a => contigsInRef.add(a.query));

      // Assign order based on original query order
      originalData.queries.forEach((query) => {
        if (contigsInRef.has(query.name)) {
          initialOrder[query.name] = orderIndex++;
        }
      });
    }

    updateWorkspace(selectedRef, {
      modifications: [],
      selectedContigs: [],
      chromosomeGroups: {},
      contigOrder: initialOrder,
      uninformativeContigs: new Set(),
      history: [],
      saved: true
    });
  };

  // Update contig order mapping (pure mapping approach - no global data mutation)
  const updateContigOrder = (newOrder) => {
    if (!selectedRef) return;
    saveToHistory();
    updateWorkspace(selectedRef, {
      contigOrder: newOrder
    });
  };

  // Helper functions to update workspace state
  const setSelectedContigsForWorkspace = (contigs) => {
    if (!selectedRef) return;
    updateWorkspace(selectedRef, {
      selectedContigs: contigs
    });
  };

  const setUninformativeContigsForWorkspace = (contigs) => {
    if (!selectedRef) return;
    updateWorkspace(selectedRef, {
      uninformativeContigs: contigs
    });
  };

  const exportModifications = () => {
    // Export current workspace only (reference-specific)
    const changeFile = {
      modifications,
      selectedContigs,
      chromosomeGroups,
      contigOrder,
      uninformativeContigs: Array.from(uninformativeContigs),
      timestamp: new Date().toISOString(),
      settings: {
        viewMode,
        selectedRef
      },
      // Note: lockedChromosomes removed - locking feature deprecated
      // Chromosome groups now contain 'createdOn' field to track reference
    };

    const blob = new Blob([JSON.stringify(changeFile, null, 2)], {
      type: 'application/json'
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `genome_modifications_${selectedRef}_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const exportAllWorkspaces = () => {
    // Export ALL workspaces (all references combined) for scaffolding
    // This merges all chromosome groups from all references into one file
    const allChromosomeGroups = {};
    const allModifications = [];

    // Merge all workspaces
    Object.entries(referenceWorkspaces).forEach(([refName, workspace]) => {
      // Add all chromosome groups from this workspace
      Object.entries(workspace.chromosomeGroups || {}).forEach(([groupName, groupData]) => {
        allChromosomeGroups[groupName] = groupData;
      });

      // Add all modifications from this workspace
      if (workspace.modifications && workspace.modifications.length > 0) {
        allModifications.push(...workspace.modifications);
      }
    });

    const combinedFile = {
      modifications: allModifications,
      chromosomeGroups: allChromosomeGroups,
      timestamp: new Date().toISOString(),
      note: "Combined export from all reference workspaces - ready for genome_scaffolder.py"
    };

    const blob = new Blob([JSON.stringify(combinedFile, null, 2)], {
      type: 'application/json'
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `genome_scaffolding_all_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    console.log(`Exported ${Object.keys(allChromosomeGroups).length} chromosome groups from ${Object.keys(referenceWorkspaces).length} references`);
  };

  const exportScaffoldingPlan = () => {
    if (!data) return;

    // Build scaffolding plan
    const scaffoldingPlan = [];
    const processedContigs = new Set();

    // 1. Add all contigs that are in chromosome groups (in their custom order)
    Object.entries(chromosomeGroups).forEach(([groupName, contigNames]) => {
      // Sort contigs in this group by their custom order
      const orderedContigs = [...contigNames].sort((a, b) => {
        const orderA = contigOrder[a] !== undefined ? contigOrder[a] : 999999;
        const orderB = contigOrder[b] !== undefined ? contigOrder[b] : 999999;
        return orderA - orderB;
      });

      orderedContigs.forEach(contigName => {
        const contig = data.queries.find(q => q.name === contigName);
        if (contig) {
          // Check if this contig needs to be flipped based on modifications
          const flipMod = modifications.find(m => m.type === 'invert' && m.contigName === contigName);
          const orientation = flipMod ? '-' : '+';

          scaffoldingPlan.push({
            scaffold_name: groupName,
            contig_name: contigName,
            contig_length: contig.length,
            orientation: orientation,
            group: groupName
          });
          processedContigs.add(contigName);
        }
      });
    });

    // 2. Add unincorporated contigs (not in groups), sorted by length
    // Note: Uninformative contigs are included here - they're just hidden from UI, not excluded from export
    const unincorporatedContigs = data.queries
      .filter(q => !processedContigs.has(q.name))
      .sort((a, b) => b.length - a.length); // Sort by length descending

    unincorporatedContigs.forEach((contig, index) => {
      const scaffoldName = `unincorporated_scaffold_${index + 1}`;
      const flipMod = modifications.find(m => m.type === 'invert' && m.contigName === contig.name);
      const orientation = flipMod ? '-' : '+';

      scaffoldingPlan.push({
        scaffold_name: scaffoldName,
        contig_name: contig.name,
        contig_length: contig.length,
        orientation: orientation,
        group: 'unincorporated'
      });
      processedContigs.add(contig.name);
    });

    // Export as TSV (tab-separated values)
    const tsvContent = [
      'scaffold_name\tcontig_name\tcontig_length\torientation\tgroup',
      ...scaffoldingPlan.map(row =>
        `${row.scaffold_name}\t${row.contig_name}\t${row.contig_length}\t${row.orientation}\t${row.group}`
      )
    ].join('\n');

    const blob = new Blob([tsvContent], { type: 'text/tab-separated-values' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `scaffolding_plan_${new Date().toISOString().split('T')[0]}.tsv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    // Also show summary
    const uninformativeCount = Array.from(uninformativeContigs).filter(name =>
      unincorporatedContigs.some(c => c.name === name)
    ).length;

    console.log(`Scaffolding plan exported:
      - ${Object.keys(chromosomeGroups).length} chromosome groups
      - ${unincorporatedContigs.length} unincorporated scaffolds (includes ${uninformativeCount} marked as uninformative)
      - ${processedContigs.size} total contigs in output`);
  };

  return (
    <div className="h-screen bg-gray-100 flex flex-col">
      {/* Header */}
      <header className="bg-white shadow-sm border-b p-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Interactive Genome Scaffolding
            </h1>
            <p className="text-sm text-gray-600 mt-1">
              Reference-based genome scaffolding with interactive dot plot visualization
            </p>
          </div>
          
          {data && (
            <div className="text-right text-sm text-gray-600">
              <div>{data.references.length} references</div>
              <div>{data.queries.length} queries</div>
              <div>{data.alignments.length} alignments</div>
              {modifications.length > 0 && (
                <div className="text-orange-600 font-medium">
                  {modifications.length} modifications
                </div>
              )}
            </div>
          )}
        </div>
      </header>

      {/* Error display */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4 m-4">
          <div className="flex">
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">Error</h3>
              <div className="mt-2 text-sm text-red-700">{error}</div>
            </div>
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex">
        {/* Visualization area */}
        <div className="flex-1 p-4">
          <div className="bg-white rounded-lg shadow-lg h-full flex flex-col">
            {/* Toolbar */}
            <Toolbar
              onFileUpload={handleFileUpload}
              viewMode={viewMode}
              onViewModeChange={setViewMode}
              explorationMode={explorationMode}
              onExplorationModeChange={setExplorationMode}
              zoom={zoom}
              onZoomIn={() => setZoom(prev => Math.min(prev * 1.2, 10))}
              onZoomOut={() => setZoom(prev => Math.max(prev / 1.2, 0.1))}
              onResetView={resetView}
              onResetAll={resetAllModifications}
              onUndo={handleUndo}
              canUndo={history.length > 0}
              onExportModifications={exportModifications}
              onExportAllWorkspaces={exportAllWorkspaces}
              onExportScaffoldingPlan={exportScaffoldingPlan}
              loading={loading}
              hasData={!!data}
              hasModifications={modifications.length > 0}
            />

            {/* Dot Plot */}
            <div className="flex-1 relative">
              <DotPlot
                data={data}
                settings={settings}
                viewMode={viewMode}
                selectedRef={selectedRef}
                selectedContigs={selectedContigs}
                explorationMode={explorationMode}
                zoom={zoom}
                onZoomChange={setZoom}
                pan={pan}
                onPanChange={setPan}
                loading={loading}
                modifications={modifications}
                contigOrder={contigOrder}
                onContigOrderChange={updateContigOrder}
                referenceFlipped={referenceFlipped}
                uninformativeContigs={uninformativeContigs}
                chromosomeGroups={chromosomeGroups}
              />
            </div>
          </div>
        </div>
        
        {/* Control Panel */}
        <div className="w-[480px]">
          <ControlPanel
            data={data}
            selectedRef={selectedRef}
            onSelectedRefChange={handleReferenceChange}
            settings={settings}
            onSettingsChange={setSettings}
            explorationMode={explorationMode}
            selectedContigs={selectedContigs}
            onSelectedContigsChange={setSelectedContigsForWorkspace}
            lockedChromosomes={lockedChromosomes}
            onLockChromosome={lockChromosome}
            onUnlockChromosome={unlockChromosome}
            modifications={modifications}
            onAddModification={addModification}
            onRemoveModification={removeModification}
            chromosomeGroups={chromosomeGroups}
            onCreateChromosomeGroup={createChromosomeGroup}
            onDeleteChromosomeGroup={deleteChromosomeGroup}
            contigOrder={contigOrder}
            onContigOrderChange={updateContigOrder}
            referenceFlipped={referenceFlipped}
            onReferenceFlippedChange={setReferenceFlipped}
            uninformativeContigs={uninformativeContigs}
            onUninformativeContigsChange={setUninformativeContigsForWorkspace}
            onZoomToContig={zoomToContig}
          />
        </div>
      </div>

      {/* Save/Discard Dialog */}
      <SaveDialog
        isOpen={showSaveDialog}
        currentRef={selectedRef}
        targetRef={pendingRefChange}
        onSave={() => confirmReferenceChange('save')}
        onDiscard={() => confirmReferenceChange('discard')}
        onCancel={cancelReferenceChange}
      />
    </div>
  );
}

export default App;