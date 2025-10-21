# YARBS — Yet Another Reference-Based Scaffolding Tool

Hey, it's Yarbi here! Welcome to the documentation for YARBS, Yet Another Reference-Based Scaffolding Tool.

**Try it now:** https://laramiemckenna.github.io/YARBS/

## Why YARBS?

This tool was built to address two of the issues that often arise during reference-based scaffolding:

1. **Manual curation is impossible or inaccessible.** As such, the scaffolding process can often be a blackbox to the user and manually adjusting the output can be cumbersome. To address this, YARBS allows the user to ultimately decide which contigs to combine and how to combine them via flexible mapping parameters and an intuitive web application. *Use this power wisely!*

2. **Edit reporting is often absent or poor.** When reference-based assemblies are published, we rarely see a clear, step-by-step record of the scaffolder's choices such that a 3rd party can easily reproduce the result, even if the tool used produces such an output. We believe that this is because the reports, if they exist, are often difficult to parse and understand. YARBS automatically produces human-readable reports of all changes made that are easy to include directly in supplementary material. Additionally, to aid in reporting and scaffolding integrity, YARBS automatically adds NNNs between joined contigs.

## Table of Contents
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Usage Tutorial](#usage-tutorial)
  - [Step 1: Alignment and Preparation](#step-1-alignment-and-preparation)
  - [Step 2: Interactive Scaffolding](#step-2-interactive-scaffolding)
  - [Step 3: Generate Final Scaffolded Genome](#step-3-generate-final-scaffolded-genome)
- [Best Practices and Tips](#best-practices-and-tips)
- [When NOT to Use Reference-Based Scaffolding](#when-not-to-use-reference-based-scaffolding)
- [Parameter Selection Guide](#parameter-selection-guide)
- [Secondary Use Cases](#secondary-use-cases)
- [Performance Tips](#performance-tips)
- [Troubleshooting](#troubleshooting)
- [Questions or Issues?](#questions-or-issues)

## Prerequisites

### Required Software

Install the following in a conda environment:
- Python 3.x
- pip
- pandas
- matplotlib
- numpy
- biopython
- minimap2

### Environment Setup

```bash
# Create and activate conda/mamba environment
conda create -n yarbs python=3.x
conda activate yarbs

# Install dependencies
conda install pip
pip install pandas numpy biopython
conda install bioconda::minimap2
```

### Download Python Scripts

The python scripts can be found here: https://github.com/laramiemckenna/YARBS/tree/main/python_scripts

## Usage Tutorial

### Step 1: Alignment and Preparation

Before using the web application, align your query genome to your reference genome using `minimap_prep.py`:

#### Command Syntax
```bash
python minimap_prep.py -r <reference.fa> -q <query.fa> -o <output_prefix> [options]
```

#### Parameters

```
Required:
  --reference, -r    Reference FASTA file
  --query, -q        Query FASTA file
  --output, -o       Output prefix

Optional:
  --threads, -t      Number of threads (default: 8, used for minimap2 and parallel uniqueness calculation)
  --unique-length    Minimum unique length for filtering (default: 10000)
  --preset           Minimap2 preset: asm5, asm10, or asm20 (default: asm20)
  --primary-only     Output only primary alignments (exclude secondary alignments)
```

**⚠️ Important Notes:**
- This step can be memory-intensive and time-consuming. If you have access to an HPC cluster, we recommend running it there.
- If you have a large query and/or reference genome, minimap2 alignment might take a while
- If you have a lot of contigs, the coord/idx file building will take longer
- **Use SHORT input names** for both your reference and query files — this will make visualization much cleaner

**Output:** This generates `.coords` and `.coords.idx` files needed for the next step.

### Step 2: Interactive Scaffolding

Load your alignment files into the web application: **https://laramiemckenna.github.io/YARBS/**

*(Video tutorial in progress)*

#### Features:
- **Exploration Mode:** Navigate and visualize your alignments with pan/zoom
- **Scaffolding Mode:** Make modifications, create chromosome groups, and reorder contigs
- **Save Progress:** Click "Save Session" to export a JSON file
  - Re-upload this JSON with your coordinate files to resume work later
  - **Pro tip:** Save your session regularly to avoid losing work!
- **Export Results:** Click "Export for Scaffolding" when finished
  - Produces a JSON file for the final scaffolding step
  - Generates a CSV tracking all changes made during curation

#### Adjustable Parameters

The tool provides several filtering parameters that can be adjusted based on your data:

- **Unique Alignment Ratio:** Filter contigs by what percentage of their length has unique alignment to the reference
  - More helpful for diverged and/or repetitive species
  - Less important for same-species comparisons

- **Minimum Contig Size:** Hide small contigs from view
  - Default: 100kb
  - Adjust based on your assembly quality and goals

- **Minimum Alignment Length:** Filter out short alignment lines from visualization
  - Helps reduce visual clutter
  - Doesn't affect which contigs appear in the list

**Note:** Parameters are adjustable because things will look different at different levels of divergence between the query and reference. For a very diverged species, unique alignment ratio will be especially helpful, for example.


### Step 3: Generate Final Scaffolded Genome

Run `scaffold.py` in the same directory as your scaffold JSON, coords files, and original contig FASTA:

#### Command Syntax

```bash
python scaffold.py \
  -q <query.fa> \
  -c <coords_file> \
  -m <modifications.json> \
  -o <output_prefix> \
  -g <gap_size>
```

#### Parameters

```
Required:
  --query, -q          Query FASTA file (original contigs)
  --coords, -c         Coordinates file (.coords)
  --modifications, -m  Modifications JSON file from interactive tool
  --output, -o         Output prefix for scaffolded files
  --gap-size, -g       Number of Ns to insert between scaffolds (minimum: 100)

Optional:
  --simplify-names     Output only sequence names in FASTA headers (omit descriptions)
```

**Output:**
- Scaffolded genome FASTA file
- Final report documenting all scaffolding decisions

**💡 Important:** In your final "scaffolding" export, you should export the session as well as the final file if you want to go back and edit.

## Best Practices and Tips

### Choosing a Reference Species:

- **Always use the most closely related reference species available**
  - Greater phylogenetic distance (especially without the same base chromosome number) opens you up to potential errors
  - Ideally, use a species with the same base chromosome number as your query

### Input File Naming:

**Strongly recommended:** Use SHORT input names for both your reference and query files. Long names will make the visualization harder to read and cluttered.

### Session Management:

- **Save your session regularly** using the "Save Session" button
  - The session file contains all your workspaces, modifications, and visualization settings
  - You can reload a session by uploading it alongside your `.coords` and `.coords.idx` files
  - When exporting for scaffolding, ALSO export your session for backup

### Working with the Visualization:

- Start in **Exploration Mode** to get familiar with your data
- Switch to **Scaffolding Mode** when ready to make modifications
- Use the adjustable filters to focus on the most informative contigs
- Use the contig lookup feature to find specific contigs that might be hidden by filters


## When NOT to Use Reference-Based Scaffolding

Reference-based scaffolding is **absolutely not appropriate** when:

1. **You're working in a system with lots of known aneuploidies or chromosome fissions/fusions** as the reference structure may not match your query biology

2. **You're trying to reference-based scaffold a low-coverage HiFi assembly OR an Illumina assembly** since these assembly types may have too many small contigs for this approach to be useful.


## Parameter Selection Guide

### Filter Parameters in the Web Interface

Different parameters are useful at different divergence levels:

- **Close relatives (same species):**
  - Lower unique alignment ratio thresholds work well
  - Most contigs should have strong alignments

- **Diverged species:**
  - Increase unique alignment ratio to filter out weak/ambiguous alignments
  - May need to lower minimum contig size to retain informative small contigs
  - Adjust minimum alignment length to reduce visual clutter


## Secondary Use Cases

Beyond initial scaffolding, YARBS is useful for:

- **Ordering, orienting, and renaming chromosomes that are already scaffolded**
  - Even if your assembly is already at chromosome-level, you can use YARBS to verify or improve the orientation and order of your chromosomes relative to the reference. Use the Chromosome Groups feature to rename your chromosomes too! 



## Performance Tips

### Speeding Up Initial Processing

If you have tons of small contigs and want to speed up the initial alignment/prep step:

- You can drop small contigs before running minimap_prep.py
  - **However, this is NOT recommended** — these extra contigs may actually be informative for scaffolding
  - Better approach: Use the filtering options in the web interface to hide them during visualization

### Handling Large Datasets

- The web application automatically caps display at 500 contigs per reference for performance
- Grouped, modified, and looked-up contigs are always shown regardless of this cap
- Use the filtering parameters to focus on the most important contigs


## Troubleshooting

### Files Won't Load

- Make sure you're uploading **both** `.coords` and `.coords.idx` files
- Check that the files were generated from the same minimap2 run

### Can't Find a Specific Contig

- Use the **Contig Lookup** feature in Scaffolding Mode
- Check if the contig is filtered out by your current parameter settings
- Verify the contig name matches exactly (case-sensitive)


## Questions or Issues?

If you encounter problems or have questions, please open an issue on the project repository: https://github.com/laramiemckenna/YARBS/issues
