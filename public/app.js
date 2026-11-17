import { canDos, guests, questions } from './curriculum.js';
import { connectGuest, microphoneMessage } from './live.js';

const screen = document.querySelector('#screen');
const progress = document.querySelector('#progress');
const restart = document.querySelector('#restart');
const status = document.querySelector('#status');
const el = id => document.getElementById(id);
let step = 0;
let mode;
let selectedGoals = [];
const goalLimit = 3;
let code;
let live;
let connection;
let recording;
let mic;
let audioBlob;
let audioUrl;
let reflectionUrl;
let recordTimer;
const notes = new Map();

function clearMedia() {
  connection?.abort();
  connection = null;
  live?.close();
  live = null;
  window.speechSynthesis?.cancel();
}

function draw() {
  clearMedia();
  status.textContent = '';
  restart.hidden = step === 0;
  progress.innerHTML = ['Choose goals', 'Meet the guests', 'Voice note & reflection']
    .map((label, index) => '<li' + (index === (step === 0 ? 0 : step <= guests.length ? 1 : 2)
      ? ' aria-current="step"' : '') + '>' + label + '</li>').join('');
  if (step === 0) welcome();
  else if (step <= guests.length) guestScreen();
  else finalScreen();
  screen.focus();
}

function welcome() {
  screen.innerHTML = `
    <h1>Francophone<br>Social Mixer</h1>
    <p>Meet three French-speaking guests. Find someone you’d like to get to know better and two things you have in common.</p>
    <p>Introduce yourself in French. You can make up personal details.</p>
    <form id="welcome">
      <fieldset aria-describedby="goal-instructions">
        <legend>What would you like to work on most?</legend>
        <p id="goal-instructions">These Can-Do statements describe skills you’ve practiced in French Beginner 1. Select up to three to focus on during the mixer.</p>
        ${canDos.map((item, i) => `<label class="choice"><input name="goal" type="checkbox" value="${i}"><span>${item}</span></label>`).join('')}
        <p id="goal-count" role="status">0 of ${goalLimit} selected</p>
      </fieldset>
      <label for="mode">Conversation mode</label>
      <select id="mode"><option value="live" selected>Live French voice</option><option value="demo">Scripted demo</option></select>
      <label id="pilot">Class access code<input id="code" type="password" maxlength="150" required></label>
      <button type="submit">Meet the first guest</button>
    </form>`;
  el('mode').onchange = () => {
    const isLive = el('mode').value === 'live';
    el('pilot').hidden = !isLive;
    el('code').required = isLive;
  };
  const form = el('welcome');
  const choices = [...form.querySelectorAll('input[name="goal"]')];
  form.addEventListener('change', event => {
    if (event.target.name !== 'goal') return;
    const count = choices.filter(choice => choice.checked).length;
    choices.forEach(choice => {
      choice.disabled = count >= goalLimit && !choice.checked;
    });
    el('goal-count').textContent = count + ' of ' + goalLimit + ' selected';
    status.textContent = '';
  });
  form.onsubmit = event => {
    event.preventDefault();
    const checked = choices.filter(choice => choice.checked);
    if (!checked.length || checked.length > goalLimit) {
      status.textContent = 'Select one to three Can-Do statements before continuing.';
      choices[0].focus();
      return;
    }
    selectedGoals = checked.map(choice => canDos[Number(choice.value)]);
    mode = el('mode').value;
    code = el('code').value.trim();
    step = 1;
    draw();
  };
}

function speak(line, rate) {
  const engine = window.speechSynthesis;
  const voices = engine?.getVoices().filter(item => /^fr(?:-|$)/i.test(item.lang)) || [];
  const voice = voices.find(item => item.localService) || voices[0];
  if (!engine || !window.SpeechSynthesisUtterance) {
    status.textContent = 'This browser cannot play scripted speech. The French reply is shown on screen.';
    return;
  }
  const utterance = new SpeechSynthesisUtterance(line);
  if (voice) utterance.voice = voice;
  utterance.lang = voice?.lang || 'fr-FR';
  utterance.onerror = ({ error }) => {
    if (error === 'canceled' || error === 'interrupted') return;
    status.textContent = 'French speech could not play in this browser. Use live voice or enable a French text-to-speech voice in your device settings.';
  };
  utterance.rate = rate;
  status.textContent = '';
  engine.cancel();
  engine.speak(utterance);
}

function guestScreen() {
  const guest = guests[step - 1];
  const shownStep = step;
  let canContinue = false;
  let talking = false;
  let busy = false;
  screen.innerHTML = `
    <small>Guest ${step} of ${guests.length}</small>
    <h1 lang="fr">${guest.name}</h1>
    <p>Your mixer goals</p>
    <ul id="goal-list"></ul>
    <div class="card" id="conversation"></div>
    <div class="card"><label for="notes">Your notes (optional)</label>
      <textarea id="notes" rows="2" maxlength="600" placeholder="What might you have in common?"></textarea>
    </div>
    <button id="next" disabled>${step === guests.length ? 'Voice note & reflection' : 'Meet the next guest'}</button>`;
  selectedGoals.forEach(goal => {
    const item = document.createElement('li');
    item.textContent = goal;
    el('goal-list').append(item);
  });
  el('notes').value = notes.get(shownStep) || '';
  el('notes').oninput = () => notes.set(shownStep, el('notes').value);
  el('next').onclick = () => {
    step += 1;
    draw();
  };
  function unlock() {
    canContinue = true;
    el('next').disabled = false;
  }

  if (mode === 'demo') {
    let line = 'Bonjour ! Je m’appelle ' + guest.name + '. Et vous ?';
    el('conversation').innerHTML = `
      <p>Say your introduction or question aloud, then use the buttons to hear a scripted reply.</p>
      <button id="greet" class="secondary">Hear the greeting</button>
      <label for="question">Choose a question</label>
      <select id="question" lang="fr">${questions.map(([q], i) => `<option value="${i}">${q}</option>`).join('')}</select>
      <button id="ask">Hear the answer</button>
      <p id="reply" class="reply" lang="fr" hidden></p>
      <div class="actions"><button id="again" class="secondary" disabled>Repeat</button><button id="slower" class="secondary" disabled>Slower</button></div>`;
    function play(rate) {
      el('reply').hidden = false;
      el('reply').textContent = line;
      el('again').disabled = false;
      el('slower').disabled = false;
      speak(line, rate);
    }
    el('greet').onclick = () => {
      line = 'Bonjour ! Je m’appelle ' + guest.name + '. Et vous ?';
      play(.84);
    };
    el('ask').onclick = () => {
      line = questions[Number(el('question').value)][1](guest);
      play(.84);
      unlock();
    };
    el('again').onclick = () => play(.84);
    el('slower').onclick = () => play(.66);
    return;
  }

  el('conversation').innerHTML = `
    <p>Connect, then start and end each speaking turn when you’re ready. Your microphone audio is sent to OpenAI during live conversation.</p>
    <button id="connect">Connect microphone</button>
    <button id="demo" class="secondary">Use scripted demo</button>
    <audio id="guest-audio" class="remote" autoplay playsinline></audio>
    <div class="actions" id="voice-actions" hidden>
      <button id="turn" disabled>Start speaking</button>
      <button id="again" class="secondary" disabled>Repeat</button>
      <button id="slower" class="secondary" disabled>Slower / simpler</button>
    </div>`;
  function updateButtons() {
    el('turn').disabled = !live || busy;
    el('again').disabled = !live || busy || talking;
    el('slower').disabled = !live || busy || talking;
    el('turn').textContent = talking ? 'Finish speaking' : 'Start speaking';
    el('next').disabled = !canContinue || talking || busy;
  }
  el('demo').onclick = () => {
    mode = 'demo';
    draw();
  };
  el('connect').onclick = async () => {
    el('connect').disabled = true;
    status.textContent = 'Connecting…';
    connection = new AbortController();
    const timeout = setTimeout(() => {
      connection?.abort();
      if (step === shownStep) status.textContent = 'Connection timed out. Retry or use the scripted demo.';
    }, 28_000);
    try {
      const session = await connectGuest({
        guest: step - 1, guestName: guest.name, code, audio: el('guest-audio'), signal: connection.signal,
        onStatus: value => { if (step === shownStep) status.textContent = value; },
        onBusy: value => {
          if (step !== shownStep || !el('connect')) return;
          busy = value;
          updateButtons();
        },
        onClose: () => {
          const button = el('connect');
          if (step !== shownStep || !button) return;
          live = null;
          busy = false;
          talking = false;
          button.hidden = false;
          button.disabled = false;
          el('voice-actions').hidden = true;
          updateButtons();
        }
      });
      if (!session || step !== shownStep || !el('connect')) return;
      live = session;
      el('connect').hidden = true;
      el('voice-actions').hidden = false;
      updateButtons();
    } catch (error) {
      if (step === shownStep) status.textContent = error.message;
    } finally {
      clearTimeout(timeout);
    }
  };
  el('turn').onclick = () => {
    talking = !talking;
    if (talking) {
      live.start();
      status.textContent = 'Listening…';
    } else {
      busy = true;
      canContinue = true;
      live.stop();
      if (busy) status.textContent = 'Waiting for the guest…';
    }
    updateButtons();
  };
  for (const id of ['again', 'slower']) {
    el(id).onclick = () => {
      busy = true;
      updateButtons();
      live.repeat(id === 'slower');
    };
  }
}

function finalScreen() {
  screen.innerHTML = `
    <h1>Who would you like to meet again?</h1>
    <details id="notes-review" class="card" hidden><summary>Your guest notes</summary><div id="notes-list"></div></details>
    <form id="final">
      <div class="card">
        <h2>French voice note</h2>
        <p>Name the guest you’d like to get to know better and say two things you have in common.</p>
        <p lang="fr">Je choisis… Moi aussi, … Moi aussi, …</p>
        <button id="record" type="button">Record voice note</button>
        <audio id="playback" controls hidden></audio>
      </div>
      <div class="card">
        <h2>Can-Do reflection</h2>
        <p>What did you do in French during the mixer that you feel more confident doing now?</p>
        <label for="can-do">Choose one French Beginner 1 Can-Do statement</label>
        <select id="can-do" required><option value="">Select a skill</option>
          ${canDos.map(item => `<option value="${item}">${item}${selectedGoals.includes(item) ? " (starting goal)" : ""}</option>`).join('')}
        </select>
        <label for="reflection">Describe one specific moment when you used this skill. Write in English or French.</label>
        <textarea id="reflection" rows="3" maxlength="800" required></textarea>
        <small>Example: I asked a guest to repeat where she was from, and I understood her the second time.</small>
        <label for="next-goal">What’s one thing you’d like to try next? (optional)</label>
        <input id="next-goal" maxlength="150">
      </div>
      <div class="actions">
        <button id="finish" type="submit">Prepare files for my instructor</button>
      </div>
    </form>
    <div class="card" id="delivery" hidden>
      <h2>Share with your instructor</h2>
      <p>Download both files and submit them together to your instructor through Matrix or as directed in class.</p>
      <div class="actions"><a class="download" id="voice-file">Download voice note</a><a class="download" id="reflection-file">Download reflection</a></div>
    </div>`;
  guests.forEach((guest, index) => {
    const entry = notes.get(index + 1)?.trim();
    if (!entry) return;
    const item = document.createElement('p');
    item.textContent = guest.name + ': ' + entry;
    el('notes-list').append(item);
    el('notes-review').hidden = false;
  });
  el('record').onclick = recordVoice;
  el('final').oninput = () => { el('delivery').hidden = true; };
  el('final').onsubmit = event => {
    event.preventDefault();
    if (!audioBlob?.size) {
      status.textContent = 'Record your French voice note first.';
      el('record').focus();
      return;
    }
    if (!el('reflection').value.trim()) {
      status.textContent = 'Describe one moment from the mixer to continue.';
      el('reflection').focus();
      return;
    }
    status.textContent = '';
    prepareDelivery();
  };
}

async function recordVoice() {
  const button = el('record');
  if (recording?.state === 'recording') {
    recording.stop();
    return;
  }
  button.disabled = true;
  el('finish').disabled = true;
  restart.disabled = true;
  try {
    if (!window.MediaRecorder || !navigator.mediaDevices) throw new Error('Use an up-to-date browser over HTTPS to record.');
    mic = await navigator.mediaDevices.getUserMedia({ audio: true });
    recording = new MediaRecorder(mic);
    const chunks = [];
    recording.ondataavailable = event => chunks.push(event.data);
    recording.onerror = () => { status.textContent = 'Recording failed. Try again.'; };
    recording.onstop = () => {
      clearTimeout(recordTimer);
      mic.getTracks().forEach(track => track.stop());
      mic = null;
      audioBlob = new Blob(chunks, { type: recording.mimeType });
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      audioUrl = URL.createObjectURL(audioBlob);
      el('playback').src = audioUrl;
      el('playback').hidden = false;
      button.textContent = 'Record again';
      restart.disabled = false;
      el('finish').disabled = false;
      status.textContent = 'Listen to your recording before submitting.';
    };
    el('delivery').hidden = true;
    recording.start();
    recordTimer = setTimeout(() => {
      if (recording.state === 'recording') recording.stop();
    }, 60_000);
    button.textContent = 'Stop recording';
    status.textContent = 'Recording…';
  } catch (error) {
    mic?.getTracks().forEach(track => track.stop());
    restart.disabled = false;
    el('finish').disabled = false;
    status.textContent = microphoneMessage(error);
  } finally {
    button.disabled = false;
  }
}

function prepareDelivery() {
  const mime = audioBlob.type.split(';')[0];
  const extension = mime === 'audio/mp4' ? 'm4a' : mime === 'audio/ogg' ? 'ogg' : 'webm';
  if (reflectionUrl) URL.revokeObjectURL(reflectionUrl);
  reflectionUrl = URL.createObjectURL(new Blob([
    'Mixer goals:\n' + selectedGoals.map(goal => '- ' + goal).join('\n') + '\n\nCan-Do: ' + el('can-do').value + '\n\n' + el('reflection').value.trim() + '\n',
    'Next goal: ' + el('next-goal').value.trim() + '\n'
  ], { type: 'text/plain' }));
  el('voice-file').href = audioUrl;
  el('voice-file').download = 'mixer-voice-note.' + extension;
  el('reflection-file').href = reflectionUrl;
  el('reflection-file').download = 'mixer-reflection.txt';
  el('delivery').hidden = false;
  el('voice-file').focus();
}

restart.onclick = () => {
  if (!window.confirm('Start over and clear this session?')) return;
  if (audioUrl) URL.revokeObjectURL(audioUrl);
  if (reflectionUrl) URL.revokeObjectURL(reflectionUrl);
  audioBlob = null;
  audioUrl = null;
  reflectionUrl = null;
  notes.clear();
  selectedGoals = [];
  step = 0;
  draw();
};

window.addEventListener('pagehide', clearMedia);
window.speechSynthesis?.getVoices();
draw();
