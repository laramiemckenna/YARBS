# Genome Scaffolding Export Guide

## Overview
This guide explains how to export modifications from the genome-scaffolding-viewer and use them with `genome_scaffolder.py` to create the final scaffolded genome assembly.

## Updated Features (Latest Version)

### Key Changes from Previous Version
1. **Locking Feature Removed**: The chromosome locking feature has been removed. All chromosome groups are now processed automatically.
2. **Reference-Scoped Workspaces**: Each reference chromosome has its own workspace with isolated modifications and chromosome groups.
3. **Reverse Stitching Order**: Contigs in chromosome groups are now stitched in REVERSE order - the first contig in the list becomes the LAST one attached in the final scaffold.

## Export Options

### 1. Export Current Workspace (Purple Button - "Export Current")
**File:** `genome_modifications_[reference]_[date].json`

Exports modifications for the **currently selected reference** only.

**Use case:** Save work in progress for a single reference, or export individual reference workspaces separately.

**Structure:**
```json
{
  "modifications": [...],
  "selectedContigs": [...],
  "chromosomeGroups": {
    "chr1A_copy1": {
      "contigs": ["contig_1", "contig_2", "contig_3"],
      "order": [0, 1, 2],
      "visible": true,
      "createdOn": "chr1"
    }
  },
  "contigOrder": {...},
  "uninformativeContigs": [...],
  "timestamp": "2025-01-15T10:30:00.000Z",
  "settings": {
    "viewMode": "directionality",
    "selectedRef": "chr1"
  }
}
```

### 2. Export All Workspaces (Indigo Button - "Export All") 🔵 **RECOMMENDED FOR SCAFFOLDING**
**File:** `genome_scaffolding_all_[date].json`

Exports **ALL chromosome groups from ALL references** combined into a single file.

**Use case:** This is the file you should use with `genome_scaffolder.py` to create your final genome assembly.

**Structure:**
```json
{
  "modifications": [...],
  "chromosomeGroups": {
    "chr1A_copy1": {
      "contigs": ["contig_1", "contig_2"],
      "createdOn": "chr1"
    },
    "chr1A_copy2": {
      "contigs": ["contig_4", "contig_5"],
      "createdOn": "chr1"
    },
    "chr2A_copy1": {
      "contigs": ["contig_10", "contig_11"],
      "createdOn": "chr2"
    }
  },
  "timestamp": "2025-01-15T10:30:00.000Z",
  "note": "Combined export from all reference workspaces - ready for genome_scaffolder.py"
}
```

### 3. Export Scaffolding Plan (Green Button - "Export Plan")
**File:** `scaffolding_plan_[date].tsv`

Exports a TSV (tab-separated values) file showing how contigs will be organized into scaffolds.

**Use case:** Preview the scaffolding plan, or use for custom scaffolding scripts.

**Structure:**
```tsv
scaffold_name	contig_name	contig_length	orientation	group
chr1A_copy1	contig_1	1500000	+	chr1A_copy1
chr1A_copy1	contig_2	2000000	-	chr1A_copy1
unincorporated_scaffold_1	contig_100	500000	+	unincorporated
```

## Using genome_scaffolder.py

### Changes Made to genome_scaffolder.py

The Python script has been updated to work with the new export format:

1. ✅ **Removed locked chromosome requirement** - All chromosome groups are processed
2. ✅ **Updated field name** - Uses `createdOn` instead of `reference` to identify source reference
3. ✅ **Reverse stitching order** - Contigs are reversed before stitching (first in list = last attached)
4. ✅ **Removed fallback mode** - Only processes explicit chromosome groups

### Basic Usage

```bash
python genome_scaffolder.py \
  --query contigs.fasta \
  --coords alignment.coords \
  --modifications genome_scaffolding_all_2025-01-15.json \
  --output my_genome \
  --gap-size 100
```

### Parameters

- `--query, -q`: Original query FASTA file (your contigs)
- `--coords, -c`: Alignment coordinates file (.coords)
- `--modifications, -m`: **Use the "Export All" JSON file** from the viewer
- `--output, -o`: Output prefix for scaffolded files
- `--gap-size, -g`: Number of N bases between scaffolds (default: 100)

### Output Files

1. **`{output}_scaffolded.fasta`**
   - Scaffolded chromosome groups (named by group)
   - Unincorporated contigs (sorted by length, descending)
   - All with descriptive FASTA headers

2. **`{output}_scaffolding_report.json`**
   - Machine-readable JSON report with statistics

3. **`{output}_scaffolding_report.txt`**
   - Human-readable text report with details

## Example Workflow

### Step 1: Create Chromosome Groups in Viewer

1. Load your `.coords` and `.coords.idx` files
2. Switch to "Scaffolding" mode (red)
3. For each reference chromosome:
   - Select contigs that belong together
   - Create chromosome group (e.g., "chr1A_copy1", "chr1A_copy2")
   - Drag to reorder contigs within each group
   - **Remember:** First contig in list = LAST attached in scaffold

### Step 2: Export All Workspaces

Click **"Export All"** (indigo button) to save:
- `genome_scaffolding_all_2025-01-15.json`

### Step 3: Run Python Scaffolder

```bash
python genome_scaffolder.py \
  -q my_contigs.fasta \
  -c alignment.coords \
  -m genome_scaffolding_all_2025-01-15.json \
  -o scaffolded_genome
```

### Step 4: Check Output

```bash
# View the report
cat scaffolded_genome_scaffolding_report.txt

# Check the FASTA
head scaffolded_genome_scaffolded.fasta
```

## Understanding Contig Order

### IMPORTANT: Reverse Stitching Logic

When you create a chromosome group with contigs in this order:
```
1. contig_A
2. contig_B
3. contig_C
```

The final scaffold will be stitched as:
```
contig_C --- [gap] --- contig_B --- [gap] --- contig_A
```

**Why?** This allows the visual representation in the viewer to match the biological assembly order, where contigs are typically added from right to left in the reference alignment.

### Example

**Viewer chromosome group "chr1A_copy1":**
- Position 1: contig_100 (order: 0)
- Position 2: contig_200 (order: 1)
- Position 3: contig_300 (order: 2)

**Scaffolder output:**
```
>chr1A_copy1 Sub-chromosome of chr1 | 5,000,000 bp | 3 contigs
[contig_300][NNN...][contig_200][NNN...][contig_100]
```

## Chromosome Group Naming

Best practices for naming chromosome groups:

- **Diploid:** `chr1_maternal`, `chr1_paternal`
- **Polyploid:** `chr1A_copy1`, `chr1A_copy2`, `chr1A_copy3`
- **Haplotypes:** `chr1_hap1`, `chr1_hap2`
- **Avoid:** Special characters, spaces, very long names

## Troubleshooting

### Issue: No chromosome groups exported
**Solution:** Make sure you've created at least one chromosome group before exporting.

### Issue: Contigs in wrong order
**Solution:** Remember the reverse stitching - first in list becomes last in scaffold. Reorder in the viewer accordingly.

### Issue: Missing contigs in output
**Solution:** Unassigned contigs appear as "unincorporated_scaffold_N" at the end of the FASTA file, sorted by length.

### Issue: Python script says "No chromosome groups found"
**Solution:** Use the "Export All" button (indigo), not "Export Current". The All export includes all chromosome groups.

## Data Format Changes

### Old Format (deprecated)
```json
{
  "chromosomeGroups": {...},
  "lockedChromosomes": ["chr1", "chr2"],  // ❌ No longer used
  "reference": "chr1"  // ❌ Old field name
}
```

### New Format (current)
```json
{
  "chromosomeGroups": {
    "chr1A_copy1": {
      "contigs": [...],
      "createdOn": "chr1"  // ✅ New field name
    }
  }
  // No lockedChromosomes field
}
```

## Notes

- Uninformative contigs (marked in the viewer) are still exported - they're just hidden from the UI
- Inversion modifications are applied during scaffolding
- Break modifications split contigs at specified positions
- Gap size can be customized (default 100 Ns)
- All modifications are logged in the output report

## Version History

- **v2.0** (Jan 2025): Removed locking, added reference-scoped workspaces, reverse stitching order
- **v1.0** (Previous): Original version with chromosome locking
