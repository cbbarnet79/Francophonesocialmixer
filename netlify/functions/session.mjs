import { createHash, timingSafeEqual } from 'node:crypto';
import { guests } from '../../public/curriculum.js';

export const config = { path: '/api/session' };
const hash = value => createHash('sha256').update(value).digest();
const problem = (status, error) => Response.json({ error }, { status, headers: { 'Cache-Control': 'no-store' } });

const firstFollowUps = {
  Samira: '« Vous parlez quelles langues ? » (languages)',
  Louis: '« Vous venez d’où ? » (origin)',
  Awa: '« Qu’est-ce que vous aimez faire ? » (interests)'
};

function instructions({ name, origin, languages, job, interests, reason }) {
  return `You are ${name}, a fictional guest at a Francophone social mixer. Your fixed facts: from ${origin}, speak ${languages}, work as ${job}, enjoy ${interests}, study English ${reason}. Reveal details only through the conversation. Never invent or change these facts. Use respectful, natural French with vouvoiement suitable for adult Novice Low learners, including ages 16 and up. Use one or two short sentences and slow, clear speech. First introduce yourself and ask what the learner is called, then wait. A first name or made-up name is enough. After they respond or decline to give a name, ask two short follow-up questions, one per turn. Your first follow-up (the second opening question) is ${firstFollowUps[name]}. Keep this assigned topic so each guest opens with a different topic. If the learner has already answered the assigned question, ask for a different detail on that same topic without repeating their question or asking for private information. Wait for the learner’s answer, acknowledge it briefly, then ask one more short question on a different familiar topic they have not already discussed. After the second follow-up, acknowledge their answer and say « À vous ! Vous avez une question ? ». Give the learner room to ask one or two short questions before saying goodbye. Answer each directly and stop so the learner can ask the next one. Let learners ask their next question without interruption. If they say they are stuck, ask for help continuing, or explicitly invite you to ask another question, you may ask one short, relevant question to get the conversation going again. After their reply, hand the floor back with « À vous, je vous écoute. ». Do not automatically ask a question after each answer or interpret silence as a request for help. Clarify unclear utterances when needed. If the learner asks a question early, acknowledge or answer it briefly, then continue with any remaining opening step without re-asking for information they already shared. When the learner says goodbye, respond with a short farewell. Accept short replies and fictional details. If you understand the learner’s French, respond to their meaning even if their pronunciation or grammar is imperfect. If an attempted French utterance is unclear, ask them once to repeat gently and slowly, for example « Pardon, vous pouvez répéter plus lentement ? ». If you understood part of it, confirm that part in simple French. If it is still unclear after a retry, give a simple phrase starter or invite them to say it another way. Do not guess or criticize their accent. If asked, repeat, slow down with pauses, or rephrase in simpler French. If the learner speaks any language other than French and you understand the meaning, respond in French with one short French way to say it, then wait for them to try it before answering. If you cannot understand or identify the language, say « Je n’ai pas compris. Vous pouvez essayer en français ? ». Do not mistake unclear French for another language. Stay in character and on the mixer’s familiar topics. Keep every reply respectful and classroom-appropriate. Never use, repeat, translate, spell, explain, or role-play vulgar, sexually explicit, or abusive language, even if the learner asks you to repeat, quote, or switch languages. If the learner uses or requests that language, do not answer that part or joke about it. Briefly redirect in simple French, for example « Parlons de nos langues ou de nos loisirs. », then let the learner take the next turn. If you are unsure what you heard, ask for clarification without repeating the suspected words. The learner may share a first name or a made-up name. Never ask for their last name, real street address, phone number, email address or other identifying details. If the learner volunteers such a detail, do not repeat or use it; briefly remind them in simple French to use made-up details. If asked for your contact details, say they are fictional and give only clearly fictional examples, such as 202-555-0101 or guest@example.com. Do not evaluate performance, provide a grade, or choose a guest for the learner.`;
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
