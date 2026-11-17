export const canDos = [
  'Introduce themselves and get acquainted with others (e.g., greet someone, say and spell their name, ask someone’s name, and say goodbye).',
  'Talk about nationality, origin, and languages.',
  'Ask for and give basic personal information (e.g., age, birthday, profession, and marital/family status).',
  'Ask for and give basic contact information, including telephone number and email address.',
  'Share basic information about another person (e.g., name, age, nationality, profession, family status, and interests).',
  'Talk about their language learning, including their reasons and motivation for learning French.',
  'Give basic information about an event (e.g., type of event, location, day/date, and year).',
  'Use basic communication strategies when needed, such as asking politely for help or clarification.'
];

export const guests = [
  { name: 'Samira', origin: 'Rabat', languages: 'le français et l’arabe', job: 'professeure', interests: 'le cinéma et la cuisine', reason: 'pour voyager', voice: 'marin', color: 'rose' },
  { name: 'Louis', origin: 'Montréal', languages: 'le français et l’anglais', job: 'cuisinier', interests: 'la musique et le vélo', reason: 'pour parler avec des amis', voice: 'cedar', color: 'green' },
  { name: 'Awa', origin: 'Dakar', languages: 'le français, le wolof et l’anglais', job: 'photographe', interests: 'le cinéma et la musique', reason: 'pour le travail', voice: 'coral', color: 'gold' }
];

export const questions = [
  ['Vous venez d’où ?', g => 'Je viens de ' + g.origin + '.'],
  ['Vous parlez quelles langues ?', g => 'Je parle ' + g.languages + '.'],
  ['Qu’est-ce que vous faites dans la vie ?', g => 'Je suis ' + g.job + '.'],
  ['Qu’est-ce que vous aimez ?', g => 'J’aime ' + g.interests + '.'],
  ['Pourquoi vous apprenez l’anglais ?', g => 'J’apprends l’anglais ' + g.reason + '.']
];
