// src/utils/demoLoader.js - Utility functions for loading demo datasets
import JSZip from 'jszip';

/**
 * Loads a demo dataset from the public/demo_coords folder
 * @param {string} demoId - ID of the demo to load
 * @returns {Promise<FileList>} - Promise that resolves to a FileList-like object containing .coords and .coords.idx files
 */
export async function loadDemoFiles(demoId) {
  // Construct the path to the zip file
  const zipPath = `${process.env.PUBLIC_URL}/demo_coords/${demoId}.zip`;

  console.log(`Loading demo from: ${zipPath}`);

  try {
    // Fetch the zip file
    const response = await fetch(zipPath);

    if (!response.ok) {
      throw new Error(`Failed to fetch demo file: ${response.statusText}`);
    }

    // Get the zip file as an ArrayBuffer
    const arrayBuffer = await response.arrayBuffer();

    // Load the zip file using JSZip
    const zip = await JSZip.loadAsync(arrayBuffer);

    console.log('Zip file loaded, extracting files...');

    // Find the .coords and .coords.idx files
    // Filter out Mac junk files (__MACOSX, .DS_Store, etc.)
    const coordsFile = Object.keys(zip.files).find(
      name => name.endsWith('.coords') && !name.includes('__MACOSX') && !name.includes('.DS_Store')
    );

    const idxFile = Object.keys(zip.files).find(
      name => name.endsWith('.coords.idx') && !name.includes('__MACOSX') && !name.includes('.DS_Store')
    );

    if (!coordsFile || !idxFile) {
      throw new Error('Could not find .coords and .coords.idx files in the zip archive');
    }

    console.log(`Found files: ${coordsFile}, ${idxFile}`);

    // Extract the file contents
    const coordsBlob = await zip.file(coordsFile).async('blob');
    const idxBlob = await zip.file(idxFile).async('blob');

    // Get just the filename (without directory path)
    const coordsFilename = coordsFile.split('/').pop();
    const idxFilename = idxFile.split('/').pop();

    // Convert blobs to File objects
    const coordsFileObj = new File([coordsBlob], coordsFilename, { type: 'text/plain' });
    const idxFileObj = new File([idxBlob], idxFilename, { type: 'text/plain' });

    console.log(`Created File objects: ${coordsFileObj.name} (${coordsFileObj.size} bytes), ${idxFileObj.name} (${idxFileObj.size} bytes)`);

    // Return as a FileList-like array (the handleFileUpload function expects this)
    return [coordsFileObj, idxFileObj];
  } catch (error) {
    console.error('Error loading demo files:', error);
    throw error;
  }
}
