// src/components/ControlPanel.jsx - Enhanced with chromosome grouping for polyploids
import React, { useMemo, useState, useCallback, useEffect, useTransition } from 'react';
import {
  Settings,
  RotateCcw,
  Scissors,
  Info,
  Activity,
  Database,
  Users,
  Plus,
  Trash2,
  Check,
  X,
  ChevronUp,
  ChevronDown,
  HelpCircle,
  Loader2
} from 'lucide-react';

const ControlPanel = ({
  data,
  selectedRef,
  onSelectedRefChange,
  settings,
  onSettingsChange,
  explorationMode,
  selectedContigs,
  onSelectedContigsChange,
  lockedChromosomes,
  onLockChromosome,
  onUnlockChromosome,
  modifications,
  onAddModification,
  onAddModifications,
  onRemoveModification,
  chromosomeGroups,
  onCreateChromosomeGroup,
  onDeleteChromosomeGroup,
  contigOrder,
  onContigOrderChange,
  referenceFlipped,
  onReferenceFlippedChange,
  uninformativeContigs,
  onUninformativeContigsChange,
  onZoomToContig,
  allowedContigsSet,
  contigAlignmentsMap,
  capMetadata
}) => {
  const [showGroupCreation, setShowGroupCreation] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [expandedGroups, setExpandedGroups] = useState(new Set());
  const [showStatistics, setShowStatistics] = useState(true);

  // Track pending state for chromosome flip operations
  const [isPending, startTransition] = useTransition();
  const [showVisualizationSettings, setShowVisualizationSettings] = useState(true);
  const [showModifications, setShowModifications] = useState(true);

  // Auto-collapse statistics and visualization when entering scaffolding mode
  useEffect(() => {
    if (!explorationMode) {
      setShowStatistics(false);
      setShowVisualizationSettings(false);
    }
  }, [explorationMode]);

  // OPTIMIZED: Build metadata for pre-filtered contigs from App.js
  // The heavy lifting (cap, filters) is done in App.js - we just add display metadata here
  const getContigsForReference = useCallback((data, refName) => {
    if (!data || !refName || !contigAlignmentsMap || !capMetadata) {
      return { contigs: [] };
    }

    // Build metadata for allowed contigs (already filtered in App.js)
    const contigMap = new Map();

    // Process only the contigs in the alignments map (already capped/filtered)
    contigAlignmentsMap.forEach((alignments, contigName) => {
      if (!allowedContigsSet.has(contigName)) return;

      const contigInfo = data.queries.find(q => q.name === contigName);
      if (!contigInfo) return;

      // Calculate metadata from alignments
      let maxIdentity = 0;
      let totalLength = 0;
      let totalIdentity = 0;
      let flipCount = 0;

      alignments.forEach(a => {
        maxIdentity = Math.max(maxIdentity, a.identity);
        totalLength += a.length;
        totalIdentity += a.identity;
        if (a.needsFlip === true) flipCount++;
      });

      // Check if this contig is currently inverted (flipped from original orientation)
      const isInverted = modifications.some(m => m.type === 'invert' && m.query === contigName);

      contigMap.set(contigName, {
        name: contigName,
        identity: maxIdentity,
        length: alignments.length > 0 ? alignments[0].length : 0,
        contigLength: contigInfo.length,
        alignmentCount: alignments.length,
        flipSuggestionCount: flipCount,
        totalLength,
        averageIdentity: alignments.length > 0 ? totalIdentity / alignments.length : 0,
        isModified: modifications.some(m => m.query === contigName),
        isInverted: isInverted,
        group: Object.keys(chromosomeGroups).find(group =>
          chromosomeGroups[group].contigs.includes(contigName)
        )
      });
    });

    // Sort by custom order if available, otherwise by identity
    const sortedContigs = Array.from(contigMap.values()).sort((a, b) => {
      const orderA = contigOrder[a.name] !== undefined ? contigOrder[a.name] : 999999;
      const orderB = contigOrder[b.name] !== undefined ? contigOrder[b.name] : 999999;

      // If both have custom order, use that
      if (orderA !== 999999 || orderB !== 999999) {
        return orderA - orderB;
      }

      // Otherwise fall back to identity sorting
      return b.identity - a.identity;
    });

    return { contigs: sortedContigs };
  }, [modifications, chromosomeGroups, contigOrder, contigAlignmentsMap, allowedContigsSet, capMetadata]);

  // Calculate statistics - now after function definition
  const statistics = useMemo(() => {
    if (!data || !capMetadata) return null;

    const uniqueAlignments = data.alignments.filter(a => a.tag === 'unique').length;
    const uniqueShortAlignments = data.alignments.filter(a => a.tag === 'unique_short').length;
    const repetitiveAlignments = data.alignments.filter(a => a.tag === 'repetitive').length;
    const selectedRefData = data.references.find(r => r.name === selectedRef);
    const contigResult = getContigsForReference(data, selectedRef);
    const modifiedQueries = new Set(modifications.map(m => m.query)).size;

    // Calculate filtered out contigs (those hidden by filters, not by cap)
    const filteredOutContigs = capMetadata.cappedCount - contigResult.contigs.length;

    return {
      totalReferences: data.references.length,
      totalQueries: data.queries.length,
      totalAlignments: data.alignments.length,
      uniqueAlignments,
      uniqueShortAlignments,
      repetitiveAlignments,
      selectedRefLength: selectedRefData?.length || 0,
      contigsForSelectedRef: contigResult.contigs.length,
      totalContigsForRef: capMetadata.totalContigs,
      cappedCount: capMetadata.cappedCount,
      capApplied: capMetadata.capApplied,
      filteredOutContigs,
      modifiedQueries,
      chromosomeGroups: Object.keys(chromosomeGroups).length
    };
  }, [data, selectedRef, modifications, chromosomeGroups, getContigsForReference, capMetadata]);

  // Handle moving contig up or down in the list
  const handleMoveContig = (contigName, direction) => {
    const currentContigs = contigsForSelectedRef.map(c => c.name);
    const currentIndex = currentContigs.indexOf(contigName);

    if (currentIndex === -1) return;

    // Calculate new index
    const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;

    // Check bounds
    if (newIndex < 0 || newIndex >= currentContigs.length) return;

    // Reorder
    const reordered = [...currentContigs];
    reordered.splice(currentIndex, 1);
    reordered.splice(newIndex, 0, contigName);

    // Update contigOrder with new indices
    // Since contigOrder is now reference-specific, we create a fresh mapping
    // for just the contigs in the current reference
    const updatedOrder = {};
    reordered.forEach((name, idx) => {
      updatedOrder[name] = idx;
    });

    // Update the workspace's contigOrder for this reference
    if (onContigOrderChange) {
      onContigOrderChange(updatedOrder);
    }
  };

  // Handle contig selection with multi-select support
  const handleContigSelection = (contigName, isShiftSelect = false) => {
    if (isShiftSelect && selectedContigs.length > 0) {
      // Range selection
      const contigsForRef = getContigsForReference(data, selectedRef);
      const lastSelectedIndex = contigsForRef.findIndex(c => c.name === selectedContigs[selectedContigs.length - 1]);
      const currentIndex = contigsForRef.findIndex(c => c.name === contigName);

      if (lastSelectedIndex !== -1 && currentIndex !== -1) {
        const start = Math.min(lastSelectedIndex, currentIndex);
        const end = Math.max(lastSelectedIndex, currentIndex);
        const rangeContigs = contigsForRef.slice(start, end + 1).map(c => c.name);

        const newSelection = [...new Set([...selectedContigs, ...rangeContigs])];
        onSelectedContigsChange(newSelection);
        return;
      }
    }

    // Normal selection
    if (selectedContigs.includes(contigName)) {
      onSelectedContigsChange(selectedContigs.filter(name => name !== contigName));
    } else {
      onSelectedContigsChange([...selectedContigs, contigName]);
    }
  };

  // Handle modifications with validation
  const handleInvertContig = () => {
    if (selectedContigs.length === 0) return;

    // OPTIMIZED: Batch all modifications into a single state update to avoid multiple re-renders
    const newModifications = [];
    const indicesToRemove = [];

    selectedContigs.forEach(contigName => {
      // Check if already inverted
      const existingInversion = modifications.find(m => m.type === 'invert' && m.query === contigName);
      if (existingInversion) {
        // Mark for removal (toggle)
        const index = modifications.indexOf(existingInversion);
        indicesToRemove.push(index);
      } else {
        // Add new inversion
        newModifications.push({
          type: 'invert',
          query: contigName
        });
      }
    });

    // Wrap state updates in transition to show loading indicator
    startTransition(() => {
      // Remove existing inversions first (if any)
      if (indicesToRemove.length > 0) {
        // Remove from highest index to lowest to avoid index shifting
        indicesToRemove.sort((a, b) => b - a).forEach(index => {
          onRemoveModification(index);
        });
      }

      // Add new modifications in a single batch
      if (newModifications.length > 0 && onAddModifications) {
        onAddModifications(newModifications);
      }
    });
  };


  const handleCreateGroup = () => {
    if (!newGroupName.trim() || selectedContigs.length === 0) return;

    // Validate group name
    if (chromosomeGroups[newGroupName]) {
      alert('Group name already exists');
      return;
    }

    // Preserve the order of contigs as they appear in the list, not selection order
    const orderedContigs = contigsForSelectedRef
      .filter(contig => selectedContigs.includes(contig.name))
      .map(contig => contig.name);

    onCreateChromosomeGroup(newGroupName.trim(), orderedContigs);
    setNewGroupName('');
    setShowGroupCreation(false);
    onSelectedContigsChange([]); // Clear selection
  };

    const handleAddToExistingGroup = (groupName) => {
    if (selectedContigs.length === 0) return;

    const existingGroup = chromosomeGroups[groupName];
    // Preserve the order of contigs as they appear in the list, not selection order
    const orderedSelectedContigs = contigsForSelectedRef
      .filter(contig => selectedContigs.includes(contig.name))
      .map(contig => contig.name);
    const newContigs = [...new Set([...existingGroup.contigs, ...orderedSelectedContigs])];

    onCreateChromosomeGroup(groupName, newContigs);
    onSelectedContigsChange([]); // Clear selection
  };

  // Get contigs result (includes capping metadata)
  const contigResult = data ? getContigsForReference(data, selectedRef) : { contigs: [], totalContigsForRef: 0, cappedCount: 0, capApplied: false };
  const contigsForSelectedRef = contigResult.contigs;

  if (!data) {
    return (
      <div className="w-full p-4 bg-white shadow-lg">
        <div className="text-center text-gray-500">
          <Database size={48} className="mx-auto mb-3 opacity-50" />
          <p>Load coordinate files to access controls</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 bg-white shadow-lg overflow-y-auto h-full control-panel">
      <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
        <Settings size={20} />
        Control Panel
      </h3>

      {/* Statistics Section - Collapsible */}
      <div className="mb-6">
        <button
          onClick={() => setShowStatistics(!showStatistics)}
          className="w-full flex items-center justify-between p-2 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-md transition-colors mb-2"
        >
          <div className="flex items-center gap-2">
            <Info size={16} className="text-gray-700" />
            <h4 className="font-semibold text-gray-700">Statistics</h4>
          </div>
          {showStatistics ? <ChevronUp size={16} className="text-gray-600" /> : <ChevronDown size={16} className="text-gray-600" />}
        </button>
        {showStatistics && (
          <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>References: <strong>{statistics.totalReferences}</strong></div>
              <div>Queries: <strong>{statistics.totalQueries}</strong></div>
              <div>Total alignments: <strong>{statistics.totalAlignments}</strong></div>
              <div>Unique: <strong className="text-green-600">{statistics.uniqueAlignments}</strong></div>
              <div>Unique short: <strong className="text-cyan-600">{statistics.uniqueShortAlignments}</strong></div>
              <div>Repetitive: <strong className="text-orange-600">{statistics.repetitiveAlignments}</strong></div>
              <div>Modified queries: <strong className="text-purple-600">{statistics.modifiedQueries}</strong></div>
              <div>Modifications: <strong className="text-purple-600">{modifications.length}</strong></div>
              <div>Chr groups: <strong className="text-blue-600">{statistics.chromosomeGroups}</strong></div>
              <div colSpan="2">
                Selected ref contigs: <strong>{statistics.contigsForSelectedRef}</strong>
                {statistics.capApplied && (
                  <span className="text-xs text-gray-500"> (of {statistics.cappedCount} capped, {statistics.totalContigsForRef} total)</span>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Reference Selection */}
      <div className="mb-6">
        <label className="block text-sm font-semibold text-gray-700 mb-2">
          Reference Chromosome
        </label>
        <select
          value={selectedRef}
          onChange={(e) => onSelectedRefChange(e.target.value)}
          className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        >
          {data.references.map(ref => (
            <option key={ref.name} value={ref.name}>
              {ref.name} ({(ref.length / 1000000).toFixed(1)}Mb)
            </option>
          ))}
        </select>
        {lockedChromosomes.has(selectedRef) && (
          <div className="mt-1 flex items-center gap-2 text-xs">
            <div className="text-red-600 flex items-center gap-1">
              <Info size={12} />
              Locked
              <button
                onClick={() => onUnlockChromosome(selectedRef)}
                className="text-blue-600 hover:underline ml-1"
              >
                (unlock)
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Visualization Settings - Collapsible in scaffolding mode */}
      <div className="mb-6">
        {!explorationMode ? (
          <>
            <button
              onClick={() => setShowVisualizationSettings(!showVisualizationSettings)}
              className="w-full flex items-center justify-between p-2 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-md transition-colors mb-2"
            >
              <div className="flex items-center gap-2">
                <Activity size={16} className="text-gray-700" />
                <h4 className="font-semibold text-gray-700">Visualization Settings</h4>
              </div>
              {showVisualizationSettings ? <ChevronUp size={16} className="text-gray-600" /> : <ChevronDown size={16} className="text-gray-600" />}
            </button>
            {showVisualizationSettings && (
              <div className="space-y-3">
                {/* Show repetitive */}
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={settings.showRepetitive}
                    onChange={(e) => onSettingsChange({
                      ...settings,
                      showRepetitive: e.target.checked
                    })}
                    className="rounded border-gray-300 text-blue-500 focus:ring-blue-500"
                  />
                  <span className="text-sm">Show repetitive alignments</span>
                </label>

                {/* Show all alignments (including filtered ones) */}
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={settings.showAllAlignments}
                    onChange={(e) => onSettingsChange({
                      ...settings,
                      showAllAlignments: e.target.checked
                    })}
                    className="rounded border-gray-300 text-blue-500 focus:ring-blue-500"
                  />
                  <span className="text-sm">Show all unique alignments</span>
                </label>
                <p className="text-xs text-gray-500 ml-6 -mt-2">
                  Include alignments filtered by unique_length threshold
                </p>

                {/* Contig Filtering Controls */}
                <div className="border-t pt-3 mt-3 space-y-3">
                  <div className="flex justify-between items-center">
                    <label className="block text-sm font-medium text-gray-700">
                      Contig Filters
                    </label>
                    {statistics && statistics.filteredOutContigs > 0 && (
                      <span className="text-xs text-orange-600 font-medium">
                        {statistics.filteredOutContigs} contigs hidden
                      </span>
                    )}
                  </div>

                  {/* Performance Warning - Cap Applied */}
                  {statistics && statistics.capApplied && (
                    <div className="bg-red-50 border border-red-300 rounded p-2">
                      <p className="text-xs text-red-700">
                        ⚠️ Showing largest {statistics.cappedCount} of {statistics.totalContigsForRef} contigs for loading performance.
                      </p>
                    </div>
                  )}

                  {/* Unique Alignment Ratio Filter */}
                  <div className="bg-blue-50 p-2 rounded">
                    <div className="flex justify-between items-center mb-1">
                      <label className="text-xs font-medium text-gray-700 flex items-center gap-1">
                        Unique Alignment Ratio
                        <HelpCircle
                          size={12}
                          className="text-gray-400 cursor-help"
                          title="Show contigs based on % of contig length that has unique alignment to the selected reference"
                        />
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="1"
                          value={(settings.minUniqueRatio * 100).toFixed(0)}
                          onChange={(e) => {
                            const value = Math.max(0, Math.min(100, parseFloat(e.target.value) || 0));
                            onSettingsChange({
                              ...settings,
                              minUniqueRatio: value / 100
                            });
                          }}
                          className="w-14 px-1 py-0.5 border border-blue-300 rounded text-xs text-blue-700 font-mono text-right"
                        />
                        <span className="text-xs text-blue-700">%</span>
                      </div>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="0.2"
                      step="0.01"
                      value={Math.min(settings.minUniqueRatio, 0.2)}
                      onChange={(e) => onSettingsChange({
                        ...settings,
                        minUniqueRatio: parseFloat(e.target.value)
                      })}
                      className="w-full"
                    />
                    <div className="flex justify-between text-xs text-gray-500 mt-0.5">
                      <span>0%</span>
                      <span>20%</span>
                    </div>
                    <p className="text-xs text-gray-600 mt-1">
                      Show contigs where ≥{(settings.minUniqueRatio * 100).toFixed(0)}% of contig length uniquely aligns to {selectedRef}
                    </p>
                  </div>

                  {/* Alignment Length Filter */}
                  <div>
                    <label className="flex items-center gap-1 text-xs font-medium text-gray-700 mb-1">
                      Min Total Alignment Length
                      <HelpCircle
                        size={12}
                        className="text-gray-400 cursor-help"
                        title="Hides individual alignment lines shorter than this length (doesn't affect contig list)"
                      />
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="range"
                        min="0"
                        max="100000"
                        step="1000"
                        value={settings.minAlignmentLength}
                        onChange={(e) => onSettingsChange({
                          ...settings,
                          minAlignmentLength: parseInt(e.target.value)
                        })}
                        className="flex-1"
                      />
                      <input
                        type="number"
                        value={settings.minAlignmentLength}
                        onChange={(e) => onSettingsChange({
                          ...settings,
                          minAlignmentLength: parseInt(e.target.value) || 0
                        })}
                        className="w-20 px-2 py-1 border border-gray-300 rounded text-xs"
                        min="0"
                      />
                      <span className="text-xs text-gray-500">bp</span>
                    </div>
                  </div>

                  {/* Minimum Contig Size Filter */}
                  <div className="bg-orange-50 p-2 rounded">
                    <label className="flex items-center gap-1 text-xs font-medium text-gray-700 mb-1">
                      Minimum Contig Size
                      <HelpCircle
                        size={12}
                        className="text-gray-400 cursor-help"
                        title="Hide contigs smaller than specified size"
                      />
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        value={settings.minContigSize || ''}
                        onChange={(e) => {
                          const value = e.target.value === '' ? 0 : parseInt(e.target.value);
                          onSettingsChange({
                            ...settings,
                            minContigSize: value >= 0 ? value : 0
                          });
                        }}
                        placeholder="0"
                        className="flex-1 px-2 py-1 border border-orange-300 rounded text-xs"
                        min="0"
                      />
                      <span className="text-xs text-gray-600">bp</span>
                    </div>
                    <p className="text-xs text-gray-600 mt-1">
                      Hide contigs smaller than this size (0 = show all)
                    </p>
                  </div>

                  <p className="text-xs text-gray-600 border-t pt-2">
                    {statistics?.capApplied ? (
                      <>Showing <strong>{statistics?.contigsForSelectedRef || 0}</strong> (of {statistics?.cappedCount || 0} capped, {statistics?.totalContigsForRef || 0} total)</>
                    ) : (
                      <>Showing <strong>{statistics?.contigsForSelectedRef || 0}</strong> of <strong>{statistics?.totalContigsForRef || 0}</strong> contigs</>
                    )}
                  </p>
                </div>

                {/* Line thickness */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Line thickness: {settings.lineThickness}x
                  </label>
                  <input
                    type="range"
                    min="1"
                    max="10"
                    value={settings.lineThickness}
                    onChange={(e) => onSettingsChange({
                      ...settings,
                      lineThickness: parseInt(e.target.value)
                    })}
                    className="w-full"
                  />
                </div>

                {/* Label font size */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Contig label font size: {settings.labelFontSize}px
                  </label>
                  <input
                    type="range"
                    min="8"
                    max="24"
                    value={settings.labelFontSize}
                    onChange={(e) => onSettingsChange({
                      ...settings,
                      labelFontSize: parseInt(e.target.value)
                    })}
                    className="w-full"
                  />
                </div>

                {/* Color settings */}
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Forward
                    </label>
                    <input
                      type="color"
                      value={settings.colors.uniqueForward}
                      onChange={(e) => onSettingsChange({
                        ...settings,
                        colors: { ...settings.colors, uniqueForward: e.target.value }
                      })}
                      className="w-full h-8 rounded border"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Reverse
                    </label>
                    <input
                      type="color"
                      value={settings.colors.uniqueReverse}
                      onChange={(e) => onSettingsChange({
                        ...settings,
                        colors: { ...settings.colors, uniqueReverse: e.target.value }
                      })}
                      className="w-full h-8 rounded border"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Repetitive
                    </label>
                    <input
                      type="color"
                      value={settings.colors.repetitive}
                      onChange={(e) => onSettingsChange({
                        ...settings,
                        colors: { ...settings.colors, repetitive: e.target.value }
                      })}
                      className="w-full h-8 rounded border"
                    />
                  </div>
                </div>
              </div>
            )}
          </>
        ) : (
          /* In exploration mode, show without collapsible wrapper */
          <>
            <h4 className="font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <Activity size={16} />
              Visualization Settings
            </h4>
            <div className="space-y-3">
              {/* Same content as above but without the collapsible wrapper */}
              {/* Show repetitive */}
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={settings.showRepetitive}
                  onChange={(e) => onSettingsChange({
                    ...settings,
                    showRepetitive: e.target.checked
                  })}
                  className="rounded border-gray-300 text-blue-500 focus:ring-blue-500"
                />
                <span className="text-sm">Show repetitive alignments</span>
              </label>

              {/* Show all alignments (including filtered ones) */}
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={settings.showAllAlignments}
                  onChange={(e) => onSettingsChange({
                    ...settings,
                    showAllAlignments: e.target.checked
                  })}
                  className="rounded border-gray-300 text-blue-500 focus:ring-blue-500"
                />
                <span className="text-sm">Show all unique alignments</span>
              </label>
              <p className="text-xs text-gray-500 ml-6 -mt-2">
                Include alignments filtered by unique_length threshold
              </p>

              {/* Contig Filtering Controls */}
              <div className="border-t pt-3 mt-3 space-y-3">
                <div className="flex justify-between items-center">
                  <label className="block text-sm font-medium text-gray-700">
                    Contig Filters
                  </label>
                  {statistics && statistics.filteredOutContigs > 0 && (
                    <span className="text-xs text-orange-600 font-medium">
                      {statistics.filteredOutContigs} contigs hidden
                    </span>
                  )}
                </div>

                {/* Performance Warning - Cap Applied */}
                {statistics && statistics.capApplied && (
                  <div className="bg-red-50 border border-red-300 rounded p-2">
                    <p className="text-xs text-red-700">
                      ⚠️ Showing largest {statistics.cappedCount} of {statistics.totalContigsForRef} contigs for loading performance.
                    </p>
                  </div>
                )}

                {/* Unique Alignment Ratio Filter */}
                <div className="bg-blue-50 p-2 rounded">
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-xs font-medium text-gray-700 flex items-center gap-1">
                      Unique Alignment Ratio
                      <HelpCircle
                        size={12}
                        className="text-gray-400 cursor-help"
                        title="Show contigs based on % of contig length that has unique alignment to the selected reference"
                      />
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="1"
                        value={(settings.minUniqueRatio * 100).toFixed(0)}
                        onChange={(e) => {
                          const value = Math.max(0, Math.min(100, parseFloat(e.target.value) || 0));
                          onSettingsChange({
                            ...settings,
                            minUniqueRatio: value / 100
                          });
                        }}
                        className="w-14 px-1 py-0.5 border border-blue-300 rounded text-xs text-blue-700 font-mono text-right"
                      />
                      <span className="text-xs text-blue-700">%</span>
                    </div>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="0.2"
                    step="0.01"
                    value={Math.min(settings.minUniqueRatio, 0.2)}
                    onChange={(e) => onSettingsChange({
                      ...settings,
                      minUniqueRatio: parseFloat(e.target.value)
                    })}
                    className="w-full"
                  />
                  <div className="flex justify-between text-xs text-gray-500 mt-0.5">
                    <span>0%</span>
                    <span>20%</span>
                  </div>
                  <p className="text-xs text-gray-600 mt-1">
                    Show contigs where ≥{(settings.minUniqueRatio * 100).toFixed(0)}% of contig length uniquely aligns to {selectedRef}
                  </p>
                </div>

                {/* Alignment Length Filter */}
                <div>
                  <label className="flex items-center gap-1 text-xs font-medium text-gray-700 mb-1">
                    Min Total Alignment Length
                    <HelpCircle
                      size={12}
                      className="text-gray-400 cursor-help"
                      title="Hides individual alignment lines shorter than this length (doesn't affect contig list)"
                    />
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min="0"
                      max="100000"
                      step="1000"
                      value={settings.minAlignmentLength}
                      onChange={(e) => onSettingsChange({
                        ...settings,
                        minAlignmentLength: parseInt(e.target.value)
                      })}
                      className="flex-1"
                    />
                    <input
                      type="number"
                      value={settings.minAlignmentLength}
                      onChange={(e) => onSettingsChange({
                        ...settings,
                        minAlignmentLength: parseInt(e.target.value) || 0
                      })}
                      className="w-20 px-2 py-1 border border-gray-300 rounded text-xs"
                      min="0"
                    />
                    <span className="text-xs text-gray-500">bp</span>
                  </div>
                </div>

                {/* Minimum Contig Size Filter */}
                <div className="bg-orange-50 p-2 rounded">
                  <label className="flex items-center gap-1 text-xs font-medium text-gray-700 mb-1">
                    Minimum Contig Size
                    <HelpCircle
                      size={12}
                      className="text-gray-400 cursor-help"
                      title="Hide contigs smaller than specified size"
                    />
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={settings.minContigSize || ''}
                      onChange={(e) => {
                        const value = e.target.value === '' ? 0 : parseInt(e.target.value);
                        onSettingsChange({
                          ...settings,
                          minContigSize: value >= 0 ? value : 0
                        });
                      }}
                      placeholder="0"
                      className="flex-1 px-2 py-1 border border-orange-300 rounded text-xs"
                      min="0"
                    />
                    <span className="text-xs text-gray-600">bp</span>
                  </div>
                  <p className="text-xs text-gray-600 mt-1">
                    Hide contigs smaller than this size (0 = show all)
                  </p>
                </div>

                <p className="text-xs text-gray-600 border-t pt-2">
                  {statistics?.capApplied ? (
                    <>Showing <strong>{statistics?.contigsForSelectedRef || 0}</strong> (of {statistics?.cappedCount || 0} capped, {statistics?.totalContigsForRef || 0} total)</>
                  ) : (
                    <>Showing <strong>{statistics?.contigsForSelectedRef || 0}</strong> of <strong>{statistics?.totalContigsForRef || 0}</strong> contigs</>
                  )}
                </p>
              </div>

              {/* Line thickness */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Line thickness: {settings.lineThickness}x
                </label>
                <input
                  type="range"
                  min="1"
                  max="10"
                  value={settings.lineThickness}
                  onChange={(e) => onSettingsChange({
                    ...settings,
                    lineThickness: parseInt(e.target.value)
                  })}
                  className="w-full"
                />
              </div>

              {/* Label font size */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Contig label font size: {settings.labelFontSize}px
                </label>
                <input
                  type="range"
                  min="8"
                  max="24"
                  value={settings.labelFontSize}
                  onChange={(e) => onSettingsChange({
                    ...settings,
                    labelFontSize: parseInt(e.target.value)
                  })}
                  className="w-full"
                />
              </div>

              {/* Color settings */}
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Forward
                  </label>
                  <input
                    type="color"
                    value={settings.colors.uniqueForward}
                    onChange={(e) => onSettingsChange({
                      ...settings,
                      colors: { ...settings.colors, uniqueForward: e.target.value }
                    })}
                    className="w-full h-8 rounded border"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Reverse
                  </label>
                  <input
                    type="color"
                    value={settings.colors.uniqueReverse}
                    onChange={(e) => onSettingsChange({
                      ...settings,
                      colors: { ...settings.colors, uniqueReverse: e.target.value }
                    })}
                    className="w-full h-8 rounded border"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Repetitive
                  </label>
                  <input
                    type="color"
                    value={settings.colors.repetitive}
                    onChange={(e) => onSettingsChange({
                      ...settings,
                      colors: { ...settings.colors, repetitive: e.target.value }
                    })}
                    className="w-full h-8 rounded border"
                  />
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Scaffolding Controls */}
      {!explorationMode && (
        <div className="mb-6">
          <h4 className="font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <Scissors size={16} />
            Scaffolding Controls
          </h4>

          {selectedRef && (
            <div className="space-y-4">
              {/* Contigs list */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h5 className="text-sm font-medium text-gray-700">
                    Contigs for {selectedRef}
                  </h5>
                  <span className="text-xs text-gray-500">
                    {contigsForSelectedRef.length} total
                  </span>
                </div>

                <div className="max-h-96 overflow-y-auto border border-gray-200 rounded-md">
                  {contigsForSelectedRef.length === 0 ? (
                    <div className="p-3 text-sm text-gray-500 text-center">
                      No unique alignments found for this reference
                    </div>
                  ) : (
                    contigsForSelectedRef.map((contig, index) => (
                      <div
                        key={contig.name}
                        className={`
                          p-2 cursor-pointer text-sm border-b border-gray-100 hover:bg-gray-50
                          ${selectedContigs.includes(contig.name) ? 'bg-blue-100' : ''}
                          ${contig.isModified ? 'border-l-4 border-l-purple-400' : ''}
                        `}
                        draggable={!explorationMode}
                        onDragStart={(e) => {
                          e.dataTransfer.setData('text/plain', contig.name);
                          e.dataTransfer.effectAllowed = 'move';
                        }}
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.dataTransfer.dropEffect = 'move';
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          const draggedContigName = e.dataTransfer.getData('text/plain');
                          if (draggedContigName !== contig.name) {
                            // Get the current list of contigs for this reference (in display order)
                            const currentContigs = contigsForSelectedRef.map(c => c.name);
                            const draggedIndex = currentContigs.indexOf(draggedContigName);
                            const targetIndex = index;

                            // Reorder just these contigs
                            const reordered = [...currentContigs];
                            reordered.splice(draggedIndex, 1);
                            reordered.splice(targetIndex, 0, draggedContigName);

                            // Update contigOrder with new indices
                            // Since contigOrder is now reference-specific, we create a fresh mapping
                            // for just the contigs in the current reference
                            const updatedOrder = {};
                            reordered.forEach((contigName, idx) => {
                              updatedOrder[contigName] = idx;
                            });

                            // Update the workspace's contigOrder for this reference
                            if (onContigOrderChange) {
                              onContigOrderChange(updatedOrder);
                            }
                          }
                        }}
                        onClick={(e) => handleContigSelection(contig.name, e.shiftKey)}
                        onDoubleClick={() => onZoomToContig && onZoomToContig(contig.name)}
                        title={!explorationMode ? "Drag to reorder or use arrows | Double-click to zoom" : "Click to select | Double-click to zoom"}
                      >
                        <div className="flex justify-between items-center gap-2">
                          {/* Arrow buttons for reordering */}
                          {!explorationMode && (
                            <div className="flex flex-col gap-0">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleMoveContig(contig.name, 'up');
                                }}
                                disabled={index === 0}
                                className={`p-1 hover:bg-gray-200 rounded transition-colors ${index === 0 ? 'opacity-30 cursor-not-allowed' : ''}`}
                                title="Move up"
                              >
                                <ChevronUp size={18} />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleMoveContig(contig.name, 'down');
                                }}
                                disabled={index === contigsForSelectedRef.length - 1}
                                className={`p-1 hover:bg-gray-200 rounded transition-colors ${index === contigsForSelectedRef.length - 1 ? 'opacity-30 cursor-not-allowed' : ''}`}
                                title="Move down"
                              >
                                <ChevronDown size={18} />
                              </button>
                            </div>
                          )}

                          <div className="flex-1">
                            <div className="flex justify-between items-center">
                              <span className={`font-medium ${contig.isModified ? 'text-purple-700' : ''}`}>
                                {!explorationMode && (
                                  <span className="mr-2 text-gray-400">⋮⋮</span>
                                )}
                                {contig.name}
                                {contig.group && (
                                  <span className="ml-1 text-xs bg-blue-100 text-blue-700 px-1 rounded">
                                    {contig.group}
                                  </span>
                                )}
                                {contig.flipSuggestionCount > 0 && contig.flipSuggestionCount / contig.alignmentCount > 0.5 && !contig.isInverted && (
                                  <span className="ml-1 text-xs bg-orange-100 text-orange-700 px-1 rounded" title={`${contig.flipSuggestionCount}/${contig.alignmentCount} alignments suggest flipping`}>
                                    ↻ flip?
                                  </span>
                                )}
                              </span>
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const newUninformative = new Set(uninformativeContigs);
                                    newUninformative.add(contig.name);
                                    onUninformativeContigsChange(newUninformative);
                                  }}
                                  className="p-0.5 hover:bg-red-100 rounded transition-colors text-gray-400 hover:text-red-600"
                                  title="Mark as uninformative and hide"
                                >
                                  <X size={14} />
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          {contig.alignmentCount} alignments, {
                            contig.contigLength >= 1000000
                              ? `${(contig.contigLength / 1000000).toFixed(1)}Mb`
                              : `${(contig.contigLength / 1000).toFixed(0)}kb`
                          } contig
                          {contig.flipSuggestionCount > 0 && !contig.isInverted && (
                            <span className="text-orange-600 ml-1">
                              ({Math.round(contig.flipSuggestionCount / contig.alignmentCount * 100)}% suggest flip)
                            </span>
                          )}
                          {contig.isModified && <span className="text-purple-600 ml-1">(modified)</span>}
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {selectedContigs.length > 0 && (
                  <div className="mt-2 text-xs text-gray-600">
                    Selected: {selectedContigs.length} contigs
                    <button
                      onClick={() => onSelectedContigsChange([])}
                      className="ml-2 text-blue-600 hover:underline"
                    >
                      Clear selection
                    </button>
                  </div>
                )}

                {uninformativeContigs.size > 0 && (
                  <div className="mt-2 p-2 bg-gray-50 rounded text-xs text-gray-600 flex justify-between items-center">
                    <span>{uninformativeContigs.size} uninformative contigs hidden</span>
                    <button
                      onClick={() => onUninformativeContigsChange(new Set())}
                      className="text-blue-600 hover:underline"
                    >
                      Restore all
                    </button>
                  </div>
                )}
              </div>

              {/* Action buttons */}
              <div className="space-y-2">
                {selectedContigs.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={handleInvertContig}
                      disabled={isPending}
                      className={`flex items-center gap-1 px-3 py-2 text-sm rounded-md transition-colors ${
                        isPending
                          ? 'bg-purple-400 cursor-wait'
                          : 'bg-purple-500 hover:bg-purple-600'
                      } text-white`}
                      title="Flip contigs to match reference orientation"
                    >
                      {isPending ? (
                        <>
                          <Loader2 size={14} className="animate-spin" />
                          Flipping...
                        </>
                      ) : (
                        <>
                          <RotateCcw size={14} />
                          Flip to Reference ({selectedContigs.length})
                        </>
                      )}
                    </button>

                    <button
                      onClick={() => {
                        const newUninformative = new Set(uninformativeContigs);
                        selectedContigs.forEach(contig => newUninformative.add(contig));
                        onUninformativeContigsChange(newUninformative);
                        onSelectedContigsChange([]); // Clear selection
                      }}
                      className="flex items-center gap-1 px-3 py-2 text-sm bg-gray-500 hover:bg-gray-600 text-white rounded-md transition-colors"
                      title="Hide these contigs as uninformative (cleared when changing chromosome)"
                    >
                      <Trash2 size={14} />
                      Mark Uninformative ({selectedContigs.length})
                    </button>
                  </div>
                )}

                {/* Chromosome grouping */}
                {selectedContigs.length > 0 && (
                  <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
                    <h6 className="text-sm font-medium text-blue-800 mb-2">
                      Create Chromosome Group
                    </h6>
                    <p className="text-xs text-blue-700 mb-2">
                      Group selected contigs to make a chromosome — multiple groups can be made for each reference chromosome
                    </p>

                    {!showGroupCreation ? (
                      <button
                        onClick={() => setShowGroupCreation(true)}
                        className="flex items-center gap-1 text-sm text-blue-600 hover:underline"
                      >
                        <Plus size={12} />
                        Create new group with {selectedContigs.length} contigs
                      </button>
                    ) : (
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={newGroupName}
                          onChange={(e) => setNewGroupName(e.target.value)}
                          placeholder="Group name (e.g., Chr08.1)"
                          className="flex-1 p-1 text-sm border border-gray-300 rounded"
                        />
                        <button
                          onClick={handleCreateGroup}
                          className="p-1 text-green-600 hover:bg-green-100 rounded"
                        >
                          <Check size={14} />
                        </button>
                        <button
                          onClick={() => {setShowGroupCreation(false); setNewGroupName('');}}
                          className="p-1 text-red-600 hover:bg-red-100 rounded"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Chromosome Groups */}
      {Object.keys(chromosomeGroups).length > 0 && (
        <div className="mb-6">
          <h4 className="font-semibold text-gray-700 mb-2 flex items-center gap-2">
            <Users size={16} />
            Chromosome Groups ({Object.keys(chromosomeGroups).length})
          </h4>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {Object.entries(chromosomeGroups).map(([groupName, group]) => {
              const isExpanded = expandedGroups.has(groupName);
              return (
                <div key={groupName} className="bg-blue-50 border border-blue-200 rounded-md p-2">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2 flex-1">
                      <button
                        onClick={() => {
                          const newExpanded = new Set(expandedGroups);
                          if (isExpanded) {
                            newExpanded.delete(groupName);
                          } else {
                            newExpanded.add(groupName);
                          }
                          setExpandedGroups(newExpanded);
                        }}
                        className="text-blue-600 hover:text-blue-800"
                        title={isExpanded ? "Collapse" : "Expand"}
                      >
                        {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </button>
                      <span className="font-medium text-blue-800">{groupName}</span>
                      <span className="text-xs text-blue-600">({group.contigs.length})</span>
                    </div>
                    <button
                      onClick={() => {
                        if (window.confirm(`Delete chromosome group "${groupName}"?`)) {
                          onDeleteChromosomeGroup(groupName);
                        }
                      }}
                      className="text-red-500 hover:text-red-700 p-1"
                      title="Delete group"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>

                  {isExpanded ? (
                    <div className="mt-2 space-y-1">
                      <div className="text-xs font-medium text-blue-700 mb-1">Contigs in this group:</div>
                      {group.contigs.map((contigName, idx) => (
                        <div key={idx} className="text-xs text-blue-700 pl-6">
                          • {contigName}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-xs text-blue-700">
                      {group.contigs.slice(0, 3).join(', ')}
                      {group.contigs.length > 3 && ` +${group.contigs.length - 3} more`}
                    </div>
                  )}

                  {selectedContigs.length > 0 && (
                    <button
                      onClick={() => handleAddToExistingGroup(groupName)}
                      className="text-xs text-blue-600 hover:underline mt-2"
                    >
                      Add {selectedContigs.length} selected to this group
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Modifications Log - Collapsible */}
      {modifications.length > 0 && (
        <div className="mb-6">
          <button
            onClick={() => setShowModifications(!showModifications)}
            className="w-full flex items-center justify-between p-2 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-md transition-colors mb-2"
          >
            <div className="flex items-center gap-2">
              <RotateCcw size={16} className="text-purple-700" />
              <h4 className="font-semibold text-purple-700">Modifications ({modifications.length})</h4>
            </div>
            {showModifications ? <ChevronUp size={16} className="text-purple-600" /> : <ChevronDown size={16} className="text-purple-600" />}
          </button>
          {showModifications && (
            <>
              <div className="max-h-40 overflow-y-auto bg-gray-50 border border-gray-200 rounded-md p-2 mb-2">
                {modifications.map((mod, index) => (
                  <div key={index} className="flex items-center justify-between py-1 border-b border-gray-200 last:border-b-0">
                    <div className="text-xs text-gray-600">
                      <strong className={mod.type === 'invert' ? 'text-purple-600' : 'text-orange-600'}>
                        {mod.type}
                      </strong>: {mod.query}
                      {mod.position && ` at ${mod.position}`}
                    </div>
                    <button
                      onClick={() => onRemoveModification(index)}
                      className="text-red-500 hover:bg-red-100 rounded p-1"
                    >
                      <Trash2 size={10} />
                    </button>
                  </div>
                ))}
              </div>
              <button
                onClick={() => modifications.forEach((_, i) => onRemoveModification(i))}
                className="w-full text-xs text-red-600 hover:bg-red-50 p-2 rounded border border-red-200"
              >
                Clear all modifications
              </button>
            </>
          )}
        </div>
      )}

    </div>
  );
};

export default ControlPanel;
