use strict;
use warnings;
use XML::LibXML;

use Data::Dumper;

my $input_file = shift @ARGV;

if (!-f $input_file or $input_file !~ /[.]xml$/) {
    die "Input must be a valid xml file."
}

my $dom = XML::LibXML->load_xml(location => $input_file);

# Get song length
my $song_time = $dom->findvalue('/song/songLength');

# Parse phrases
my %phrase_info;
my $phrase_id = 0;
for my $phrase($dom->findnodes('/song/phrases/phrase')) {
    my $difficulty = $phrase->getAttribute('maxDifficulty');
    my $ignore = $phrase->getAttribute('ignore');
    $phrase_info{$phrase_id}{'difficulty'} = $difficulty;
    $phrase_info{$phrase_id}{'ignore'} = $ignore;
    $phrase_id++;
}

# Parse phrase iterations
my @phrases;
my @phrase_iterations = $dom->findnodes('/song/phraseIterations/phraseIteration');
for my $i(0 .. $#phrase_iterations) {
    my $phrase_id = $phrase_iterations[$i]->getAttribute('phraseId');

    my %phrase_attributes;
    $phrase_attributes{'difficulty'} = $phrase_info{$phrase_id}{'difficulty'};
    $phrase_attributes{'ignore'} = $phrase_info{$phrase_id}{'ignore'};
    $phrase_attributes{'start_time'} = $phrase_iterations[$i]->getAttribute('time');

    if ($i < $#phrase_iterations) {
        $phrase_attributes{'end_time'} = $phrase_iterations[$i + 1]->getAttribute('time');
    }
    else {
        $phrase_attributes{'end_time'} = $song_time;
    }

    push @phrases, \%phrase_attributes;
}

# Parse difficulty levels and get all the notes and chords in each
my %notes;
my %chords;
for my $level($dom->findnodes('/song/levels/level')) {
    my $difficulty = $level->getAttribute('difficulty');
    $notes{$difficulty} = $level->findnodes('notes/note');
    $chords{$difficulty} = $level->findnodes('chords/chord');
}


my $total = 0;

# Now loop through phrases and print all the notes in each
for my $phrase(@phrases) {
    my $difficulty = $phrase->{'difficulty'};
    #my $ignore = $phrase->{'ignore'};
    my $start_time = $phrase->{'start_time'};
    my $end_time = $phrase->{'end_time'};

    #next if $ignore;

    my $note_count = 0;
    for my $note(@{$notes{$difficulty}}) {
        my $note_time = $note->getAttribute('time');
        if ($note_time >= $start_time and $note_time < $end_time) {
            $note_count++;
            $total++;
            #print $note."\n";
        }
    }

    my $chord_count = 0;
    for my $chord(@{$chords{$difficulty}}) {
        my $chord_time = $chord->getAttribute('time');
        if ($chord_time >= $start_time and $chord_time < $end_time) {
            $chord_count++;
            $total++;
            #print $chord."\n";
        }
    }

    my $note_and_chord_count = $note_count + $chord_count;

    print "PHRASE - DIFFICULTY ($difficulty) - TIME ($start_time - $end_time) - (NOTES, CHORDS, BOTH): ($note_count, $chord_count, $note_and_chord_count)\n";
}

print "\nTOTAL: $total\n";
