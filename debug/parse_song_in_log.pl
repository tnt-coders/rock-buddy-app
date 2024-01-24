use strict;
use warnings;

my $logfile = shift @ARGV;

open my $input_fh, '<', $logfile or die "Failed to open logfile: $!\n";
my @lines = <$input_fh>;
close $input_fh;

my @output;
for my $line(@lines) {
    if ($line =~ /songTime["]:(\d+[.]\d+).+?progressTimer["]:(\d+)/) {
        my $songTime = $1;
        my $progressTimer = $2/1000;
        push @output, "$songTime,$progressTimer\n";
    }
}

open my $output_fh, '>', 'out.csv' or die "Failed to open output file: $!\n";
print {$output_fh} @output;
close $output_fh;