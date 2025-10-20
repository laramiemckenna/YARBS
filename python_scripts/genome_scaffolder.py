#!/usr/bin/env python3

"""
Genome Scaffolder - Apply modifications from interactive tool to create scaffolded genome
Part 3 of the interactive reference-based scaffolding pipeline
"""

import argparse
import json
from pathlib import Path
from Bio import SeqIO
from Bio.Seq import Seq
from Bio.SeqRecord import SeqRecord
from datetime import datetime
import logging

class GenomeScaffolder:
    def __init__(self, query_fasta, coords_file, modifications_file, output_prefix, simplify_names=False):
        self.query_fasta = query_fasta
        self.coords_file = coords_file
        self.modifications_file = modifications_file
        self.output_prefix = output_prefix
        self.simplify_names = simplify_names
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

            # If simplify_names is True, only use the chromosome group name
            # If False, add the full description
            if self.simplify_names:
                # Just the chromosome group name, no description
                record = SeqRecord(
                    Seq(sequence),
                    id=scaffold_name,
                    description=""
                )
            else:
                # Full description
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
            scaffold_name = f"scaffold_{idx}"

            # Check if this contig needs to be inverted
            sequence = contig_data['sequence']
            inverted = any(mod.get('type') == 'invert' and mod.get('contigName') == contig_name
                          for mod in self.modifications.get('modifications', []))

            if inverted:
                sequence = str(Seq(sequence).reverse_complement())
                orientation_note = "reverse complement"
            else:
                orientation_note = "original orientation"

            # If simplify_names is True, only use the scaffold name
            # If False, add the full description
            if self.simplify_names:
                description = ""
            else:
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

            return scaffolded_file

        except Exception as e:
            self.logger.error(f"Scaffolding failed: {str(e)}")
            raise

def main():
    parser = argparse.ArgumentParser(
        description="Apply interactive scaffolding modifications to create final genome"
    )
    parser.add_argument("--query", "-q", required=True, help="Query FASTA file (original contigs)")
    parser.add_argument("--coords", "-c", required=True, help="Coordinates file (.coords)")
    parser.add_argument("--modifications", "-m", required=True, help="Modifications JSON file from interactive tool")
    parser.add_argument("--output", "-o", required=True, help="Output prefix for scaffolded files")
    parser.add_argument("--gap-size", "-g", type=int, required=True, help="Number of Ns to insert between scaffolds (minimum: 100)")
    parser.add_argument("--simplify-names", action="store_true",
                       help="Output only sequence names in FASTA headers (omit descriptions)")

    args = parser.parse_args()

    # Validate gap size
    if args.gap_size < 100:
        print(f"Error: Gap size must be at least 100 (provided: {args.gap_size})")
        return 1

    # Validate input files
    for filepath in [args.query, args.coords, args.modifications]:
        if not Path(filepath).exists():
            print(f"Error: File {filepath} does not exist")
            return 1

    # Create scaffolder and run
    scaffolder = GenomeScaffolder(args.query, args.coords, args.modifications, args.output,
                                  simplify_names=args.simplify_names)
    scaffolder.gap_sequence = "N" * args.gap_size

    # Run scaffolding
    scaffolder.run_scaffolding()

    return 0

if __name__ == "__main__":
    exit(main())
