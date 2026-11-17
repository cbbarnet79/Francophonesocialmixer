export const canDos = [
  'I can greet someone and introduce myself.',
  'I can ask and say where someone is from.',
  'I can ask and say what languages someone speaks.',
  'I can ask and answer a simple question about work or interests.',
  'I can ask someone to repeat or speak more slowly.'
];

export const goals = [
  'Introduce myself and ask the guest’s name.',
  'Ask one follow-up question.',
  'Ask for repetition or clarification in French.'
];

export const guests = [
  { name: 'Samira', origin: 'Rabat', languages: 'le français et l’arabe', job: 'professeure', interests: 'le cinéma et la cuisine', reason: 'pour voyager', voice: 'marin', color: 'rose' },
  { name: 'Louis', origin: 'Montréal', languages: 'le français et l’anglais', job: 'cuisinier', interests: 'la musique et le vélo', reason: 'pour parler avec des amis', voice: 'cedar', color: 'green' },
  { name: 'Awa', origin: 'Dakar', languages: 'le français, le wolof et l’anglais', job: 'photographe', interests: 'le cinéma et la musique', reason: 'pour le travail', voice: 'coral', color: 'gold' }
];

export const questions = [
  ['Vous venez d’où ?', g => 'Je viens de ' + g.origin + '. Et vous ?'],
  ['Vous parlez quelles langues ?', g => 'Je parle ' + g.languages + '. Et vous ?'],
  ['Qu’est-ce que vous faites dans la vie ?', g => 'Je suis ' + g.job + '. Et vous ?'],
  ['Qu’est-ce que vous aimez ?', g => 'J’aime ' + g.interests + '. Et vous ?'],
  ['Pourquoi vous apprenez l’anglais ?', g => 'J’apprends l’anglais ' + g.reason + '. Et vous, pourquoi vous apprenez le français ?']
];
