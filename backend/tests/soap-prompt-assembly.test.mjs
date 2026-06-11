import { describe, it, expect } from 'vitest';

// Pure-logic tests for the SOAP prompt-assembly layer (Phase 1 of the scribe
// context upgrades). The Bedrock call itself is exercised on staging; here we
// lock the block structure: history is clearly delimited and marked
// context-only, the transcript always closes the message, and a string input
// (legacy call shape from scribe-preferences.js) still works.
const { buildSoapUserMessage } = await import('../services/scribe-llm.js');

const TRANSCRIPT = 'Clinician: How is the knee feeling this week?\nPatient: Much better, pain is down to a three.';

describe('buildSoapUserMessage', () => {
  it('with no prior context, produces transcript + instruction only', () => {
    const msg = buildSoapUserMessage({ transcript: TRANSCRIPT });
    expect(msg).toContain(TRANSCRIPT);
    expect(msg).toContain('Generate the SOAP note.');
    expect(msg).not.toContain('PATIENT HISTORY');
  });

  it('treats an empty priorContext object as no history', () => {
    const msg = buildSoapUserMessage({ transcript: TRANSCRIPT, priorContext: {} });
    expect(msg).not.toContain('PATIENT HISTORY');
  });

  it('includes a delimited, context-only history block with summary and prior note', () => {
    const msg = buildSoapUserMessage({
      transcript: TRANSCRIPT,
      priorContext: {
        summary: 'Condition: R knee OA | Progress: pain 6/10 → 4/10 | Plan: strength block',
        sessionCount: 4,
        lastNote: 'Subjective\n- Reported 4/10 knee pain after walking.',
        lastNoteDaysAgo: 7,
      },
    });
    expect(msg).toContain('=== PATIENT HISTORY — CONTEXT ONLY ===');
    expect(msg).toContain('=== END PATIENT HISTORY ===');
    expect(msg).toContain('NEVER restate, copy, list, or summarise previous findings');
    expect(msg).toContain('Not assessed this session');
    expect(msg).toContain('Rolling treatment summary (4 prior sessions):');
    expect(msg).toContain('Most recent prior note (7 days ago):');
    expect(msg).toContain('R knee OA');
    expect(msg).toContain('Reported 4/10 knee pain');
    // history precedes the transcript, transcript precedes the final instruction
    expect(msg.indexOf('END PATIENT HISTORY')).toBeLessThan(msg.indexOf(TRANSCRIPT));
    expect(msg.indexOf(TRANSCRIPT)).toBeLessThan(msg.indexOf('Generate the SOAP note.'));
  });

  it('includes a delimited prescription-changes block marked authoritative', () => {
    const msg = buildSoapUserMessage({
      transcript: TRANSCRIPT,
      programDiff: ['Squat with Barbell: 3×8 → 4×6; weight 20 → 25 kg', 'Added: Calf Raise with Dumbbells (3×12 @ 10 kg)'],
    });
    expect(msg).toContain('=== PRESCRIPTION CHANGES — EXACT ===');
    expect(msg).toContain('=== END PRESCRIPTION CHANGES ===');
    expect(msg).toContain('- Squat with Barbell: 3×8 → 4×6; weight 20 → 25 kg');
    expect(msg).toContain('- Added: Calf Raise with Dumbbells (3×12 @ 10 kg)');
    expect(msg).toContain('these recorded values are authoritative');
    // changes precede the transcript
    expect(msg.indexOf('END PRESCRIPTION CHANGES')).toBeLessThan(msg.indexOf(TRANSCRIPT));
  });

  it('omits the prescription-changes block for an empty diff', () => {
    const msg = buildSoapUserMessage({ transcript: TRANSCRIPT, programDiff: [] });
    expect(msg).not.toContain('PRESCRIPTION CHANGES');
  });

  it('handles summary-only and note-only history, with singular/same-day wording', () => {
    const summaryOnly = buildSoapUserMessage({
      transcript: TRANSCRIPT,
      priorContext: { summary: 'Initial presentation.', sessionCount: 1 },
    });
    expect(summaryOnly).toContain('Rolling treatment summary (1 prior session):');
    expect(summaryOnly).not.toContain('Most recent prior note');

    const noteOnly = buildSoapUserMessage({
      transcript: TRANSCRIPT,
      priorContext: { lastNote: 'Prior note text.', lastNoteDaysAgo: 0 },
    });
    expect(noteOnly).toContain('Most recent prior note (earlier today):');
    expect(noteOnly).not.toContain('Rolling treatment summary');

    const oneDay = buildSoapUserMessage({
      transcript: TRANSCRIPT,
      priorContext: { lastNote: 'Prior note text.', lastNoteDaysAgo: 1 },
    });
    expect(oneDay).toContain('(1 day ago)');
  });
});
