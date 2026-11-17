export async function connectGuest({ guest, code, audio, signal, onStatus, onBusy, onClose }) {
  const peer = new RTCPeerConnection();
  const channel = peer.createDataChannel('oai-events');
  let stream;
  let closed = false;
  let startedAt = 0;
  let commitTimer;
  let sessionTimer;

  function close() {
    if (closed) return;
    closed = true;
    clearTimeout(sessionTimer);
    clearTimeout(commitTimer);
    stream?.getTracks().forEach(track => track.stop());
    peer.close();
    audio.srcObject = null;
    onClose();
  }

  const send = (type, details = {}) => channel.send(JSON.stringify({ type, ...details }));
  const prompt = instructions => send('response.create', { response: { instructions } });
  signal.addEventListener('abort', close, { once: true });

  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true } });
    if (closed) {
      stream.getTracks().forEach(track => track.stop());
      return;
    }
    const track = stream.getAudioTracks()[0];
    track.enabled = false;
    peer.addTrack(track, stream);
    peer.ontrack = event => {
      audio.srcObject = event.streams[0];
      audio.play().catch(() => {
        audio.classList.remove('remote');
        audio.controls = true;
        onStatus('Use the audio player to hear the guest.');
      });
    };

    channel.onmessage = ({ data }) => {
      const event = JSON.parse(data);
      if (event.type === 'input_audio_buffer.committed') send('response.create');
      if (event.type === 'response.done' && event.response.status !== 'completed') {
        onBusy(false);
        onStatus('The guest could not reply. Try again.');
      }
      if (event.type === 'output_audio_buffer.stopped') {
        onBusy(false);
        onStatus('Your turn. Start speaking when you’re ready.');
      }
      if (event.type === 'error') {
        onBusy(false);
        onStatus('Try again and speak for at least a moment before ending your turn.');
      }
    };

    peer.addEventListener('connectionstatechange', () => {
      if (['failed', 'disconnected'].includes(peer.connectionState)) {
        close();
        onStatus('Connection lost. Reconnect or use the scripted demo.');
      }
    });

    const ready = new Promise(resolve => {
      channel.addEventListener('open', resolve, { once: true });
      channel.addEventListener('close', resolve, { once: true });
      signal.addEventListener('abort', resolve, { once: true });
    });
    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    const response = await fetch('/api/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/sdp', 'X-Mixer-Code': code, 'X-Mixer-Guest': String(guest) },
      body: offer.sdp,
      signal
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || 'Live voice is unavailable. Try the scripted demo.');
    }
    await peer.setRemoteDescription({ type: 'answer', sdp: await response.text() });
    sessionTimer = setTimeout(() => {
      close();
      onStatus('This guest session ended. Reconnect to continue.');
    }, 4 * 60_000);
    await ready;
    if (closed) return;
    if (channel.readyState !== 'open') throw new Error('The voice connection closed. Try again.');

    onBusy(true);
    onStatus('The guest is saying hello…');
    prompt('Greet the learner, say only your first name, and ask what their name is. Use simple French.');

    return {
      close,
      start() {
        send('input_audio_buffer.clear');
        startedAt = performance.now();
        track.enabled = true;
      },
      stop() {
        track.enabled = false;
        if (performance.now() - startedAt < 300) {
          onBusy(false);
          onStatus('Start speaking again and allow enough time to say a phrase.');
          return;
        }
        commitTimer = setTimeout(() => {
          if (!closed) send('input_audio_buffer.commit');
        }, 250);
      },
      repeat(slower) {
        prompt(slower ? 'Repeat or rephrase your last reply in simpler French with deliberate pauses.' : 'Repeat your last reply slowly in French.');
      }
    };
  } catch (error) {
    close();
    if (signal.aborted) return;
    if (error.name === 'NotAllowedError') throw new Error('Microphone permission was denied. Allow access in your browser and retry.');
    throw error;
  }
}
