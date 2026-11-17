import { buildReflectionPdf } from './reflection-pdf.mjs';
import { canDos, guests, questions } from './curriculum.js';
import { requestFeedback } from './feedback.js';
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
const goalCues = new Map([
  [canDos[0], 'Greet the guest, introduce yourself, and say goodbye before you move on.'],
  [canDos[1], 'Find out which languages you and this guest both speak.'],
  [canDos[2], 'Share one detail about yourself and ask the guest about their work or family.'],
  [canDos[3], 'Practice asking for or giving a made-up phone number or email address.'],
  [canDos[4], 'Tell the guest one thing about another person you met.'],
  [canDos[5], 'Tell the guest one reason you’re learning French.'],
  [canDos[6], 'Mention a real or made-up event and tell the guest where and when it takes place.'],
  [canDos[7], 'If you miss a word or detail, ask the guest to repeat, slow down, or clarify.']
]);
let code;
let live;
let connection;
let recording;
let mic;
let audioBlob;
let audioUrl;
let reflectionUrl;
let recordTimer;
let feedbackRequest;
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
  screen.focus({ preventScroll: true });
  window.scrollTo({ top: 0, behavior: 'instant' });
}

function welcome() {
  screen.innerHTML = `
    <h1>Francophone<br>Social Mixer</h1>
    <p>Meet three French-speaking guests. Find someone you’d like to get to know better and two things you have in common.</p>
    <p><strong>Allow about 20 minutes.</strong> Each of the three live guest sessions lasts up to four minutes (up to 12 minutes total). The 20 minutes also includes choosing your goals, recording your final French voice note, and completing the Can-Do reflection.</p>
    <section class="card" aria-labelledby="ai-notice">
      <h2 id="ai-notice">Using AI in this activity</h2>
      <p>The live guests use OpenAI. What you say during a live conversation is sent to OpenAI to generate the guest’s replies. AI can make mistakes or misunderstand your French. If a reply or suggestion seems wrong, check with your instructor.</p>
      <p>You may use your first name or a made-up name. Keep your last name and other identifying details private. If you practice giving a street address, phone number, or email address, make it up.</p>
      <p><strong>What your instructor can access:</strong> Your instructor can listen to your final French voice note and read your written reflection after you submit those files through Matrix or as directed in class. The mixer does not give your instructor recordings or transcripts of your three live guest conversations.</p>
    </section>
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
    <p>You may use your first name. Leave out your last name and use made-up contact details when you speak or take notes.</p>
    <section class="card" aria-labelledby="goal-heading">
      <h2 id="goal-heading">Your mixer goals</h2>
      <ul id="goal-list"></ul>
    </section>
    <div class="card" id="conversation"></div>
    <section class="card" aria-labelledby="phrase-bank">
      <h2 id="phrase-bank">French phrase bank</h2>
      <h3>Ask for clarification or repetition</h3>
      <p>Try one of these aloud if you need help understanding the guest.</p>
      <ul>
        <li><strong lang="fr">Je ne comprends pas.</strong> (I don’t understand.)</li>
        <li><strong lang="fr">Vous pouvez répéter, s’il vous plaît ?</strong> (Could you repeat that, please?)</li>
        <li><strong lang="fr">Vous pouvez parler plus lentement ?</strong> (Could you speak more slowly?)</li>
        <li><strong lang="fr">Que signifie … ?</strong> (What does … mean?)</li>
        <li><strong lang="fr">Vous avez dit … ?</strong> (Did you say …?)</li>
      </ul>
      <h3>Build your own question</h3>
      <p>Choose one or two topics you’re curious about. Use the French words or sentence starter to make your own question aloud. If you already know the answer, choose a different topic.</p>
      <ul>
        <li><strong>Origin</strong> <span lang="fr">D’où … ?</span> · <span lang="fr">venir, pays, ville</span></li>
        <li><strong>Languages</strong> <span lang="fr">Quelles langues … ?</span> · <span lang="fr">parler</span></li>
        <li><strong>Work</strong> <span lang="fr">Où … ? / Quelle … ?</span> · <span lang="fr">travailler, profession</span></li>
        <li><strong>Interests</strong> <span lang="fr">Qu’est-ce que … ?</span> · <span lang="fr">aimer, faire</span></li>
        <li><strong>Learning a language</strong> <span lang="fr">Pourquoi … ?</span> · <span lang="fr">apprendre, une langue</span></li>
      </ul>
    </section>
    <p>Say hello, ask one or two short questions toward the end, and say goodbye.</p>
    <div class="card">
      <label for="notes">Your notes (optional)</label>
      <p id="notes-help">If you discover something you have in common with this guest, write it in the box below. After you meet all three guests, your notes can help you choose whom you’d like to get to know better and name two things you have in common in your final French voice note.</p>
      <textarea id="notes" aria-describedby="notes-help" rows="2" maxlength="600" placeholder="What do you have in common?"></textarea>
    </div>
    <button id="next" disabled>${step === guests.length ? 'Voice note & reflection' : 'Meet the next guest'}</button>`;
  selectedGoals.forEach(goal => {
    const item = document.createElement('li');
    const title = document.createElement('strong');
    title.textContent = goal;
    const cue = document.createElement('p');
    cue.textContent = 'Try this: ' + goalCues.get(goal);
    item.append(title, cue);
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
    let line = 'Bonjour ! Je m’appelle ' + guest.name + '. Je vous écoute.';
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
      line = 'Bonjour ! Je m’appelle ' + guest.name + '. Je vous écoute.';
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
    <p>Connect and answer three short questions from the guest, starting with your name. When the guest says « À vous ! », ask one or two short questions of your own. Use Start speaking and Finish speaking for each turn. Your microphone audio is sent to OpenAI during live conversation.</p>
    <p>You have up to four minutes with this guest once you connect, including any pauses. Move on when you’re ready. If the guest asks you to repeat, try saying it more slowly or using simpler words.</p>
    <button id="connect">Connect microphone</button>
    <button id="demo" class="secondary" hidden>Use scripted demo</button>
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
    el('demo').hidden = true;
    status.textContent = 'Connecting…';
    connection = new AbortController();
    const timeout = setTimeout(() => {
      connection?.abort();
      if (step === shownStep && el('demo')) {
        el('demo').hidden = false;
        status.textContent = 'Connection timed out. Retry or use the scripted demo.';
      }
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
        onClose: (connectionLost) => {
          const button = el('connect');
          if (step !== shownStep || !button) return;
          live = null;
          busy = false;
          talking = false;
          button.hidden = false;
          button.disabled = false;
          if (connectionLost) el('demo').hidden = false;
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
      if (step === shownStep && el('demo')) {
        el('demo').hidden = false;
        status.textContent = error.message;
      }
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
    <section class="card" aria-labelledby="guest-review-title">
      <h2 id="guest-review-title">Guests you met</h2>
      <ul id="notes-list"></ul>
    </section>
    <form id="final">
      <div class="card">
        <h2>French voice note</h2>
        <p>You have up to one minute to record. In French, name the guest you’d like to get to know better and say two things you have in common.</p>
        <p>You may use your first name. Leave out your last name and any real street address, phone number, or email address.</p>
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
        <label for="reflection">Describe one specific moment when you used this skill. Write in English or French. Leave out last names and real contact details.</label>
        <textarea id="reflection" rows="3" maxlength="800" required></textarea>
        <small>Example: I asked a guest to repeat where she was from, and I understood her the second time.</small>
        <label for="next-goal">What’s one thing you’d like to try next? (optional)</label>
        <input id="next-goal" maxlength="150">
      </div>
      <div class="actions">
        <button id="finish" type="submit">Prepare files for my instructor</button>
      </div>
    </form>
    <div class="card" id="feedback" hidden>
      <h2>Two suggestions for your spoken French</h2>
      <p>Optional. Check that your recording leaves out last names and real contact details. If you ask for AI feedback, OpenAI receives your voice note and selected Can-Do. We don’t send your guest notes or written reflection. AI can make mistakes. Check with your instructor if a suggestion seems wrong.</p>
      <label id="feedback-code-label" for="feedback-code" hidden>Class access code</label>
      <input id="feedback-code" type="password" maxlength="150" hidden>
      <button id="get-feedback" type="button">Get AI feedback</button>
      <p id="feedback-status" role="status"></p>
      <ol id="feedback-suggestions"></ol>
    </div>
    <div class="card" id="delivery" hidden>
      <h2>Share with your instructor</h2>
      <p>Download your final French voice note and written reflection and submit them through Matrix or as directed in class. Once you share them, your instructor can listen to the voice note and read your reflection to give you feedback. The mixer does not share recordings or transcripts of your guest conversations with your instructor.</p>
      <div class="actions"><a class="download" id="voice-file">Download voice note</a><a class="download" id="reflection-file">Download reflection (PDF)</a></div>
    </div>`;
  guests.forEach((guest, index) => {
    const entry = notes.get(index + 1)?.trim();
    const item = document.createElement('li');
    const name = document.createElement('strong');
    name.textContent = guest.name;
    item.append(name);
    if (entry) item.append(' — ' + entry);
    el('notes-list').append(item);
  });
  el('record').onclick = recordVoice;
  el('final').oninput = resetDelivery;
  el('feedback-code-label').hidden = Boolean(code);
  el('feedback-code').hidden = Boolean(code);
  el('get-feedback').onclick = showFeedback;
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
    resetDelivery();
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
  reflectionUrl = URL.createObjectURL(buildReflectionPdf({
    goals: selectedGoals,
    canDo: el('can-do').value,
    reflection: el('reflection').value.trim(),
    nextGoal: el('next-goal').value.trim()
  }));
  el('voice-file').href = audioUrl;
  el('voice-file').download = 'mixer-voice-note.' + extension;
  el('reflection-file').href = reflectionUrl;
  el('reflection-file').download = 'mixer-reflection.pdf';
  el('delivery').hidden = false;
  el('feedback').hidden = false;
  el('get-feedback').focus();
}

function resetDelivery() {
  feedbackRequest?.abort();
  feedbackRequest = undefined;
  el('feedback').hidden = true;
  el('delivery').hidden = true;
  el('get-feedback').disabled = false;
  el('feedback-status').textContent = '';
  el('feedback-suggestions').replaceChildren();
}

async function showFeedback() {
  const accessCode = code || el('feedback-code').value.trim();
  const message = el('feedback-status');
  const button = el('get-feedback');
  if (!accessCode) {
    message.textContent = 'Enter your class access code to get AI feedback.';
    el('feedback-code').focus();
    return;
  }
  const request = new AbortController();
  feedbackRequest = request;
  button.disabled = true;
  message.textContent = 'Preparing two suggestions…';
  try {
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(35000)]);
    const suggestions = await requestFeedback(audioBlob, canDos.indexOf(el('can-do').value), accessCode, signal);
    if (request.signal.aborted) return;
    for (const suggestion of suggestions) {
      const item = document.createElement('li');
      item.textContent = suggestion;
      el('feedback-suggestions').append(item);
    }
    message.textContent = 'Your two suggestions are ready.';
  } catch (error) {
    if (request.signal.aborted) return;
    message.textContent = ['EncodingError', 'NotSupportedError', 'ReferenceError'].includes(error.name)
      ? 'This browser could not prepare the recording for feedback. You can still download your work.'
      : error.name === 'TimeoutError' ? 'Feedback timed out. Try again or download your work.' : error.message;
    button.disabled = false;
  } finally {
    if (feedbackRequest === request) feedbackRequest = undefined;
  }
}

restart.onclick = () => {
  if (!window.confirm('Start over and clear this session?')) return;
  feedbackRequest?.abort();
  feedbackRequest = undefined;
  code = undefined;
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

window.addEventListener('pagehide', () => {
  clearMedia();
  feedbackRequest?.abort();
});
window.speechSynthesis?.getVoices();
draw();
