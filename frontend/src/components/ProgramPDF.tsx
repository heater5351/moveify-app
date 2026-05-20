import { Document, Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer';
import type { AssignedProgram, ProgramExercise } from '../types/index.ts';
import { formatDuration, getExerciseType } from '../utils/duration';

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 10, fontFamily: 'Helvetica', color: '#1e293b' },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 16, borderBottom: '1pt solid #cbd5e1', paddingBottom: 12 },
  logo: { width: 80, height: 24, objectFit: 'contain', marginRight: 16 },
  headerText: { flex: 1 },
  programName: { fontSize: 16, fontWeight: 'bold', color: '#132232' },
  patientName: { fontSize: 11, color: '#475569', marginTop: 2 },
  meta: { fontSize: 9, color: '#64748b', marginTop: 4 },
  row: { flexDirection: 'row', marginBottom: 14, paddingBottom: 12, borderBottom: '0.5pt solid #e2e8f0' },
  left: { width: '40%', paddingRight: 12 },
  right: { width: '60%' },
  exerciseName: { fontSize: 12, fontWeight: 'bold', color: '#132232', marginBottom: 4 },
  prescription: { fontSize: 11, color: '#46c1c0', fontWeight: 'bold', marginBottom: 6 },
  instructions: { fontSize: 9, color: '#475569', lineHeight: 1.4 },
  poster: { width: '100%', objectFit: 'contain' },
  placeholder: { width: '100%', height: 90, backgroundColor: '#f1f5f9', justifyContent: 'center', alignItems: 'center' },
  placeholderText: { fontSize: 9, color: '#94a3b8' },
  footer: { position: 'absolute', bottom: 20, left: 32, right: 32, textAlign: 'center', fontSize: 8, color: '#94a3b8' },
});

function describePrescription(exercise: ProgramExercise): string {
  const exType = getExerciseType(exercise);
  if (exType === 'cardio') {
    return exercise.prescribedDuration ? formatDuration(exercise.prescribedDuration) : 'As prescribed';
  }
  if (exType === 'duration') {
    const dur = exercise.prescribedDuration ? formatDuration(exercise.prescribedDuration) : '--';
    return `${exercise.sets} set${exercise.sets !== 1 ? 's' : ''} x ${dur}`;
  }
  const weight = (exercise.prescribedWeight || 0) > 0 ? ` · ${exercise.prescribedWeight} kg` : '';
  return `${exercise.sets} sets x ${exercise.reps} reps${weight}`;
}

function describeFrequency(days: string[]): string {
  if (!days?.length) return '';
  if (days.length === 7) return 'Every day';
  return days.join(' · ');
}

function describeDuration(config: AssignedProgram['config']): string {
  const map: Record<string, string> = {
    '1week': '1 week', '2weeks': '2 weeks', '4weeks': '4 weeks',
    '6weeks': '6 weeks', 'ongoing': 'Ongoing', 'completed': 'Completed',
  };
  return map[config.duration] || config.duration;
}

interface ProgramPDFProps {
  program: AssignedProgram;
  patientName: string;
  logoUrl: string;
  imageUrls: Record<string, string | null>;
  generatedDate: string;
}

export const ProgramPDF = ({ program, patientName, logoUrl, imageUrls, generatedDate }: ProgramPDFProps) => (
  <Document>
    <Page size="A4" style={styles.page}>
      <View style={styles.header}>
        <Image src={logoUrl} style={styles.logo} />
        <View style={styles.headerText}>
          <Text style={styles.programName}>{program.config.name || 'Exercise Program'}</Text>
          <Text style={styles.patientName}>For {patientName}</Text>
          <Text style={styles.meta}>
            {describeFrequency(program.config.frequency)} · {describeDuration(program.config)}
          </Text>
        </View>
      </View>

      {program.exercises.map((ex, idx) => {
        const key = `${ex.id}-${idx}`;
        const imgUrl = imageUrls[key];
        return (
          <View key={key} style={styles.row} wrap={false}>
            <View style={styles.left}>
              <Text style={styles.exerciseName}>{ex.name}</Text>
              <Text style={styles.prescription}>{describePrescription(ex)}</Text>
              {ex.instructions ? (
                <Text style={styles.instructions}>{ex.instructions}</Text>
              ) : null}
            </View>
            <View style={styles.right}>
              {imgUrl ? (
                <Image src={imgUrl} style={styles.poster} />
              ) : (
                <View style={styles.placeholder}>
                  <Text style={styles.placeholderText}>Image not available</Text>
                </View>
              )}
            </View>
          </View>
        );
      })}

      <Text style={styles.footer} fixed>
        Generated {generatedDate} · moveifyapp.com
      </Text>
    </Page>
  </Document>
);
