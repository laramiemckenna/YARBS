# Contig/Telomere Structure Visualization

The `genome_scaffolder.py` script now includes optional functionality to create high-resolution visualizations of chromosome structure showing:
- **Contigs** in alternating colors (color changes indicate contig boundaries and gaps)
- **Telomeres** as red stars

## Quick Start

Add the `--plot-structure` flag to your scaffolding command:

```bash
python3 genome_scaffolder.py \
  --query your_contigs.fasta \
  --coords your_coords.coords \
  --modifications your_modifications.json \
  --output output_prefix \
  --plot-structure
```

This will create a high-resolution PNG file: `output_prefix_contig_telomere_structure.png`

## Customizing Telomere Detection

### Basic Example (Plant Telomeres)
```bash
python3 genome_scaffolder.py \
  -q contigs.fasta \
  -c coords.coords \
  -m modifications.json \
  -o my_genome \
  --plot-structure \
  --telo-seq TTTAGGG
```

### Custom Telomere Sequence (e.g., Vertebrates)
```bash
python3 genome_scaffolder.py \
  -q contigs.fasta \
  -c coords.coords \
  -m modifications.json \
  -o my_genome \
  --plot-structure \
  --telo-seq TTAGGG
```

### Advanced: Fine-tune Detection Parameters

```bash
python3 genome_scaffolder.py \
  -q contigs.fasta \
  -c coords.coords \
  -m modifications.json \
  -o my_genome \
  --plot-structure \
  --telo-seq TTTAGGG \
  --max-dist-btw-telo 500 \
  --min-telo-size 300 \
  --min-telo-dens 0.5 \
  --max-dist-2end 5000 \
  --min-chr-size 10000000 \
  --min-contig-gap-size 100
```

## Parameter Reference

| Parameter | Default | Description |
|-----------|---------|-------------|
| `--telo-seq` | `TTTAGGG` | Telomere repeat sequence (plants: TTTAGGG, vertebrates: TTAGGG) |
| `--max-dist-btw-telo` | `500` | Maximum distance (bp) between telomere repeats in a cluster |
| `--min-telo-size` | `300` | Minimum size (bp) of telomere region to be detected |
| `--min-telo-dens` | `0.5` | Minimum density of telomere repeats (0-1 scale) |
| `--max-dist-2end` | `5000` | Maximum distance (bp) from chromosome end to search for telomeres |
| `--min-chr-size` | `10000000` | Minimum chromosome size (bp) to include in analysis/plot |
| `--min-contig-gap-size` | `100` | Minimum gap size (bp) to count as contig boundary |

## Understanding the Plot

The resulting visualization shows:

1. **Y-axis**: Each row represents one scaffolded chromosome
2. **X-axis**: Position along the chromosome in base pairs
3. **Colored rectangles**: Contigs (alternating colors help distinguish boundaries and gaps)
4. **Red stars**: Telomere regions detected at chromosome ends

### Color Alternation
The colors alternate with each contig boundary, making it easy to see:
- Where one contig ends and another begins
- The relative sizes of contigs
- Overall contiguity of the assembly

## Example Output

The plot will be saved as a high-resolution PNG (600 DPI) suitable for publication.

Example filename: `my_genome_contig_telomere_structure.png`

## Common Telomere Sequences by Organism

| Organism Group | Telomere Sequence | Parameter |
|----------------|-------------------|-----------|
| Plants (most) | TTTAGGG | `--telo-seq TTTAGGG` |
| Vertebrates | TTAGGG | `--telo-seq TTAGGG` |
| Insects (Diptera) | TTAGG | `--telo-seq TTAGG` |
| Fungi (some) | TTAGGG | `--telo-seq TTAGGG` |
| C. elegans | TTAGGC | `--telo-seq TTAGGC` |

## Tips for Parameter Tuning

1. **If no telomeres are detected:**
   - Verify your telomere sequence is correct
   - Try increasing `--max-dist-2end` (search further from ends)
   - Decrease `--min-telo-dens` (be less strict about density)
   - Decrease `--min-telo-size` (detect smaller regions)

2. **If too many false positives:**
   - Increase `--min-telo-dens` (require higher density)
   - Increase `--min-telo-size` (require larger regions)
   - Decrease `--max-dist-2end` (only search very close to ends)

3. **For highly fragmented assemblies:**
   - Decrease `--min-chr-size` to include smaller scaffolds
   - Adjust `--min-contig-gap-size` based on your gap size settings

## Dependencies

The plotting feature requires:
- `matplotlib`
- `numpy`
- `biopython`

Install with:
```bash
pip install matplotlib numpy biopython
```

## Integration with R/GENESPACE Workflow

This Python implementation provides similar functionality to the R/GENESPACE `find_contigsGapsTelos()` and `plot_contigs()` functions, but is integrated directly into the scaffolding pipeline.

Comparison to R code:
```r
# R/GENESPACE equivalent
genomeGrs <- find_contigsGapsTelos(
  dnass = dnaSS,
  teloKmers = "TTTAGGG",
  maxDistBtwTelo = 500,
  minTeloSize = 300,
  minTeloDens = 0.5,
  maxDist2end = 5000,
  minChrSize = 10000000,
  minContigGapSize = 100
)

p <- plot_contigs(
  cgt = genomeGrs,
  nColors = 5,
  palette = viridis::viridis
)
```

```bash
# Python equivalent
python3 genome_scaffolder.py \
  ... \
  --plot-structure \
  --telo-seq TTTAGGG \
  --max-dist-btw-telo 500 \
  --min-telo-size 300 \
  --min-telo-dens 0.5 \
  --max-dist-2end 5000 \
  --min-chr-size 10000000 \
  --min-contig-gap-size 100
```
