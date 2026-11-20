export function microphoneMessage(error) {
  const messages = {
    NotAllowedError: 'Microphone access is blocked. Allow it in your browser’s site permissions, then retry.',
    NotFoundError: 'No microphone was found. Connect or select a microphone, then retry.',
    NotReadableError: 'The microphone could not start. Check your device settings or close other apps using it, then retry.'
  };
  return messages[error.name] || error.message;
}

function isClarificationRequest(transcript) {
  const words = transcript.toLowerCase().normalize('NFD')
    .replace(/\p{M}/gu, '').replace(/[’']/g, ' ');
  return /^\s*comment[?!.\s]*$/i.test(words) || /\b(repet(?:e[rz]?|ition)|plus (?:lentement|doucement|simplement)|moins vite|je (?:ne )?comprends pas|j ai pas compris|je n ai pas compris|(?:que|qu est ce que) (?:signifie|veut dire)|ca veut dire quoi|ca signifie quoi|vous avez dit|reformul(?:er|ez)|clarifi(?:er|ez)|(?:pouvez|pourriez) (?:vous )?expliquer)\b/.test(words);
}

export async function connectGuest({ guest, guestName, code, audio, signal, onStatus, onBusy, onClose, onReplyHelp }) {
  if (!navigator.mediaDevices?.getUserMedia || !window.RTCPeerConnection) {
    throw new Error('Live voice needs an up-to-date browser with microphone access over HTTPS.');
  }
  const peer = new RTCPeerConnection();
  const channel = peer.createDataChannel('oai-events');
  let stream;
  let closed = false;
  let startedAt = 0;
  let commitTimer;
  let sessionTimer;
  const turns = [{ repair: false }];
  let latestReply = '';
  let replyFinished = false;

  function offerReply() {
    let repairs = 0;
    for (let i = turns.length - 1; i >= 0 && turns[i].repair === true; i--) repairs++;
    onReplyHelp(replyFinished && repairs >= 2 ? latestReply : '');
  }

  function beginReply(turn) {
    turns.push(turn);
    latestReply = '';
    replyFinished = false;
    offerReply();
  }

  function close(connectionLost = false) {
    if (closed) return;
    closed = true;
    clearTimeout(sessionTimer);
    clearTimeout(commitTimer);
    stream?.getTracks().forEach(track => track.stop());
    peer.close();
    audio.srcObject = null;
    onClose(connectionLost);
  }

  const send = (type, details = {}) => channel.send(JSON.stringify({ type, ...details }));
  function prompt(text, repair = false) {
    if (repair) beginReply({ repair: true });
    send('conversation.item.create', {
      item: { type: 'message', role: 'user', content: [{ type: 'input_text', text }] }
    });
    send('response.create');
  }
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
      if (closed) return;
      if (event.type === 'input_audio_buffer.committed') {
        beginReply({ itemId: event.item_id });
        send('response.create');
      }
      if (event.type === 'conversation.item.input_audio_transcription.completed') {
        const turn = turns.find(turn => turn.itemId === event.item_id);
        if (turn) {
          turn.repair = isClarificationRequest(event.transcript);
          offerReply();
        }
      }
      if (event.type === 'response.done') {
        if (event.response.status === 'completed') {
          latestReply = event.response.output.flatMap(item => item.content || [])
            .filter(part => part.type === 'audio' || part.type === 'output_audio')
            .map(part => part.transcript).filter(Boolean).join(' ').trim();
        } else {
          turns[turns.length - 1].repair = false;
          onBusy(false);
          onStatus('The guest could not reply. Try again.');
        }
      }
      if (event.type === 'output_audio_buffer.stopped') {
        replyFinished = true;
        offerReply();
        onBusy(false);
        onStatus('Your turn. Start speaking when you’re ready.');
      }
      if (event.type === 'error') {
        turns[turns.length - 1].repair = false;
        latestReply = '';
        offerReply();
        onBusy(false);
        onStatus('Try again and speak for at least a moment before ending your turn.');
      }
    };

    peer.addEventListener('connectionstatechange', () => {
      if (['failed', 'disconnected'].includes(peer.connectionState)) {
        close(true);
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
    prompt(`Start the mixer as ${guestName}. Say exactly: « Bonjour ! Je m’appelle ${guestName}. » Then model the first three letters of your last name using French letter names and ask: « Vous voulez toutes les lettres ? Oui ou non ? »`);

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
        prompt(slower ? 'Repeat or rephrase your last reply in simpler French with deliberate pauses.' : 'Repeat your last reply slowly in French.', true);
      }
    };
  } catch (error) {
    close();
    if (signal.aborted) return;
    throw new Error(microphoneMessage(error));
  }
}
