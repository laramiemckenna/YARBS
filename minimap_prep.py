#!/usr/bin/env python3

"""
Minimap2-based genome alignment and coordinate file preparation
Replaces MUMmer with minimap2 for faster alignment processing
"""

import argparse
import subprocess
import pandas as pd
import numpy as np
import gzip
import time
import re
from pathlib import Path

class MinimapPrep:
    def __init__(self, reference_fasta, query_fasta, output_prefix, threads=8):
        self.reference_fasta = reference_fasta
        self.query_fasta = query_fasta
        self.output_prefix = output_prefix
        self.threads = threads
        
    def run_minimap2(self, preset="asm20"):
        """Run minimap2 alignment and return PAF file path"""
        paf_file = f"{self.output_prefix}.paf"
        
        cmd = [
            "minimap2",
            "-x", preset,  # asm20 for assembly-to-assembly alignment
            "-t", str(self.threads),
            "--cs=long",  # include cigar string for detailed alignment
            "-c",  # output CIGAR in PAF
            self.reference_fasta,
            self.query_fasta
        ]
        
        print(f"Running minimap2: {' '.join(cmd)}")
        
        with open(paf_file, 'w') as outfile:
            result = subprocess.run(cmd, stdout=outfile, stderr=subprocess.PIPE, text=True)
            
        if result.returncode != 0:
            raise RuntimeError(f"Minimap2 failed: {result.stderr}")
            
        print(f"Minimap2 completed. Output: {paf_file}")
        return paf_file
    
    def parse_paf(self, paf_file):
        """Parse PAF file into structured format with orientation tracking"""
        print("Parsing PAF file...")
        
        columns = [
            'query_name', 'query_length', 'query_start', 'query_end',
            'strand', 'ref_name', 'ref_length', 'ref_start', 'ref_end',
            'matches', 'alignment_length', 'mapping_quality'
        ]
        
        alignments = []
        
        with open(paf_file, 'r') as f:
            for line in f:
                fields = line.strip().split('\t')
                if len(fields) >= 12:
                    # Basic PAF fields
                    alignment = {
                        'query_name': fields[0],
                        'query_length': int(fields[1]),
                        'query_start': int(fields[2]),
                        'query_end': int(fields[3]),
                        'strand': fields[4],  # This is the aligned strand from minimap2
                        'ref_name': fields[5],
                        'ref_length': int(fields[6]),
                        'ref_start': int(fields[7]),
                        'ref_end': int(fields[8]),
                        'matches': int(fields[9]),
                        'alignment_length': int(fields[10]),
                        'mapping_quality': int(fields[11])
                    }
                    
                    # Calculate identity
                    alignment['identity'] = alignment['matches'] / alignment['alignment_length'] * 100
                    
                    # IMPORTANT: Track orientation information for scaffolding
                    alignment['original_orientation'] = '+'  # All contigs start as forward in original FASTA
                    alignment['aligned_orientation'] = fields[4]  # What minimap2 suggests (+ or -)
                    alignment['needs_flip'] = (fields[4] == '-')  # True if minimap2 suggests flipping
                    
                    # For original orientation display: always use forward coordinates
                    # The coordinates in PAF are already in the correct space for visualization
                    if fields[4] == '-':
                        # minimap2 gives us the coordinates as if the query was reverse-complemented
                        # For visualization, we want to show original orientation, so we need to flip back
                        alignment['original_query_start'] = alignment['query_start']
                        alignment['original_query_end'] = alignment['query_end']
                        alignment['display_query_start'] = int(fields[1]) - int(fields[3])  # Flip coordinates
                        alignment['display_query_end'] = int(fields[1]) - int(fields[2])
                    else:
                        # Forward alignment - coordinates are already correct
                        alignment['original_query_start'] = alignment['query_start']
                        alignment['original_query_end'] = alignment['query_end']
                        alignment['display_query_start'] = alignment['query_start']
                        alignment['display_query_end'] = alignment['query_end']
                    
                    # Parse additional tags for more details
                    for field in fields[12:]:
                        if field.startswith('NM:i:'):
                            alignment['edit_distance'] = int(field[5:])
                        elif field.startswith('ms:i:'):
                            alignment['dp_score'] = int(field[5:])
                    
                    alignments.append(alignment)
        
        df = pd.DataFrame(alignments)
        print(f"Parsed {len(df)} alignments")
        return df
    
    def calculate_uniqueness(self, alignments_df, unique_length=10000):
        """Calculate uniqueness similar to Assemblytics approach"""
        print("Calculating alignment uniqueness...")
        
        unique_alignments = []
        
        for query_name in alignments_df['query_name'].unique():
            query_alignments = alignments_df[alignments_df['query_name'] == query_name].copy()
            
            # Sort by position for plane sweep
            query_alignments = query_alignments.sort_values('query_start')
            
            # Plane sweep algorithm to find unique regions
            intervals = [(row['query_start'], row['query_end']) for _, row in query_alignments.iterrows()]
            unique_intervals = self._plane_sweep_unique(intervals)
            
            # Check each alignment for sufficient unique content
            for idx, row in query_alignments.iterrows():
                unique_content = self._calculate_unique_content(
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
                
                unique_alignments.append(row)
        
        result_df = pd.DataFrame(unique_alignments)
        print(f"Uniqueness calculation complete:")
        print(f"  - {len(result_df[result_df['tag'] == 'unique'])} unique alignments (pass filter)")
        print(f"  - {len(result_df[result_df['tag'] == 'unique_short'])} short unique alignments") 
        print(f"  - {len(result_df[result_df['tag'] == 'repetitive'])} repetitive alignments")
        return result_df
    
    def _plane_sweep_unique(self, intervals):
        """Find unique (non-overlapping) regions using plane sweep"""
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
    
    def _calculate_unique_content(self, start, end, unique_intervals):
        """Calculate how much unique content an alignment contains"""
        unique_content = 0
        
        for u_start, u_end in unique_intervals:
            overlap_start = max(start, u_start)
            overlap_end = min(end, u_end)
            
            if overlap_start < overlap_end:
                unique_content += overlap_end - overlap_start
        
        return unique_content
    
    def create_coordinate_files(self, alignments_df):
        """Create coordinate files compatible with dot plot visualization"""
        print("Creating coordinate files...")
        
        # Main coordinates file
        coords_file = f"{self.output_prefix}.coords"
        
        # Prepare data for output
        output_data = []
        
        for _, row in alignments_df.iterrows():
            # Use display coordinates for visualization (shows original orientation)
            query_start = row['display_query_start']
            query_end = row['display_query_end']
            
            output_data.append({
                'ref_start': row['ref_start'],
                'ref_end': row['ref_end'],
                'query_start': query_start,
                'query_end': query_end,
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
        self._create_index_file(alignments_df, coords_df)
        
        print(f"Coordinate files created: {coords_file}")
        return coords_file
    
    def _create_index_file(self, alignments_df, coords_df):
        """Create index file for efficient loading"""
        idx_file = f"{self.output_prefix}.coords.idx"
        
        with open(idx_file, 'w') as f:
            # Reference information
            f.write("#ref\n")
            f.write("ref,ref_length,matching_queries\n")
            
            ref_info = alignments_df.groupby('ref_name').agg({
                'ref_length': 'first',
                'query_name': lambda x: '~'.join(set(x))
            }).reset_index()
            
            for _, row in ref_info.iterrows():
                f.write(f"{row['ref_name']},{row['ref_length']},{row['query_name']}\n")
            
            # Query information
            f.write("#query\n")
            f.write("query,query_length,orientation,unique_alignments,unique_short_alignments,repetitive_alignments,matching_refs\n")

            query_info = alignments_df.groupby('query_name').agg({
                'query_length': 'first',
                'strand': lambda x: '+' if x.mode()[0] == '+' else '-',
                'ref_name': lambda x: '~'.join(set(x))
            }).reset_index()

            for _, row in query_info.iterrows():
                unique_count = len(alignments_df[(alignments_df['query_name'] == row['query_name']) & (alignments_df['tag'] == 'unique')])
                unique_short_count = len(alignments_df[(alignments_df['query_name'] == row['query_name']) & (alignments_df['tag'] == 'unique_short')])
                rep_count = len(alignments_df[(alignments_df['query_name'] == row['query_name']) & (alignments_df['tag'] == 'repetitive')])

                f.write(f"{row['query_name']},{row['query_length']},{row['strand']},{unique_count},{unique_short_count},{rep_count},{row['ref_name']}\n")
            
            # Overview alignments (top alignments by length)
            f.write("#overview\n")
            f.write("ref_start,ref_end,query_start,query_end,ref,query,tag,identity\n")
            
            top_alignments = coords_df.nlargest(1000, 'ref_end')  # Top 1000 by length
            for _, row in top_alignments.iterrows():
                f.write(f"{row['ref_start']},{row['ref_end']},{row['query_start']},{row['query_end']},{row['ref']},{row['query']},{row['tag']},{row['identity']:.2f}\n")
        
        print(f"Index file created: {idx_file}")
    
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
    parser = argparse.ArgumentParser(description="Minimap2-based genome alignment and coordinate preparation")
    parser.add_argument("--reference", "-r", required=True, help="Reference FASTA file")
    parser.add_argument("--query", "-q", required=True, help="Query FASTA file")
    parser.add_argument("--output", "-o", required=True, help="Output prefix")
    parser.add_argument("--threads", "-t", type=int, default=8, help="Number of threads")
    parser.add_argument("--unique-length", type=int, default=10000, help="Minimum unique length for filtering")
    parser.add_argument("--preset", default="asm20", help="Minimap2 preset (asm5, asm10, asm20)")
    
    args = parser.parse_args()
    
    prep = MinimapPrep(args.reference, args.query, args.output, args.threads)
    prep.run_full_pipeline(unique_length=args.unique_length, preset=args.preset)

if __name__ == "__main__":
    main()