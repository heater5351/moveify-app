/**
 * AWS Transcribe Streaming service for Scribe.
 * Audio processed in ap-southeast-2 (Sydney). PHI stays in Australia.
 */
const { TranscribeStreamingClient, StartStreamTranscriptionCommand } = require('@aws-sdk/client-transcribe-streaming');

const client = new TranscribeStreamingClient({ region: 'ap-southeast-2' });

/**
 * Create a live AWS Transcribe streaming session.
 *
 * Returns synchronously so audio can be queued immediately — the AWS
 * connection establishes in parallel. This avoids the "no audio" timeout
 * that occurs when client.send() is awaited before any audio flows.
 *
 * @param {object} options
 * @param {function} options.onTranscript - Called with { text, isFinal, speaker }
 * @param {function} options.onError - Called on error
 * @param {function} options.onClose - Called when stream ends
 * @returns {{ send: function, close: function }}
 */
function createLiveTranscription({ onTranscript, onError, onClose, onAudioChunk }) {
  const queue = [];
  let ended = false;
  let notify = null;

  async function* audioGenerator() {
    while (!ended || queue.length > 0) {
      while (queue.length > 0) {
        const chunk = queue.shift();
        if (onAudioChunk) onAudioChunk(chunk);
        yield { AudioEvent: { AudioChunk: chunk } };
      }
      if (!ended) {
        await new Promise(r => { notify = r; });
      }
    }
  }

  const command = new StartStreamTranscriptionCommand({
    LanguageCode: 'en-AU',
    MediaEncoding: 'pcm',
    MediaSampleRateHertz: 16000,
    ShowSpeakerLabel: true,
    AudioStream: audioGenerator(),
  });

  // Start the connection in background — don't await so audio can queue immediately
  client.send(command).then(response => {
    console.log('AWS Transcribe connected');
    (async () => {
      try {
        for await (const event of response.TranscriptResultStream) {
          if (!event.TranscriptEvent) continue;
          const results = event.TranscriptEvent.Transcript?.Results || [];
          for (const result of results) {
            const alt = result.Alternatives?.[0];
            const text = alt?.Transcript || '';
            if (!text) continue;
            onTranscript({ text, isFinal: !result.IsPartial, speaker: alt?.Items?.[0]?.Speaker ?? null });
          }
        }
      } catch (err) {
        console.error('AWS Transcribe stream error:', { name: err.name, message: err.message, status: err.$metadata?.httpStatusCode });
        if (onError) onError(err);
      } finally {
        if (onClose) onClose();
      }
    })();
  }).catch(err => {
    console.error('AWS Transcribe connect error:', { name: err.name, message: err.message, status: err.$metadata?.httpStatusCode });
    if (onError) onError(err);
  });

  return {
    send(audioBuffer) {
      queue.push(Buffer.isBuffer(audioBuffer) ? audioBuffer : Buffer.from(audioBuffer));
      if (notify) { notify(); notify = null; }
    },
    close() {
      ended = true;
      if (notify) { notify(); notify = null; }
    },
  };
}

module.exports = { createLiveTranscription };
