import type { L } from '../types';

// Demo contacts: a hackathon prototype must not route real patients to the real clinic.
// Set CLINIC_PHONE / CLINIC_WHATSAPP in env to change.
export const clinic = {
  name: 'Prime Green Clinic',
  phone: process.env.CLINIC_PHONE || '+7 700 000 00 00 (demo)',
  whatsapp: process.env.CLINIC_WHATSAPP || '77000000000',
  address: {
    ru: 'г. Астана, ул. Сауран, 21 (5 минут пешком от Mega Silk Way)',
    kk: 'Астана қ., Сауран к-сі, 21 (Mega Silk Way-ден 5 минут жаяу)',
  } as L,
  hours: {
    ru: 'Пн–Пт 08:00–20:00, Сб 09:00–17:00, Вс — выходной',
    kk: 'Дс–Жм 08:00–20:00, Сн 09:00–17:00, Жс — демалыс',
  } as L,
  emergency: '103',
  source: 'primegc.kz/contacts (адрес, часы работы); телефон — демо',
};

export const disclaimer: L = {
  ru: 'Сервис помогает подготовиться к визиту и не заменяет врача. Решения о лечении и допуске принимает врач.',
  kk: 'Сервис сапарға дайындалуға көмектеседі және дәрігерді алмастырмайды. Емдеу мен рұқсат туралы шешімді дәрігер қабылдайды.',
};

export const kkReviewNote: L = {
  ru: '',
  kk: 'Қазақша медициналық мәтіндер маманның тексеруін қажет етеді.',
};
