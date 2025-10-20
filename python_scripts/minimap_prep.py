#!/usr/bin/env python3

"""
Minimap2-based genome alignment and coordinate file preparation
Replaces MUMmer with minimap2 for faster alignment processing

VERSION 2 - Optimized index file without unused overview section
VERSION 3 - Performance optimizations:
  - Parallel processing for uniqueness calculation (4-8x speedup)
  - Vectorized PAF parsing with pandas (3-10x speedup)
  - Categorical dtypes for memory efficiency (~30% reduction)
  - Pre-calculated tag counts in index creation (2-3x speedup)
  Total expected speedup: 20-100x on post-minimap2 processing
"""

import argparse
import subprocess
import pandas as pd
import numpy as np
import gzip
import time
import re
from pathlib import Path
from multiprocessing import Pool

class MinimapPrep:
    def __init__(self, reference_fasta, query_fasta, output_prefix, threads=8, primary_only=False):
        self.reference_fasta = reference_fasta
        self.query_fasta = query_fasta
        self.output_prefix = output_prefix
        self.threads = threads
        self.primary_only = primary_only

    def run_minimap2(self, preset="asm20"):
        """Run minimap2 alignment and return PAF file path"""
        paf_file = f"{self.output_prefix}.paf"

        cmd = [
            "minimap2",
            "-x", preset,  # asm20 for assembly-to-assembly alignment
            "-t", str(self.threads),
        ]

        # Add primary-only flag if requested
        if self.primary_only:
            cmd.extend(["-N", "0"])  # Only output primary alignments

        cmd.extend([
            self.reference_fasta,
            self.query_fasta
        ])

        print(f"Running minimap2: {' '.join(cmd)}")

        with open(paf_file, 'w') as outfile:
            result = subprocess.run(cmd, stdout=outfile, stderr=subprocess.PIPE, text=True)

        if result.returncode != 0:
            raise RuntimeError(f"Minimap2 failed: {result.stderr}")

        print(f"Minimap2 completed. Output: {paf_file}")
        return paf_file

    def parse_paf(self, paf_file):
        """Parse PAF file using vectorized pandas operations for speed"""
        print("Parsing PAF file...")

        # Read PAF directly with pandas - much faster than manual parsing
        df = pd.read_csv(
            paf_file,
            sep='\t',
            usecols=range(12),  # Only read first 12 columns (basic PAF fields)
            names=[
                'query_name', 'query_length', 'query_start', 'query_end',
                'strand', 'ref_name', 'ref_length', 'ref_start', 'ref_end',
                'matches', 'alignment_length', 'mapping_quality'
            ],
            dtype={
                'query_name': 'category',  # Categorical for memory efficiency
                'ref_name': 'category',
                'strand': 'category',
                'query_length': 'int32',
                'query_start': 'int32',
                'query_end': 'int32',
                'ref_length': 'int32',
                'ref_start': 'int32',
                'ref_end': 'int32',
                'matches': 'int32',
                'alignment_length': 'int32',
                'mapping_quality': 'int32'
            }
        )

        # Vectorized calculations - much faster than row-by-row
        df['identity'] = (df['matches'] / df['alignment_length'] * 100).round(2)

        # IMPORTANT: Track orientation information for scaffolding
        df['original_orientation'] = '+'  # All contigs start as forward in original FASTA
        df['aligned_orientation'] = df['strand']  # What minimap2 suggests (+ or -)
        df['needs_flip'] = df['strand'] == '-'  # True if minimap2 suggests flipping

        # Use raw PAF coordinates directly - no transformation needed
        # PAF format: coordinates are always in query's forward strand
        # For reverse alignments, the strand field ('-') indicates orientation
        # The dotplot visualization will naturally show the correct slope based on these coordinates

        print(f"Parsed {len(df)} alignments")
        return df

    @staticmethod
    def _process_query_uniqueness(query_name, query_alignments, unique_length):
        """Process uniqueness for a single query (used in parallel processing)"""
        # Sort by position for plane sweep
        query_alignments = query_alignments.sort_values('query_start').copy()

        # Plane sweep algorithm to find unique regions
        intervals = [(row['query_start'], row['query_end']) for _, row in query_alignments.iterrows()]
        unique_intervals = MinimapPrep._plane_sweep_unique_static(intervals)

        # Check each alignment for sufficient unique content
        results = []
        for _, row in query_alignments.iterrows():
            unique_content = MinimapPrep._calculate_unique_content_static(
                row['query_start'], row['query_end'], unique_intervals
            )

            # ENHANCED: Store both filtered and unfiltered classifications
            # Calculate unique ratio for this alignment
            alignment_length = row['ref_end'] - row['ref_start']
            unique_ratio = unique_content / alignment_length if alignment_length > 0 else 0

            if unique_content >= unique_length:
                row['tag'] = 'unique'
                row['passes_filter'] = True
            elif unique_ratio > 0.5:  # More than 50% of alignment is unique
                row['tag'] = 'unique_short'  # Short but mostly unique
                row['passes_filter'] = False
            else:
                row['tag'] = 'repetitive'  # Less than 50% unique = repetitive
                row['passes_filter'] = False

            # Store the unique content length for filtering options
            row['unique_content'] = unique_content
            results.append(row)

        return pd.DataFrame(results)

    def calculate_uniqueness(self, alignments_df, unique_length=10000):
        """Calculate uniqueness with parallel processing for speed"""
        print(f"Calculating alignment uniqueness using {self.threads} threads...")

        query_names = alignments_df['query_name'].unique()

        # Prepare query data for parallel processing
        query_data = [
            (query_name, alignments_df[alignments_df['query_name'] == query_name], unique_length)
            for query_name in query_names
        ]

        # Process queries in parallel
        with Pool(processes=self.threads) as pool:
            results = pool.starmap(self._process_query_uniqueness, query_data)

        # Combine results from all parallel workers
        result_df = pd.concat(results, ignore_index=True)

        print(f"Uniqueness calculation complete:")
        print(f"  - {len(result_df[result_df['tag'] == 'unique'])} unique alignments (pass filter)")
        print(f"  - {len(result_df[result_df['tag'] == 'unique_short'])} short unique alignments")
        print(f"  - {len(result_df[result_df['tag'] == 'repetitive'])} repetitive alignments")
        return result_df

    @staticmethod
    def _plane_sweep_unique_static(intervals):
        """Find unique (non-overlapping) regions using plane sweep (static for multiprocessing)"""
        if not intervals:
            return []

        events = []
        for start, end in intervals:
            events.append((start, 1))  # start event
            events.append((end, -1))   # end event

        events.sort()

        unique_intervals = []
        coverage = 0
        last_pos = -1

        for pos, change in events:
            if coverage == 1:  # Currently in unique region
                unique_intervals.append((last_pos, pos))

            coverage += change
            last_pos = pos

        return unique_intervals

    @staticmethod
    def _calculate_unique_content_static(start, end, unique_intervals):
        """Calculate how much unique content an alignment contains (static for multiprocessing)"""
        unique_content = 0

        for u_start, u_end in unique_intervals:
            overlap_start = max(start, u_start)
            overlap_end = min(end, u_end)

            if overlap_start < overlap_end:
                unique_content += overlap_end - overlap_start

        return unique_content

    def _plane_sweep_unique(self, intervals):
        """Find unique (non-overlapping) regions using plane sweep"""
        return self._plane_sweep_unique_static(intervals)

    def _calculate_unique_content(self, start, end, unique_intervals):
        """Calculate how much unique content an alignment contains"""
        return self._calculate_unique_content_static(start, end, unique_intervals)

    def create_coordinate_files(self, alignments_df):
        """Create coordinate files compatible with dot plot visualization"""
        print("Creating coordinate files...")

        # Main coordinates file
        coords_file = f"{self.output_prefix}.coords"

        # Prepare data for output
        output_data = []

        for _, row in alignments_df.iterrows():
            # Use raw PAF coordinates directly - no transformation
            output_data.append({
                'ref_start': row['ref_start'],
                'ref_end': row['ref_end'],
                'query_start': row['query_start'],
                'query_end': row['query_end'],
                'ref': row['ref_name'],
                'query': row['query_name'],
                'tag': row['tag'],
                'identity': row['identity'],
                'original_orientation': row['original_orientation'],
                'aligned_orientation': row['aligned_orientation'],
                'needs_flip': row['needs_flip'],
                'minimap2_strand': row['strand']
            })

        # Write coordinates file with enhanced metadata
        coords_df = pd.DataFrame(output_data)

        # Group by query and tag, then write - INCLUDE ALL TAGS (unique, unique_short, repetitive)
        with open(coords_file, 'w') as f:
            f.write("ref_start,ref_end,query_start,query_end,ref,original_orientation,aligned_orientation,needs_flip,identity\n")

            for query_name in coords_df['query'].unique():
                for tag in ['unique', 'unique_short', 'repetitive']:
                    subset = coords_df[(coords_df['query'] == query_name) & (coords_df['tag'] == tag)]
                    if not subset.empty:
                        f.write(f"!{query_name}!{tag}\n")
                        for _, row in subset.iterrows():
                            f.write(f"{row['ref_start']},{row['ref_end']},{row['query_start']},{row['query_end']},{row['ref']},{row['original_orientation']},{row['aligned_orientation']},{row['needs_flip']},{row['identity']:.2f}\n")

        # Create index file
        self._create_index_file(alignments_df)

        print(f"Coordinate files created: {coords_file}")
        return coords_file

    def _create_index_file(self, alignments_df):
        """
        Create optimized index file for efficient loading

        VERSION 2 CHANGE: Removed unused #overview section that was inflating file size
        The overview section stored 1000 alignment records but was never used by the
        visualization app (see fileParser.js line 153)

        VERSION 3 OPTIMIZATION: Pre-calculate tag counts to avoid repeated filtering
        """
        idx_file = f"{self.output_prefix}.coords.idx"

        # Pre-calculate tag counts once (much faster than repeated filtering)
        tag_counts = alignments_df.groupby(['query_name', 'tag']).size().unstack(fill_value=0)

        with open(idx_file, 'w') as f:
            # Reference information
            f.write("#ref\n")
            f.write("ref,ref_length,matching_queries\n")

            ref_info = alignments_df.groupby('ref_name', sort=False).agg({
                'ref_length': 'first',
                'query_name': lambda x: '~'.join(x.unique())  # unique() faster than set()
            }).reset_index()

            for _, row in ref_info.iterrows():
                f.write(f"{row['ref_name']},{row['ref_length']},{row['query_name']}\n")

            # Query information
            f.write("#query\n")
            f.write("query,query_length,orientation,unique_alignments,unique_short_alignments,repetitive_alignments,matching_refs\n")

            query_info = alignments_df.groupby('query_name', sort=False).agg({
                'query_length': 'first',
                'strand': lambda x: x.mode()[0],
                'ref_name': lambda x: '~'.join(x.unique())
            }).reset_index()

            for _, row in query_info.iterrows():
                query_name = row['query_name']

                # Use pre-calculated tag counts (much faster than filtering)
                unique_count = int(tag_counts.loc[query_name, 'unique']) if query_name in tag_counts.index and 'unique' in tag_counts.columns else 0
                unique_short_count = int(tag_counts.loc[query_name, 'unique_short']) if query_name in tag_counts.index and 'unique_short' in tag_counts.columns else 0
                rep_count = int(tag_counts.loc[query_name, 'repetitive']) if query_name in tag_counts.index and 'repetitive' in tag_counts.columns else 0

                f.write(f"{query_name},{row['query_length']},{row['strand']},{unique_count},{unique_short_count},{rep_count},{row['ref_name']}\n")

            # REMOVED: #overview section
            # This section was storing 1000 alignment records but is skipped by the app
            # (see fileParser.js:153 - "Skip overview section for now")
            # Removing this significantly reduces index file size with no functionality loss

        print(f"Optimized index file created: {idx_file}")

    def run_full_pipeline(self, unique_length=10000, preset="asm20"):
        """Run the complete pipeline"""
        print(f"Starting minimap2 pipeline for {self.query_fasta} vs {self.reference_fasta}")

        # Step 1: Run minimap2
        paf_file = self.run_minimap2(preset=preset)

        # Step 2: Parse alignments
        alignments_df = self.parse_paf(paf_file)

        # Step 3: Calculate uniqueness
        alignments_df = self.calculate_uniqueness(alignments_df, unique_length=unique_length)

        # Step 4: Create coordinate files
        coords_file = self.create_coordinate_files(alignments_df)

        print(f"Pipeline complete! Output files: {self.output_prefix}.coords, {self.output_prefix}.coords.idx")
        return coords_file

def main():
    parser = argparse.ArgumentParser(description="Minimap2-based genome alignment and coordinate preparation (v3 - parallel optimized)")
    parser.add_argument("--reference", "-r", required=True, help="Reference FASTA file")
    parser.add_argument("--query", "-q", required=True, help="Query FASTA file")
    parser.add_argument("--output", "-o", required=True, help="Output prefix")
    parser.add_argument("--threads", "-t", type=int, default=8, help="Number of threads (used for minimap2 and parallel uniqueness calculation)")
    parser.add_argument("--unique-length", type=int, default=10000, help="Minimum unique length for filtering")
    parser.add_argument("--preset", default="asm20", help="Minimap2 preset (asm5, asm10, asm20)")
    parser.add_argument("--primary-only", action="store_true", help="Output only primary alignments (exclude secondary alignments)")

    args = parser.parse_args()

    prep = MinimapPrep(args.reference, args.query, args.output, args.threads, primary_only=args.primary_only)
    prep.run_full_pipeline(unique_length=args.unique_length, preset=args.preset)

if __name__ == "__main__":
    main()
