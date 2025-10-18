#!/usr/bin/env python3

"""
Genome Scaffolder - Apply modifications from interactive tool to create scaffolded genome
Part 3 of the interactive reference-based scaffolding pipeline
"""

import argparse
import json
import re
from pathlib import Path
from Bio import SeqIO
from Bio.Seq import Seq
from Bio.SeqRecord import SeqRecord
from datetime import datetime
import logging
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from matplotlib.colors import LinearSegmentedColormap
import numpy as np

class GenomeScaffolder:
    def __init__(self, query_fasta, coords_file, modifications_file, output_prefix):
        self.query_fasta = query_fasta
        self.coords_file = coords_file
        self.modifications_file = modifications_file
        self.output_prefix = output_prefix
        self.gap_sequence = "N" * 100  # 100 Ns between scaffolds

        # Setup logging
        logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
        self.logger = logging.getLogger(__name__)

        # Load data
        self.query_sequences = self._load_sequences()
        self.alignments = self._load_alignments()
        self.modifications = self._load_modifications()

        # Track modifications for report
        self.report_data = {
            'input_file': query_fasta,
            'modifications_applied': [],
            'scaffolds_created': [],
            'statistics': {},
            'timestamp': datetime.now().isoformat()
        }

        # Telomere analysis parameters (defaults)
        self.telo_params = {
            'sequence': 'TTTAGGG',  # Plant telomere default
            'max_dist_btw_telo': 500,
            'min_telo_size': 300,
            'min_telo_dens': 0.5,
            'max_dist_2end': 5000,
            'min_chr_size': 10000000,
            'min_contig_gap_size': 100
        }
    
    def _load_sequences(self):
        """Load query sequences from FASTA file"""
        self.logger.info(f"Loading sequences from {self.query_fasta}")
        sequences = {}
        
        for record in SeqIO.parse(self.query_fasta, "fasta"):
            sequences[record.id] = {
                'sequence': str(record.seq),
                'length': len(record.seq),
                'description': record.description
            }
        
        self.logger.info(f"Loaded {len(sequences)} sequences")
        return sequences
    
    def _load_alignments(self):
        """Load alignment data from coords file"""
        self.logger.info(f"Loading alignments from {self.coords_file}")
        alignments = []
        current_query = ""
        current_tag = ""
        
        with open(self.coords_file, 'r') as f:
            for line in f:
                line = line.strip()
                if line.startswith('!'):
                    # New query section
                    parts = line[1:].split('!')
                    current_query = parts[0]
                    current_tag = parts[1] if len(parts) > 1 else "unique"
                elif line and not line.startswith('ref_start'):
                    # Alignment data
                    fields = line.split(',')
                    if len(fields) >= 5:
                        alignments.append({
                            'ref_start': int(fields[0]),
                            'ref_end': int(fields[1]),
                            'query_start': int(fields[2]),
                            'query_end': int(fields[3]),
                            'ref': fields[4],
                            'query': current_query,
                            'tag': current_tag
                        })
        
        self.logger.info(f"Loaded {len(alignments)} alignments")
        return alignments
    
    def _load_modifications(self):
        """Load modifications from JSON file"""
        self.logger.info(f"Loading modifications from {self.modifications_file}")
        
        with open(self.modifications_file, 'r') as f:
            data = json.load(f)
        
        self.logger.info(f"Loaded {len(data.get('modifications', []))} modifications")
        return data
    
    def _get_contigs_for_reference(self, ref_name):
        """Get all contigs that align to a specific reference"""
        contigs = {}
        
        for alignment in self.alignments:
            if alignment['ref'] == ref_name and alignment['tag'] == 'unique':
                query_name = alignment['query']
                if query_name not in contigs:
                    contigs[query_name] = {
                        'alignments': [],
                        'median_position': 0,
                        'orientation': '+'
                    }
                contigs[query_name]['alignments'].append(alignment)
        
        # Calculate median position and orientation for each contig
        for contig_name, contig_data in contigs.items():
            positions = []
            forward_bp = 0
            reverse_bp = 0
            
            for alignment in contig_data['alignments']:
                positions.append((alignment['ref_start'] + alignment['ref_end']) / 2)
                
                # Determine orientation based on query coordinates
                if alignment['query_start'] < alignment['query_end']:
                    forward_bp += alignment['query_end'] - alignment['query_start']
                else:
                    reverse_bp += alignment['query_start'] - alignment['query_end']
            
            contig_data['median_position'] = sum(positions) / len(positions)
            contig_data['orientation'] = '+' if forward_bp >= reverse_bp else '-'
        
        return contigs
    
    def _apply_breaks(self, sequence_name, sequence):
        """Apply break modifications to a sequence"""
        breaks = [mod for mod in self.modifications['modifications'] 
                 if mod['type'] == 'break' and mod['query'] == sequence_name]
        
        if not breaks:
            return [sequence]
        
        # Sort breaks by position
        break_positions = sorted([b['position'] for b in breaks])
        
        # Split sequence at break points
        fragments = []
        last_pos = 0
        
        for pos in break_positions:
            if pos > last_pos and pos < len(sequence):
                fragments.append(sequence[last_pos:pos])
                last_pos = pos
        
        # Add final fragment
        if last_pos < len(sequence):
            fragments.append(sequence[last_pos:])
        
        self.report_data['modifications_applied'].append({
            'type': 'break',
            'sequence': sequence_name,
            'positions': break_positions,
            'fragments_created': len(fragments)
        })
        
        return fragments
    
    def _apply_inversions(self, sequence_name, sequence):
        """Apply inversion modifications to a sequence"""
        inversions = [mod for mod in self.modifications['modifications'] 
                     if mod['type'] == 'invert' and mod['query'] == sequence_name]
        
        if not inversions:
            return sequence
        
        # For simplicity, we'll reverse complement the entire sequence if inversion is requested
        # In a more sophisticated implementation, you'd invert specific regions
        inverted_seq = str(Seq(sequence).reverse_complement())
        
        self.report_data['modifications_applied'].append({
            'type': 'invert',
            'sequence': sequence_name,
            'original_length': len(sequence),
            'inverted_length': len(inverted_seq)
        })
        
        return inverted_seq
    
    def _order_contigs_by_reference_position(self, contigs):
        """Order contigs based on their median reference position"""
        return sorted(contigs.items(), key=lambda x: x[1]['median_position'])

    def _order_contigs_by_group_order(self, contigs_list, order_list):
        """Order contigs based on the order array from chromosome group

        Args:
            contigs_list: List of contig names
            order_list: List of indices specifying the order

        Returns:
            List of contigs ordered according to order_list
        """
        if not order_list or len(order_list) != len(contigs_list):
            # If no order specified or mismatch, return original order
            return contigs_list

        # Create pairs of (contig, order_index) and sort by order_index
        contig_order_pairs = list(zip(contigs_list, order_list))
        sorted_pairs = sorted(contig_order_pairs, key=lambda x: x[1])

        # Return just the contig names in sorted order
        return [contig for contig, _ in sorted_pairs]
    
    def _create_chromosome_assignments(self):
        """Create chromosome assignments based on alignments and modifications

        Process chromosome groups from the interactive tool.
        Contigs are stitched together in the order specified by the 'order' array.
        """
        chromosome_groups = self.modifications.get('chromosomeGroups', {})

        chromosome_assignments = {}

        if chromosome_groups:
            # Use chromosome groups for polyploid scaffolding
            self.logger.info(f"Found {len(chromosome_groups)} chromosome groups")

            for group_name, group_data in chromosome_groups.items():
                # Get reference name from 'createdOn' field (new format)
                ref_name = group_data.get('createdOn', group_data.get('reference', ''))
                contigs = group_data.get('contigs', [])
                order = group_data.get('order', [])

                if not contigs:
                    self.logger.warning(f"Group {group_name} has no contigs")
                    continue

                # Order contigs according to the 'order' array from the JSON
                ordered_contigs = self._order_contigs_by_group_order(contigs, order)

                chromosome_assignments[group_name] = {
                    'contigs': ordered_contigs,
                    'reference': ref_name,
                    'is_subchromosome': True
                }

                self.logger.info(f"Group {group_name}: {len(ordered_contigs)} contigs from {ref_name} in JSON order: {ordered_contigs}")

        else:
            # No chromosome groups found - nothing to scaffold
            self.logger.info("No chromosome groups found in modifications file")

        return chromosome_assignments
    
    def _build_scaffolds(self, chromosome_assignments):
        """Build scaffolded sequences"""
        scaffolds = {}

        for scaffold_name, assignment in chromosome_assignments.items():
            scaffold_sequences = []
            contigs_processed = []

            for contig_name in assignment['contigs']:
                if contig_name not in self.query_sequences:
                    self.logger.warning(f"Contig {contig_name} not found in input sequences")
                    continue

                # Get original sequence
                original_seq = self.query_sequences[contig_name]['sequence']

                # Apply breaks
                fragments = self._apply_breaks(contig_name, original_seq)

                # Apply inversions to each fragment
                processed_fragments = []
                for fragment in fragments:
                    processed_fragment = self._apply_inversions(contig_name, fragment)
                    processed_fragments.append(processed_fragment)

                # Add fragments with gaps
                for i, fragment in enumerate(processed_fragments):
                    scaffold_sequences.append(fragment)
                    if i < len(processed_fragments) - 1:  # Don't add gap after last fragment
                        scaffold_sequences.append(self.gap_sequence)

                # Add gap between contigs
                scaffold_sequences.append(self.gap_sequence)
                contigs_processed.append(contig_name)

            # Remove final gap
            if scaffold_sequences and scaffold_sequences[-1] == self.gap_sequence:
                scaffold_sequences.pop()

            # Join all sequences
            final_sequence = ''.join(scaffold_sequences)
            scaffolds[scaffold_name] = final_sequence

            # Record scaffold statistics
            scaffold_info = {
                'name': scaffold_name,
                'length': len(final_sequence),
                'num_contigs': len(contigs_processed),
                'contigs': contigs_processed,
                'num_gaps': scaffold_sequences.count(self.gap_sequence),
                'n_content': final_sequence.count('N') / len(final_sequence) * 100 if len(final_sequence) > 0 else 0
            }

            # Add reference info if it's a sub-chromosome
            if assignment.get('is_subchromosome'):
                scaffold_info['reference'] = assignment.get('reference')
                scaffold_info['type'] = 'sub-chromosome'
            else:
                scaffold_info['type'] = 'chromosome'

            self.report_data['scaffolds_created'].append(scaffold_info)
            self.logger.info(f"Built scaffold {scaffold_name}: {len(final_sequence):,} bp from {len(contigs_processed)} contigs")

        return scaffolds
    
    def _write_scaffolded_fasta(self, scaffolds, unincorporated_contigs):
        """Write scaffolded sequences and unincorporated contigs to FASTA file"""
        output_file = f"{self.output_prefix}_scaffolded.fasta"

        records = []
        scaffold_info_map = {s['name']: s for s in self.report_data['scaffolds_created']}

        # Add scaffolded chromosomes
        for scaffold_name, sequence in scaffolds.items():
            info = scaffold_info_map.get(scaffold_name, {})

            # Create descriptive header
            if info.get('type') == 'sub-chromosome':
                ref = info.get('reference', 'unknown')
                num_contigs = info.get('num_contigs', 0)
                description = f"Sub-chromosome of {ref} | {len(sequence):,} bp | {num_contigs} contigs"
            else:
                num_contigs = info.get('num_contigs', 0)
                description = f"Scaffolded chromosome | {len(sequence):,} bp | {num_contigs} contigs"

            record = SeqRecord(
                Seq(sequence),
                id=scaffold_name,
                description=description
            )
            records.append(record)

        # Add unincorporated contigs (sorted by length, descending)
        unincorporated_sorted = sorted(unincorporated_contigs,
                                      key=lambda x: self.query_sequences[x]['length'],
                                      reverse=True)

        for idx, contig_name in enumerate(unincorporated_sorted, start=1):
            contig_data = self.query_sequences[contig_name]
            scaffold_name = f"unincorporated_scaffold_{idx}"

            # Check if this contig needs to be inverted
            sequence = contig_data['sequence']
            inverted = any(mod.get('type') == 'invert' and mod.get('contigName') == contig_name
                          for mod in self.modifications.get('modifications', []))

            if inverted:
                sequence = str(Seq(sequence).reverse_complement())
                orientation_note = "reverse complement"
            else:
                orientation_note = "original orientation"

            description = f"Unincorporated | {len(sequence):,} bp | {orientation_note} | source: {contig_name}"

            record = SeqRecord(
                Seq(sequence),
                id=scaffold_name,
                description=description
            )
            records.append(record)

        SeqIO.write(records, output_file, "fasta")
        self.logger.info(f"Wrote {len(scaffolds)} scaffolded sequences and {len(unincorporated_sorted)} unincorporated contigs to {output_file}")
        return output_file
    
    def _get_unincorporated_contigs(self, assigned_contigs):
        """Get list of contigs that weren't assigned to any chromosome"""
        unincorporated = []

        for contig_name in self.query_sequences.keys():
            if contig_name not in assigned_contigs:
                unincorporated.append(contig_name)

        return unincorporated
    
    def _generate_report(self):
        """Generate detailed report of scaffolding process"""
        report_file = f"{self.output_prefix}_scaffolding_report.json"
        
        # Add statistics
        total_input_length = sum(seq['length'] for seq in self.query_sequences.values())
        total_scaffold_length = sum(scaffold['length'] for scaffold in self.report_data['scaffolds_created'])
        
        self.report_data['statistics'] = {
            'input_contigs': len(self.query_sequences),
            'total_input_length': total_input_length,
            'scaffolds_created': len(self.report_data['scaffolds_created']),
            'total_scaffold_length': total_scaffold_length,
            'modifications_applied': len(self.report_data['modifications_applied']),
            'gap_sequence_used': self.gap_sequence,
            'gap_length': len(self.gap_sequence)
        }
        
        # Write JSON report
        with open(report_file, 'w') as f:
            json.dump(self.report_data, f, indent=2)
        
        # Write human-readable report
        text_report_file = f"{self.output_prefix}_scaffolding_report.txt"
        with open(text_report_file, 'w') as f:
            f.write("GENOME SCAFFOLDING REPORT\n")
            f.write("=" * 50 + "\n\n")
            f.write(f"Generated: {self.report_data['timestamp']}\n")
            f.write(f"Input file: {self.report_data['input_file']}\n\n")
            
            f.write("SUMMARY STATISTICS\n")
            f.write("-" * 20 + "\n")
            stats = self.report_data['statistics']
            f.write(f"Input contigs: {stats['input_contigs']}\n")
            f.write(f"Total input length: {stats['total_input_length']:,} bp\n")
            f.write(f"Scaffolds created: {stats['scaffolds_created']}\n")
            f.write(f"Total scaffold length: {stats['total_scaffold_length']:,} bp\n")
            f.write(f"Modifications applied: {stats['modifications_applied']}\n")
            f.write(f"Gap sequence: {len(self.gap_sequence)} Ns\n\n")
            
            f.write("SCAFFOLDS CREATED\n")
            f.write("-" * 20 + "\n")

            # Group by type
            chromosomes = [s for s in self.report_data['scaffolds_created'] if s.get('type') == 'chromosome']
            subchromosomes = [s for s in self.report_data['scaffolds_created'] if s.get('type') == 'sub-chromosome']

            if chromosomes:
                f.write("Chromosomes:\n")
                for scaffold in chromosomes:
                    f.write(f"  {scaffold['name']}: {scaffold['length']:,} bp ")
                    f.write(f"({scaffold['num_contigs']} contigs, {scaffold['num_gaps']} gaps, ")
                    f.write(f"{scaffold['n_content']:.1f}% N content)\n")
                f.write("\n")

            if subchromosomes:
                f.write("Sub-chromosomes (polyploid copies):\n")
                # Group by reference
                by_ref = {}
                for s in subchromosomes:
                    ref = s.get('reference', 'unknown')
                    if ref not in by_ref:
                        by_ref[ref] = []
                    by_ref[ref].append(s)

                for ref, scaffolds_list in sorted(by_ref.items()):
                    f.write(f"\n  From {ref}:\n")
                    for scaffold in scaffolds_list:
                        f.write(f"    {scaffold['name']}: {scaffold['length']:,} bp ")
                        f.write(f"({scaffold['num_contigs']} contigs, {scaffold['num_gaps']} gaps, ")
                        f.write(f"{scaffold['n_content']:.1f}% N content)\n")
                        # List the contigs in this scaffold
                        if 'contigs' in scaffold:
                            contig_str = ', '.join(scaffold['contigs'][:5])
                            if len(scaffold['contigs']) > 5:
                                contig_str += f" ... and {len(scaffold['contigs']) - 5} more"
                            f.write(f"      Contigs: {contig_str}\n")
                f.write("\n")
            
            if self.report_data['modifications_applied']:
                f.write("\nMODIFICATIONS APPLIED\n")
                f.write("-" * 20 + "\n")
                for mod in self.report_data['modifications_applied']:
                    if mod['type'] == 'break':
                        f.write(f"  Break {mod['sequence']} at positions {mod['positions']} ")
                        f.write(f"(created {mod['fragments_created']} fragments)\n")
                    elif mod['type'] == 'invert':
                        f.write(f"  Invert {mod['sequence']} ({mod['original_length']:,} bp)\n")
        
        self.logger.info(f"Reports written to {report_file} and {text_report_file}")
        return report_file, text_report_file

    def _find_telomeres_in_sequence(self, sequence, seq_name):
        """Find telomere repeats in a sequence

        Args:
            sequence: DNA sequence string
            seq_name: Name of the sequence (for logging)

        Returns:
            List of telomere regions [{'start': int, 'end': int, 'density': float}, ...]
        """
        telo_seq = self.telo_params['sequence']
        telo_len = len(telo_seq)
        seq_len = len(sequence)
        telomeres = []

        # Search both ends of the sequence
        for region_start, region_end, label in [(0, min(self.telo_params['max_dist_2end'], seq_len), 'start'),
                                                  (max(0, seq_len - self.telo_params['max_dist_2end']), seq_len, 'end')]:

            region_seq = sequence[region_start:region_end].upper()
            region_len = len(region_seq)

            if region_len == 0:
                continue

            # Find all occurrences of telomere repeat in this region
            telo_positions = []
            pos = 0
            while pos < region_len - telo_len + 1:
                if region_seq[pos:pos + telo_len] == telo_seq:
                    telo_positions.append(pos)
                    pos += telo_len  # Skip ahead
                else:
                    pos += 1

            # Cluster nearby telomere repeats
            if not telo_positions:
                continue

            # Group positions that are close together
            clusters = []
            current_cluster = [telo_positions[0]]

            for pos in telo_positions[1:]:
                if pos - current_cluster[-1] <= self.telo_params['max_dist_btw_telo']:
                    current_cluster.append(pos)
                else:
                    if len(current_cluster) > 0:
                        clusters.append(current_cluster)
                    current_cluster = [pos]

            if current_cluster:
                clusters.append(current_cluster)

            # Filter clusters by size and density
            for cluster in clusters:
                cluster_start = cluster[0]
                cluster_end = cluster[-1] + telo_len
                cluster_size = cluster_end - cluster_start
                num_repeats = len(cluster)
                density = (num_repeats * telo_len) / cluster_size if cluster_size > 0 else 0

                if (cluster_size >= self.telo_params['min_telo_size'] and
                    density >= self.telo_params['min_telo_dens']):

                    telomeres.append({
                        'start': region_start + cluster_start,
                        'end': region_start + cluster_end,
                        'density': density,
                        'location': label,
                        'num_repeats': num_repeats
                    })

        return telomeres

    def _analyze_contig_structure(self, scaffolded_fasta):
        """Analyze contig structure, gaps, and telomeres in scaffolded sequences

        Args:
            scaffolded_fasta: Path to the scaffolded FASTA file

        Returns:
            Dictionary mapping scaffold names to their structure information
        """
        structure_data = {}

        # Read scaffolded sequences
        for record in SeqIO.parse(scaffolded_fasta, "fasta"):
            scaffold_name = record.id
            sequence = str(record.seq)
            seq_len = len(sequence)

            # Skip if below minimum chromosome size
            if seq_len < self.telo_params['min_chr_size']:
                self.logger.debug(f"Skipping {scaffold_name} - below minimum size ({seq_len:,} < {self.telo_params['min_chr_size']:,})")
                continue

            # Find gap regions (N stretches)
            gaps = []
            contigs = []
            in_gap = False
            gap_start = 0
            contig_start = 0

            for i, base in enumerate(sequence):
                if base.upper() == 'N':
                    if not in_gap:
                        # Start of new gap
                        if i > contig_start:
                            contigs.append({'start': contig_start, 'end': i})
                        gap_start = i
                        in_gap = True
                else:
                    if in_gap:
                        # End of gap
                        gap_size = i - gap_start
                        if gap_size >= self.telo_params['min_contig_gap_size']:
                            gaps.append({'start': gap_start, 'end': i, 'size': gap_size})
                        contig_start = i
                        in_gap = False

            # Handle final region
            if in_gap:
                gap_size = seq_len - gap_start
                if gap_size >= self.telo_params['min_contig_gap_size']:
                    gaps.append({'start': gap_start, 'end': seq_len, 'size': gap_size})
            else:
                if seq_len > contig_start:
                    contigs.append({'start': contig_start, 'end': seq_len})

            # Find telomeres
            telomeres = self._find_telomeres_in_sequence(sequence, scaffold_name)

            structure_data[scaffold_name] = {
                'length': seq_len,
                'contigs': contigs,
                'gaps': gaps,
                'telomeres': telomeres,
                'num_contigs': len(contigs),
                'num_gaps': len(gaps),
                'num_telomeres': len(telomeres)
            }

            self.logger.info(f"{scaffold_name}: {len(contigs)} contigs, {len(gaps)} gaps, {len(telomeres)} telomeres")

        return structure_data

    def _plot_contig_structure(self, structure_data, output_file):
        """Create a visualization of contig structure with alternating colors and telomere markers

        Args:
            structure_data: Dictionary from _analyze_contig_structure
            output_file: Path to save the plot
        """
        if not structure_data:
            self.logger.warning("No structure data to plot")
            return

        # Setup plot
        num_scaffolds = len(structure_data)
        fig, ax = plt.subplots(figsize=(12, max(3, num_scaffolds * 0.6)))

        # Define colors (viridis-like palette)
        colors = ['#440154', '#31688e', '#35b779', '#fde724', '#8c2981']

        y_pos = 0
        y_positions = {}
        scaffold_labels = []

        for scaffold_name, data in sorted(structure_data.items()):
            scaffold_labels.append(scaffold_name)
            y_positions[scaffold_name] = y_pos
            scaffold_len = data['length']

            # Draw contigs with alternating colors
            for i, contig in enumerate(data['contigs']):
                color = colors[i % len(colors)]
                start = contig['start']
                end = contig['end']
                width = end - start

                # Draw contig as rectangle
                rect = mpatches.Rectangle((start, y_pos - 0.3), width, 0.6,
                                          facecolor=color, edgecolor='black', linewidth=0.5)
                ax.add_patch(rect)

            # Draw telomeres as red stars
            for telo in data['telomeres']:
                telo_pos = (telo['start'] + telo['end']) / 2
                ax.plot(telo_pos, y_pos, marker='*', color='red', markersize=12, zorder=10)

            y_pos += 1

        # Set axis properties
        ax.set_ylim(-0.5, num_scaffolds - 0.5)
        ax.set_yticks(range(num_scaffolds))
        ax.set_yticklabels(scaffold_labels)
        ax.set_xlabel('Position (bp)', fontsize=12)
        ax.set_title('Chromosome Structure: Contigs, Gaps, and Telomeres', fontsize=14, fontweight='bold')
        ax.spines['top'].set_visible(False)
        ax.spines['right'].set_visible(False)

        # Format x-axis with commas
        ax.xaxis.set_major_formatter(plt.FuncFormatter(lambda x, p: f'{int(x):,}'))

        # Add legend
        legend_elements = [
            mpatches.Patch(facecolor='#440154', edgecolor='black', label='Contigs (color changes show boundaries)'),
            plt.Line2D([0], [0], marker='*', color='w', markerfacecolor='red', markersize=12, label='Telomere')
        ]
        ax.legend(handles=legend_elements, loc='upper right', fontsize=10)

        plt.tight_layout()
        plt.savefig(output_file, dpi=600, bbox_inches='tight')
        plt.close()

        self.logger.info(f"Contig structure plot saved to {output_file}")

    def run_scaffolding(self):
        """Run the complete scaffolding process"""
        self.logger.info("Starting genome scaffolding process")
        
        try:
            # Create chromosome assignments
            chromosome_assignments = self._create_chromosome_assignments()
            
            if not chromosome_assignments:
                self.logger.warning("No chromosome groups found in modifications. Nothing to scaffold.")
                return
            
            # Build scaffolds
            scaffolds = self._build_scaffolds(chromosome_assignments)

            # Track assigned contigs
            assigned_contigs = set()
            for assignment in chromosome_assignments.values():
                assigned_contigs.update(assignment['contigs'])

            # Get unincorporated contigs
            unincorporated_contigs = self._get_unincorporated_contigs(assigned_contigs)

            # Write merged output file (scaffolded + unincorporated)
            scaffolded_file = self._write_scaffolded_fasta(scaffolds, unincorporated_contigs)

            # Generate reports
            json_report, text_report = self._generate_report()

            self.logger.info("Scaffolding process completed successfully")
            self.logger.info(f"Output files:")
            self.logger.info(f"  - Scaffolded genome: {scaffolded_file}")
            self.logger.info(f"    - {len(scaffolds)} chromosome scaffolds")
            self.logger.info(f"    - {len(unincorporated_contigs)} unincorporated scaffolds")
            self.logger.info(f"  - JSON report: {json_report}")
            self.logger.info(f"  - Text report: {text_report}")

            # Return scaffolded file path for optional plotting
            return scaffolded_file

        except Exception as e:
            self.logger.error(f"Scaffolding failed: {str(e)}")
            raise

    def create_contig_telomere_plot(self, scaffolded_fasta=None):
        """Create contig structure plot with telomeres

        Args:
            scaffolded_fasta: Path to scaffolded FASTA (if None, will use default output name)
        """
        if scaffolded_fasta is None:
            scaffolded_fasta = f"{self.output_prefix}_scaffolded.fasta"

        self.logger.info("Creating contig/telomere structure plot")
        self.logger.info(f"Telomere parameters: {self.telo_params}")

        # Analyze structure
        structure_data = self._analyze_contig_structure(scaffolded_fasta)

        if not structure_data:
            self.logger.warning("No scaffolds meet minimum size criteria for plotting")
            return

        # Create plot
        output_plot = f"{self.output_prefix}_contig_telomere_structure.png"
        self._plot_contig_structure(structure_data, output_plot)

        return output_plot

def main():
    parser = argparse.ArgumentParser(
        description="Apply interactive scaffolding modifications to create final genome",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Telomere Analysis Parameters:
  The --plot-structure option creates a visualization showing:
  - Contigs in alternating colors (changes indicate contig boundaries and gaps)
  - Telomeres as red stars

  Default telomere sequence is TTTAGGG (plant telomeres).
  Adjust telomere detection parameters as needed for your organism.
        """
    )
    parser.add_argument("--query", "-q", required=True, help="Query FASTA file (original contigs)")
    parser.add_argument("--coords", "-c", required=True, help="Coordinates file (.coords)")
    parser.add_argument("--modifications", "-m", required=True, help="Modifications JSON file from interactive tool")
    parser.add_argument("--output", "-o", required=True, help="Output prefix for scaffolded files")
    parser.add_argument("--gap-size", "-g", type=int, default=100, help="Number of Ns to insert between scaffolds (default: 100)")

    # Plotting options
    parser.add_argument("--plot-structure", action="store_true",
                       help="Create contig/telomere structure visualization plot")

    # Telomere analysis parameters
    parser.add_argument("--telo-seq", type=str, default="TTTAGGG",
                       help="Telomere repeat sequence (default: TTTAGGG for plants)")
    parser.add_argument("--max-dist-btw-telo", type=int, default=500,
                       help="Maximum distance between telomere repeats in a cluster (bp) (default: 500)")
    parser.add_argument("--min-telo-size", type=int, default=300,
                       help="Minimum size of telomere region (bp) (default: 300)")
    parser.add_argument("--min-telo-dens", type=float, default=0.5,
                       help="Minimum density of telomere repeats (0-1) (default: 0.5)")
    parser.add_argument("--max-dist-2end", type=int, default=5000,
                       help="Maximum distance from chromosome end to search for telomeres (bp) (default: 5000)")
    parser.add_argument("--min-chr-size", type=int, default=10000000,
                       help="Minimum chromosome size to analyze/plot (bp) (default: 10000000)")
    parser.add_argument("--min-contig-gap-size", type=int, default=100,
                       help="Minimum gap size (N stretch) to count as contig boundary (bp) (default: 100)")

    args = parser.parse_args()

    # Validate input files
    for filepath in [args.query, args.coords, args.modifications]:
        if not Path(filepath).exists():
            print(f"Error: File {filepath} does not exist")
            return 1

    # Create scaffolder and run
    scaffolder = GenomeScaffolder(args.query, args.coords, args.modifications, args.output)
    scaffolder.gap_sequence = "N" * args.gap_size

    # Set telomere parameters
    scaffolder.telo_params = {
        'sequence': args.telo_seq.upper(),
        'max_dist_btw_telo': args.max_dist_btw_telo,
        'min_telo_size': args.min_telo_size,
        'min_telo_dens': args.min_telo_dens,
        'max_dist_2end': args.max_dist_2end,
        'min_chr_size': args.min_chr_size,
        'min_contig_gap_size': args.min_contig_gap_size
    }

    # Run scaffolding
    scaffolded_file = scaffolder.run_scaffolding()

    # Create plot if requested
    if args.plot_structure and scaffolded_file:
        try:
            plot_file = scaffolder.create_contig_telomere_plot(scaffolded_file)
            if plot_file:
                print(f"\nContig/telomere structure plot created: {plot_file}")
        except Exception as e:
            print(f"\nWarning: Failed to create structure plot: {str(e)}")
            print("Scaffolding completed successfully, but plotting failed.")

    return 0

if __name__ == "__main__":
    exit(main())
