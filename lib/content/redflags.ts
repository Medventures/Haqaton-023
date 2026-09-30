import type { L } from '../types';

// Phrases, not single words: «анализ крови» must not trigger an emergency answer.
// Patterns run on normalized text (lowercase, ё→е, punctuation → spaces).
export const redFlagPatterns: { code: string; re: RegExp }[] = [
  { code: 'BLOOD_STOOL', re: /кров\w*\s+(в|из|на)\s+(стул|кал|унитаз|прям|заднего|анус|попы|туалет)/ },
  { code: 'BLOOD_STOOL', re: /(стул|кал|понос)\w*\s+(с\s+)?кров/ },
  { code: 'BLOOD_STOOL', re: /(идет|пошла|течет|много|сгуст\w*)\s+кров/ },
  { code: 'BLEEDING', re: /кровотечен/ },
  { code: 'BLOOD_VOMIT', re: /(рвот|рвет|стошнил|вырвал)\w*\s+(с\s+)?кров/ },
  { code: 'BLACK_STOOL', re: /черн\w*\s+(стул|кал)/ },
  { code: 'SEVERE_PAIN', re: /(сильн|остр|невыносим|резк)\w*\s+(боль|бол)/ },
  { code: 'SEVERE_PAIN', re: /(очень|сильно|жутко|ужасно)\s+(болит|больно)/ },
  { code: 'FAINT', re: /(потерял\w*|теряю)\s+сознани|обморок|упал\w*\s+в\s+обморок/ },
  { code: 'BREATH', re: /не\s+могу\s+дышать|задыха|трудно\s+дышать|одышк/ },
  { code: 'CHEST', re: /бол\w*\s+(в|за)\s+груд|давит\s+в\s+груди/ },
  { code: 'FEVER', re: /температур\w*\s+(3[89]|4[0-2])|(высок|сильн)\w*\s+температур|(?<![а-яё])жар(?![а-яё])/ },
  { code: 'SEIZURE', re: /судорог/ },
  { code: 'ALLERGY', re: /отек\w*\s+(лица|горла|губ)|опух\w*\s+(лицо|горло)/ },
  // Kazakh
  { code: 'BLOOD_STOOL', re: /нәжіс\w*\s+қан|қан\s+(кет|арал|ағ)/ },
  { code: 'SEVERE_PAIN', re: /қатты\s+(ауыр|ауырып)/ },
  { code: 'FAINT', re: /есін\w*\s+тан|талып\s+қал/ },
  { code: 'BREATH', re: /тыныс\s+ал\w*\s+алмай|демім\s+жетпей/ },
  { code: 'CHEST', re: /кеуде\w*\s+ауыр/ },
  { code: 'FEVER', re: /қызу\w*\s+(3[89]|4[0-2])|ыстығым\s+(3[89]|4[0-2])/ },
];

// Removed from the text before matching.
export const redFlagExclusions: RegExp[] = [
  /анализ\w*\s+(на\s+)?кров\w*/g,
  /(сдать|сдавать|сдаю|сдам|сдала|сдал|берут|взять|забор)\s+кров\w*/g,
  /кров\w*\s+из\s+(вены|пальца)/g,
  /свертываемост\w*(\s+кров\w*)?/g,
  /разжижа\w*\s+кров\w*/g,
  /(группа|давлени\w*)\s+кров\w*/g,
  /қан\s+(тапсыр|анализ)\w*/g,
];

export const redFlagResponse: L = {
  ru: '🚨 Это может требовать срочной помощи. Прекратите подготовку и позвоните в клинику: {phone}. При угрозе жизни — 103.\nМы уже передали сообщение дежурному врачу.',
  kk: '🚨 Бұл шұғыл көмекті қажет етуі мүмкін. Дайындықты тоқтатып, клиникаға қоңырау шалыңыз: {phone}. Өмірге қауіп төнсе — 103.\nБіз хабарламаны кезекші дәрігерге жібердік.',
};
export const redFlagSource = 'NHS colonoscopy aftercare; разбор судьи (фразы вместо слов) + TODO_MEDICAL_REVIEW';
