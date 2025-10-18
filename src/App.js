// src/App.js - Enhanced version with reference-scoped workspaces
import React, { useState, useEffect, useMemo } from 'react';
import DotPlot from './components/DotPlot';
import ControlPanel from './components/ControlPanel';
import Toolbar from './components/Toolbar';
import SaveDialog from './components/SaveDialog';
import N50Modal from './components/N50Modal';
import { parseCoordinateFiles } from './utils/fileParser';
import { applyModificationsToVisualization } from './utils/visualizationUpdater';
import { calculateN50 } from './utils/n50Calculator';
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
    minContigSize: 30000, // Minimum contig size to display (30,000 bp default)
    lineThickness: 3, // Default 3x (range 1-10)
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
    if (files.length < 2 || files.length > 3) {
      setError('Please select .coords and .coords.idx files (and optionally a session .json file)');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const fileArray = Array.from(files);
      const coordsFile = fileArray.find(f => f.name.endsWith('.coords') && !f.name.endsWith('.coords.idx'));
      const idxFile = fileArray.find(f => f.name.endsWith('.coords.idx'));
      const sessionFile = fileArray.find(f => f.name.endsWith('.json'));

      if (!coordsFile || !idxFile) {
        throw new Error('Please select both .coords and .coords.idx files');
      }

      console.log('Loading files:', coordsFile.name, idxFile.name);
      if (sessionFile) {
        console.log('Session file detected:', sessionFile.name);
      }

      const coordsText = await coordsFile.text();
      const idxText = await idxFile.text();

      const parsedData = parseCoordinateFiles(coordsText, idxText);

      // Calculate N50 from query contigs
      const n50Statistics = calculateN50(parsedData.queries);
      console.log('N50 Statistics:', n50Statistics);

      // Store pending data and show N50 modal (only if no session file)
      if (!sessionFile) {
        setPendingDataLoad({
          parsedData,
          sessionFile: null
        });
        setN50Stats(n50Statistics);
        setShowN50Modal(true);
        setLoading(false);
        return; // Wait for user to proceed
      }

      // If session file provided, skip N50 modal and proceed directly
      await finishDataLoad(parsedData, sessionFile);
    } catch (err) {
      console.error('Error loading files:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Separate function to finish loading data after N50 modal
  const finishDataLoad = async (parsedData, sessionFile) => {
    try {
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

      // If session file provided, restore session state
      if (sessionFile) {
        try {
          const sessionText = await sessionFile.text();
          const sessionData = JSON.parse(sessionText);

          console.log('Restoring session from:', sessionFile.name);

          // Validate session format
          if (!sessionData.workspaces) {
            console.warn('Session file missing workspaces data. Loading default state.');
            setReferenceWorkspaces(initialWorkspaces);
          } else {
            // Restore workspaces with proper Set conversion for uninformativeContigs
            const restoredWorkspaces = {};
            Object.entries(sessionData.workspaces).forEach(([refName, workspace]) => {
              restoredWorkspaces[refName] = {
                ...workspace,
                uninformativeContigs: new Set(workspace.uninformativeContigs || []),
                selectedContigs: workspace.selectedContigs || [],
                saved: true,
                lastModified: workspace.lastModified || null,
                history: workspace.history || []
              };
            });
            setReferenceWorkspaces(restoredWorkspaces);
            console.log('Restored workspaces for', Object.keys(restoredWorkspaces).length, 'references');
          }

          // Restore visualization settings if available
          if (sessionData.visualizationSettings) {
            const vizSettings = sessionData.visualizationSettings;

            if (vizSettings.settings) {
              setSettings(vizSettings.settings);
            }
            if (vizSettings.viewMode) {
              setViewMode(vizSettings.viewMode);
            }
            if (vizSettings.selectedRef && parsedData.references.find(r => r.name === vizSettings.selectedRef)) {
              setSelectedRef(vizSettings.selectedRef);
            } else if (parsedData.references.length > 0) {
              setSelectedRef(parsedData.references[0].name);
            }
            if (vizSettings.referenceFlipped !== undefined) {
              setReferenceFlipped(vizSettings.referenceFlipped);
            }
            if (vizSettings.zoom !== undefined) {
              setZoom(vizSettings.zoom);
            }
            if (vizSettings.pan) {
              setPan(vizSettings.pan);
            }

            console.log('Restored visualization settings');
          } else {
            // No viz settings, just set default reference
            if (parsedData.references.length > 0) {
              setSelectedRef(parsedData.references[0].name);
            }
          }
        } catch (sessionErr) {
          console.error('Error loading session file:', sessionErr);
          console.warn('Using default workspace state instead');
          setReferenceWorkspaces(initialWorkspaces);
          if (parsedData.references.length > 0) {
            setSelectedRef(parsedData.references[0].name);
          }
        }
      } else {
        // No session file, use default initialization
        setReferenceWorkspaces(initialWorkspaces);
        if (parsedData.references.length > 0) {
          setSelectedRef(parsedData.references[0].name);
        }
      }

      // Reset legacy state
      setLockedChromosomes(new Set());

      console.log('Successfully loaded data:', parsedData);
    } catch (err) {
      console.error('Error loading session:', err);
      setError(err.message);
    }
  };

  // Handle N50 modal proceed
  const handleN50Proceed = async () => {
    setShowN50Modal(false);
    if (pendingDataLoad) {
      await finishDataLoad(pendingDataLoad.parsedData, pendingDataLoad.sessionFile);
      setPendingDataLoad(null);
    }
  };

  // Handle N50 modal cancel
  const handleN50Cancel = () => {
    setShowN50Modal(false);
    setPendingDataLoad(null);
    setN50Stats(null);
    setLoading(false);
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

  // N50 modal state
  const [showN50Modal, setShowN50Modal] = useState(false);
  const [n50Stats, setN50Stats] = useState(null);
  const [pendingDataLoad, setPendingDataLoad] = useState(null);

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

  // Reset to load page
  const resetToLoadPage = () => {
    const confirmReset = window.confirm(
      'This will clear all data and return to the load page. Any unsaved work will be lost. Are you sure?'
    );
    if (confirmReset) {
      setData(null);
      setOriginalData(null);
      setSelectedRef('');
      setReferenceWorkspaces({});
      setLockedChromosomes(new Set());
      setZoom(1);
      setPan({ x: 0, y: 0 });
      setError(null);
    }
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

  const exportSession = () => {
    // Export complete session including all workspaces and visualization settings
    const sessionFile = {
      version: "1.0",
      timestamp: new Date().toISOString(),
      note: "YARBS session export - contains all workspaces and settings. Use this file to reload your work later.",

      // All workspace data (per-reference state)
      workspaces: referenceWorkspaces,

      // Visualization settings to restore the view
      visualizationSettings: {
        viewMode,
        selectedRef,
        referenceFlipped,
        zoom,
        pan,
        settings: {
          showRepetitive: settings.showRepetitive,
          showAllAlignments: settings.showAllAlignments,
          minAlignmentLength: settings.minAlignmentLength,
          minUniqueRatio: settings.minUniqueRatio,
          minContigSize: settings.minContigSize,
          lineThickness: settings.lineThickness,
          labelFontSize: settings.labelFontSize,
          colors: settings.colors
        }
      }
    };

    const blob = new Blob([JSON.stringify(sessionFile, null, 2)], {
      type: 'application/json'
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `yarbs_session_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    console.log(`Exported session with ${Object.keys(referenceWorkspaces).length} reference workspaces`);
  };

  const exportForScaffolding = () => {
    // Export in the format expected by genome_scaffolder.py
    // This merges all chromosome groups and modifications from all references
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

    const timestamp = new Date().toISOString().split('T')[0];

    // 1. Export JSON file for scaffolding
    const scaffoldingFile = {
      modifications: allModifications,
      chromosomeGroups: allChromosomeGroups,
      timestamp: new Date().toISOString(),
      note: "Export for genome_scaffolder.py - contains chromosome groups and modifications for final scaffolding"
    };

    const jsonBlob = new Blob([JSON.stringify(scaffoldingFile, null, 2)], {
      type: 'application/json'
    });
    const jsonUrl = URL.createObjectURL(jsonBlob);
    const jsonLink = document.createElement('a');
    jsonLink.href = jsonUrl;
    jsonLink.download = `scaffolding_${timestamp}.json`;
    document.body.appendChild(jsonLink);
    jsonLink.click();
    document.body.removeChild(jsonLink);
    URL.revokeObjectURL(jsonUrl);

    console.log(`Exported ${Object.keys(allChromosomeGroups).length} chromosome groups from ${Object.keys(referenceWorkspaces).length} references for scaffolding`);

    // 2. Also export CSV file for supplementary tables
    exportChangesCSV();
  };

  const exportChangesCSV = () => {
    // Export a CSV file tracking all changes made during scaffolding
    // Perfect for supplementary tables in publications

    const allChanges = [];

    // Collect all modifications from all workspaces
    Object.entries(referenceWorkspaces).forEach(([refName, workspace]) => {
      if (workspace.modifications && workspace.modifications.length > 0) {
        workspace.modifications.forEach((mod, index) => {
          // Get contig info if available
          const contigInfo = originalData?.queries.find(q => q.name === mod.query);

          allChanges.push({
            changeNumber: allChanges.length + 1,
            reference: refName,
            modificationType: mod.type,
            contigName: mod.query,
            contigLength: contigInfo ? contigInfo.length : 'N/A',
            position: mod.position || 'N/A',
            timestamp: mod.timestamp ? new Date(mod.timestamp).toISOString() : 'N/A',
            notes: mod.notes || ''
          });
        });
      }

      // Also track chromosome group assignments
      Object.entries(workspace.chromosomeGroups || {}).forEach(([groupName, groupData]) => {
        groupData.contigs.forEach(contigName => {
          const contigInfo = originalData?.queries.find(q => q.name === contigName);

          allChanges.push({
            changeNumber: allChanges.length + 1,
            reference: refName,
            modificationType: 'group_assignment',
            contigName: contigName,
            contigLength: contigInfo ? contigInfo.length : 'N/A',
            position: 'N/A',
            timestamp: groupData.lastModified ? new Date(groupData.lastModified).toISOString() : 'N/A',
            notes: `Assigned to chromosome group: ${groupName}`
          });
        });
      });
    });

    if (allChanges.length === 0) {
      alert('No changes to export. Make some modifications first!');
      return;
    }

    // Sort by change number
    allChanges.sort((a, b) => a.changeNumber - b.changeNumber);

    // Generate CSV content
    const headers = ['Change #', 'Reference', 'Modification Type', 'Contig Name', 'Contig Length (bp)', 'Position', 'Timestamp', 'Notes'];
    const csvRows = [headers.join(',')];

    allChanges.forEach(change => {
      const row = [
        change.changeNumber,
        change.reference,
        change.modificationType,
        change.contigName,
        change.contigLength,
        change.position,
        change.timestamp,
        `"${change.notes}"` // Quote notes field in case it contains commas
      ];
      csvRows.push(row.join(','));
    });

    // Add metadata footer
    csvRows.push('');
    csvRows.push(`"Generated by YARBS on ${new Date().toISOString()}"`);
    csvRows.push(`"Total changes: ${allChanges.length}"`);
    csvRows.push(`"References processed: ${Object.keys(referenceWorkspaces).length}"`);

    const csvContent = csvRows.join('\n');

    // Download the CSV
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `scaffolding_changes_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    console.log(`Exported ${allChanges.length} changes to CSV for supplementary tables`);
  };


  return (
    <div className="h-screen bg-gray-100 flex flex-col">
      {/* Header */}
      <header className="bg-white shadow-sm border-b p-4">
        <div className="flex items-center justify-between">
          <div
            className={`flex items-center gap-2 ${data ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''}`}
            onClick={data ? resetToLoadPage : undefined}
            title={data ? 'Click to return to load page' : ''}
          >
            <img src="/YARBS.svg" alt="YARBS" className="h-16 w-16" />
            <h1 className="text-4xl font-bold text-gray-900">
              YARBS — yet another reference based scaffolding tool
            </h1>
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
              onExportSession={exportSession}
              onExportForScaffolding={exportForScaffolding}
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

      {/* N50 Modal */}
      <N50Modal
        isOpen={showN50Modal}
        n50Stats={n50Stats}
        onProceed={handleN50Proceed}
        onCancel={handleN50Cancel}
      />
    </div>
  );
}

export default App;