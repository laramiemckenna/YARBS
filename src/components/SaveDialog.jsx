// src/components/SaveDialog.jsx - Dialog for save/discard prompt when switching references
import React from 'react';
import { AlertTriangle, Save, Trash2, X } from 'lucide-react';

const SaveDialog = ({
  isOpen,
  currentRef,
  targetRef,
  onSave,
  onDiscard,
  onCancel
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <AlertTriangle className="text-yellow-500" size={24} />
          <h2 className="text-xl font-bold text-gray-900">Unsaved Changes</h2>
        </div>

        {/* Content */}
        <div className="mb-6">
          <p className="text-gray-700 mb-2">
            You have unsaved changes on <strong>{currentRef}</strong>.
          </p>
          <p className="text-gray-600 text-sm">
            What would you like to do before switching to <strong>{targetRef}</strong>?
          </p>
        </div>

        {/* Action Buttons */}
        <div className="space-y-2">
          <button
            onClick={onSave}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-md font-medium transition-colors"
          >
            <Save size={18} />
            Save Changes
          </button>

          <button
            onClick={onDiscard}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-red-500 hover:bg-red-600 text-white rounded-md font-medium transition-colors"
          >
            <Trash2 size={18} />
            Discard Changes
          </button>

          <button
            onClick={onCancel}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-md font-medium transition-colors"
          >
            <X size={18} />
            Cancel
          </button>
        </div>

        {/* Help Text */}
        <p className="text-xs text-gray-500 mt-4 text-center">
          Saving will preserve all modifications, groups, and reordering for this reference.
        </p>
      </div>
    </div>
  );
};

export default SaveDialog;
