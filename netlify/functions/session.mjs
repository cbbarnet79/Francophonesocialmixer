import { createHash, timingSafeEqual } from 'node:crypto';
import { guests } from '../../public/curriculum.js';

export const config = { path: '/api/session' };
const hash = value => createHash('sha256').update(value).digest();
const problem = (status, error) => Response.json({ error }, { status, headers: { 'Cache-Control': 'no-store' } });

function instructions({ name, origin, languages, job, interests, reason }) {
  return `You are ${name}, a fictional guest at a Francophone social mixer. Your fixed facts: from ${origin}, speak ${languages}, work as ${job}, enjoy ${interests}, study English ${reason}. Reveal details only through the conversation. Never invent or change these facts. Use respectful, natural French with vouvoiement suitable for adult Novice Low learners, including ages 16 and up. Use one or two short sentences, slow clear speech, and at most one simple question per turn. Give learners space to lead. Accept short replies and fictional details. If speech is unclear, ask for repetition instead of guessing. If asked, repeat, slow down with pauses, or rephrase in simpler French. If addressed in English, offer a short French way to ask or answer and continue in French. Stay in character and on the mixer’s familiar topics. Avoid asking for or repeating sensitive personal details or contact information. Do not evaluate performance, provide a grade, or choose a guest for the learner.`;
}

export default async function handler(request) {
  if (request.method !== 'POST') return problem(405, 'Use POST.');
  const getSetting = key => (globalThis.Netlify?.env?.get(key) || process.env[key] || '').trim();
  const openaiKey = getSetting('OPENAI_API_KEY');
  const classCode = getSetting('MIXER_CLASS_CODE');
  const missing = [!openaiKey && 'OPENAI_API_KEY', !classCode && 'MIXER_CLASS_CODE'].filter(Boolean);
  if (missing.length) {
    return problem(503, 'Live voice setup is incomplete. Check ' + missing.join(' and ') + ' in Netlify and redeploy.');
  }
  if (!timingSafeEqual(hash(request.headers.get('X-Mixer-Code') || ''), hash(classCode))) {
    return problem(403, 'That class access code is incorrect.');
  }
  const guestIndex = request.headers.get('X-Mixer-Guest') || '';
  const guest = /^[0-9]$/.test(guestIndex) ? guests[Number(guestIndex)] : undefined;
  const sdp = await request.text();
  if (!guest || !sdp.startsWith('v=0') || sdp.length > 64_000) {
    return problem(400, 'The voice connection request was invalid.');
  }
  const body = new FormData();
  body.set('sdp', sdp);
  body.set('session', JSON.stringify({
    type: 'realtime',
    model: 'gpt-realtime-2.1',
    instructions: instructions(guest),
    audio: {
      input: { turn_detection: null },
      output: { voice: guest.voice, speed: 0.8 }
    }
  }));
  try {
    const response = await fetch('https://api.openai.com/v1/realtime/calls', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + openaiKey },
      body,
      signal: AbortSignal.timeout(20000)
    });
    if (!response.ok) {
      const detail = response.status === 429
        ? 'OpenAI returned 429. Ask your instructor to check API billing and limits, or use the demo.'
        : 'Live voice could not start (OpenAI status ' + response.status + '). Try the demo or ask your instructor.';
      console.error('Realtime connection failed', { status: response.status, requestId: response.headers.get('x-request-id') });
      return problem(502, detail);
    }
    return new Response(await response.text(), {
      headers: { 'Content-Type': 'application/sdp', 'Cache-Control': 'no-store' }
    });
  } catch (error) {
    console.error('Realtime connection failed', { type: error.name });
    return problem(503, 'Live voice is temporarily unavailable. Retry or use the scripted demo.');
  }
}
