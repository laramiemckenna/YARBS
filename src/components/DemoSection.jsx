// src/components/DemoSection.jsx - Demo file loading section
import React, { useState } from 'react';
import { Loader2, PlayCircle } from 'lucide-react';
import { loadDemoFiles } from '../utils/demoLoader';

const DemoSection = ({ onFileUpload }) => {
  const [loadingDemo, setLoadingDemo] = useState(null);

  const demos = [
    {
      id: 'diploid_to_closely_related_diploid',
      title: 'Diploid to Diploid',
      description: (
        <>
          The query file is a concatenation of both haplotype fastas provided by <code className="bg-gray-100 px-1 rounded text-sm">hifiasm</code> for a <strong>diploid</strong> plant species <em>aligned to a single haplotype of a closely related, sympatric diploid species</em> with the same base chromosome number. Due to concatenation, both homologous chromosomes will be viewable on the dotplot.
        </>
      )
    },
    {
      id: 'autotetraploid_to_distantly_related_diploid',
      title: 'Tetraploid to Diploid (Distant)',
      description: (
        <>
          The query file is a concatenation of both haplotype fastas provided by <code className="bg-gray-100 px-1 rounded text-sm">hifiasm</code> for an <strong>autotetraploid</strong> plant species aligned to a single haplotype of a <em>distantly-related diploid species from another genus in the same family</em> with the same base chromosome number. Due to concatenation, all four copies will be visible on the dotplot.
        </>
      )
    },
    {
      id: 'autotetraploid_to_primary_of_self',
      title: 'Tetraploid to Primary of Self',
      description: (
        <>
          The query file is a concatenation of both haplotype fastas provided by <code className="bg-gray-100 px-1 rounded text-sm">hifiasm</code> for an <strong>autotetraploid</strong> plant species aligned to a <em>monoploid reference of itself</em> with the same base chromosome number. Due to concatenation, all four copies will be visible on the dotplot.
        </>
      )
    }
  ];

  const handleDemoClick = async (demoId) => {
    setLoadingDemo(demoId);
    try {
      const files = await loadDemoFiles(demoId);
      onFileUpload(files);
    } catch (error) {
      console.error('Error loading demo:', error);
      alert(`Failed to load demo: ${error.message}`);
    } finally {
      setLoadingDemo(null);
    }
  };

  return (
    <div className="mt-6 pt-6 border-t border-gray-200">
      {/* Demo title */}
      <h2 className="text-2xl font-bold text-gray-900 mb-4">Try a Demo Dataset</h2>
      <p className="text-lg text-gray-600 mb-4">
        Click any demo below to instantly load sample data and explore YARBS features.
      </p>

      {/* Intro note about concatenation */}
      <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <p className="text-lg text-gray-700">
          <strong>Note:</strong> We often concatenate haplotypes because 1) it makes the reference-based scaffolding more efficient and 2) it is easier to visualize potentially informative differences between the haplotypes.
        </p>
      </div>

      {/* Demo cards */}
      <div className="space-y-4">
        {demos.map((demo) => (
          <div
            key={demo.id}
            className="bg-white border border-gray-300 rounded-lg p-5 shadow-sm hover:shadow-md transition-shadow"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <h3 className="text-xl font-bold text-gray-900 mb-2">
                  {demo.title}
                </h3>
                <p className="text-base text-gray-700 leading-relaxed">
                  {demo.description}
                </p>
              </div>

              <button
                onClick={() => handleDemoClick(demo.id)}
                disabled={loadingDemo !== null}
                className="flex items-center gap-2 px-5 py-3 rounded-md font-medium transition-colors shadow-sm whitespace-nowrap"
                style={{
                  backgroundColor: loadingDemo === demo.id ? '#d1d5db' : '#f97315',
                  color: 'white',
                  cursor: loadingDemo !== null ? 'not-allowed' : 'pointer',
                  opacity: loadingDemo !== null && loadingDemo !== demo.id ? 0.5 : 1
                }}
                onMouseEnter={(e) => {
                  if (loadingDemo === null) {
                    e.target.style.backgroundColor = '#ea580c';
                  }
                }}
                onMouseLeave={(e) => {
                  if (loadingDemo === null) {
                    e.target.style.backgroundColor = '#f97315';
                  }
                }}
              >
                {loadingDemo === demo.id ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    Loading...
                  </>
                ) : (
                  <>
                    <PlayCircle size={18} />
                    Try Demo
                  </>
                )}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default DemoSection;
