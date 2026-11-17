// Decode the browser's recording format and send only a short, mono WAV.
export async function requestFeedback(recording, canDo, code, signal) {
  const sampleRate = 16000;
  const decoder = new OfflineAudioContext(1, 1, sampleRate);
  const audio = await decoder.decodeAudioData(await recording.arrayBuffer());
  const length = Math.min(audio.length, sampleRate * 60);
  const wav = new ArrayBuffer(44 + length * 2);
  const view = new DataView(wav);
  function tag(offset, text) {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  }
  tag(0, 'RIFF');
  view.setUint32(4, wav.byteLength - 8, true);
  tag(8, 'WAVEfmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  tag(36, 'data');
  view.setUint32(40, length * 2, true);
  const samples = audio.getChannelData(0);
  for (let i = 0; i < length; i++) {
    const sample = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, sample * (sample < 0 ? 32768 : 32767), true);
  }

  const response = await fetch('/api/feedback', {
    method: 'POST',
    headers: { 'Content-Type': 'audio/wav', 'X-Mixer-Code': code, 'X-Mixer-Can-Do': String(canDo) },
    body: wav,
    signal
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error);
  return result.suggestions;
}
