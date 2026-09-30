import type { Answer, Assignee, L, Severity } from '../types';

// EDITED BY MEDICS. Every "Не знаю" is a flag, never "Нет".
// Outcome per answer: a flag (severity + who handles it), URGENT (stop, call clinic), or a prep task.
export type Outcome =
  | { type: 'flag'; severity: Severity; assignee: Assignee }
  | { type: 'urgent' }
  | { type: 'task'; task: 'EXTENDED_DIET' }
  | { type: 'none' };

export interface Question {
  code: string;
  text: L;
  hint?: L;              // e.g. list of drug names
  onFlagText?: L;        // what the patient sees when this answer raised a flag
  outcomes: Partial<Record<Answer, Outcome>>;
  source: string;
}

const flag = (severity: Severity, assignee: Assignee = 'DOCTOR'): Outcome => ({ type: 'flag', severity, assignee });
const dontStop: L = {
  ru: 'Не отменяйте и не меняйте приём препаратов самостоятельно. Схему определяет врач.',
  kk: 'Дәрілерді өз бетіңізше тоқтатпаңыз және өзгертпеңіз. Қабылдау тәртібін дәрігер анықтайды.',
};

export const questions: Question[] = [
  {
    code: 'ACUTE_NOW',
    text: {
      ru: 'Есть ли у вас СЕЙЧАС температура выше 38°, сильная боль в животе, кровотечение или чёрный стул?',
      kk: 'Қазір сізде 38°-тан жоғары қызу, іштің қатты ауыруы, қан кету немесе қара нәжіс бар ма?',
    },
    outcomes: { YES: { type: 'urgent' }, UNKNOWN: flag('HIGH') },
    source: 'NHS colonoscopy aftercare (тревожные симптомы) + TODO_MEDICAL_REVIEW',
  },
  {
    code: 'ANTICOAGULANTS',
    text: {
      ru: 'Принимаете ли вы препараты, разжижающие кровь?',
      kk: 'Қанды сұйылтатын дәрілер қабылдайсыз ба?',
    },
    hint: {
      ru: 'Например: Ксарелто, Эликвис, Варфарин, Прадакса, Аспирин / Кардиомагнил, Клопидогрел (Плавикс), Тикагрелор (Брилинта)',
      kk: 'Мысалы: Ксарелто, Эликвис, Варфарин, Прадакса, Аспирин / Кардиомагнил, Клопидогрел (Плавикс), Тикагрелор (Брилинта)',
    },
    onFlagText: dontStop,
    outcomes: { YES: flag('HIGH'), UNKNOWN: flag('HIGH') },
    source: 'Памятка Prime Green Clinic (антикоагулянты); ESGE/BSG — решение о приёме принимает врач',
  },
  {
    code: 'DIABETES',
    text: {
      ru: 'Есть ли у вас сахарный диабет и принимаете ли вы сахароснижающие таблетки или инсулин?',
      kk: 'Сізде қант диабеті бар ма және қантты төмендететін таблетка немесе инсулин қабылдайсыз ба?',
    },
    onFlagText: dontStop,
    outcomes: { YES: flag('HIGH'), UNKNOWN: flag('HIGH') },
    source: 'Мета-анализ факторов плохой подготовки (диабет); ASGE 2024 (SGLT-2i) — схему определяет врач',
  },
  {
    code: 'GLP1',
    text: {
      ru: 'Делаете ли вы уколы для снижения веса или сахара (семаглутид — Оземпик, Вегови; тирзепатид; лираглутид)?',
      kk: 'Салмақты немесе қантты төмендетуге арналған екпелер саласыз ба (семаглутид — Оземпик, Вегови; тирзепатид; лираглутид)?',
    },
    onFlagText: dontStop,
    outcomes: { YES: flag('HIGH'), UNKNOWN: flag('HIGH') },
    source: 'ASGE position statement on GLP-1 RA (2024/2025)',
  },
  {
    code: 'IRON',
    text: {
      ru: 'Принимаете ли вы препараты железа?',
      kk: 'Темір препараттарын қабылдайсыз ба?',
    },
    onFlagText: dontStop,
    outcomes: { YES: flag('MEDIUM'), UNKNOWN: flag('MEDIUM') },
    source: 'TODO_MEDICAL_REVIEW',
  },
  {
    code: 'SEDATION_COMPLICATIONS',
    text: {
      ru: 'Были ли у вас осложнения после наркоза или седации?',
      kk: 'Наркоздан немесе седациядан кейін асқынулар болды ма?',
    },
    outcomes: { YES: flag('HIGH'), UNKNOWN: flag('MEDIUM') },
    source: 'Седация пропофолом под контролем анестезиолога (primegc.kz, услуга «Колоноскопия»)',
  },
  {
    code: 'DRUG_ALLERGY',
    text: {
      ru: 'Есть ли у вас аллергия на лекарства (в том числе на препараты для наркоза, яйцо или сою)?',
      kk: 'Дәрілерге (соның ішінде наркоз дәрілеріне, жұмыртқаға немесе сояға) аллергияңыз бар ма?',
    },
    outcomes: { YES: flag('HIGH'), UNKNOWN: flag('MEDIUM') },
    source: 'TODO_MEDICAL_REVIEW (аллергоанамнез перед седацией пропофолом)',
  },
  {
    code: 'HEART',
    text: {
      ru: 'Есть ли заболевания сердца: аритмия, сердечная недостаточность, перенесённый инфаркт?',
      kk: 'Жүрек аурулары бар ма: аритмия, жүрек жеткіліксіздігі, бұрын болған инфаркт?',
    },
    outcomes: { YES: flag('HIGH'), UNKNOWN: flag('MEDIUM') },
    source: 'TODO_MEDICAL_REVIEW',
  },
  {
    code: 'LUNGS',
    text: {
      ru: 'Есть ли бронхиальная астма или хроническое заболевание лёгких?',
      kk: 'Бронх демікпесі немесе өкпенің созылмалы ауруы бар ма?',
    },
    outcomes: { YES: flag('MEDIUM'), UNKNOWN: flag('MEDIUM') },
    source: 'TODO_MEDICAL_REVIEW',
  },
  {
    code: 'KIDNEY',
    text: {
      ru: 'Есть ли хроническое заболевание почек?',
      kk: 'Бүйректің созылмалы ауруы бар ма?',
    },
    outcomes: { YES: flag('MEDIUM'), UNKNOWN: flag('MEDIUM') },
    source: 'ESGE 2019 (выбор препарата при нарушении функции почек) + TODO_MEDICAL_REVIEW',
  },
  {
    code: 'BLEEDING_DISORDER',
    text: {
      ru: 'Есть ли нарушение свёртываемости крови (частые синяки, долгие кровотечения)?',
      kk: 'Қанның ұюы бұзылған ба (жиі көгеру, ұзақ қан кету)?',
    },
    outcomes: { YES: flag('HIGH'), UNKNOWN: flag('MEDIUM') },
    source: 'TODO_MEDICAL_REVIEW',
  },
  {
    code: 'IMPLANTS',
    text: {
      ru: 'Есть ли у вас кардиостимулятор или другой имплантированный электронный прибор?',
      kk: 'Сізде кардиостимулятор немесе басқа имплантацияланған электронды құрылғы бар ма?',
    },
    outcomes: { YES: flag('MEDIUM'), UNKNOWN: flag('MEDIUM') },
    source: 'TODO_MEDICAL_REVIEW (электрокоагуляция при полипэктомии)',
  },
  {
    code: 'PREGNANCY',
    text: {
      ru: 'Есть ли вероятность беременности?',
      kk: 'Жүкті болу ықтималдығы бар ма?',
    },
    outcomes: { YES: flag('HIGH'), UNKNOWN: flag('HIGH') },
    source: 'TODO_MEDICAL_REVIEW',
  },
  {
    code: 'CONSTIPATION',
    text: {
      ru: 'Есть ли у вас склонность к запорам?',
      kk: 'Іш қатуға бейімділігіңіз бар ма?',
    },
    outcomes: { YES: { type: 'task', task: 'EXTENDED_DIET' }, UNKNOWN: { type: 'task', task: 'EXTENDED_DIET' } },
    source: 'primegc.kz, услуга «Колоноскопия»: бесшлаковая диета 3–5 дней; мета-анализ: запоры — фактор плохой подготовки',
  },
  {
    code: 'COMPANION',
    text: {
      ru: 'Будет ли с вами сопровождающий после седации? (после седации в этот день нельзя садиться за руль)',
      kk: 'Седациядан кейін сізбен бірге ересек адам болады ма? (седациядан кейін сол күні көлік жүргізуге болмайды)',
    },
    outcomes: { YES: { type: 'none' }, NO: flag('MEDIUM', 'COORDINATOR'), UNKNOWN: flag('MEDIUM', 'COORDINATOR') },
    source: 'ASGE: после седации — не водить автомобиль до следующего дня + TODO_MEDICAL_REVIEW',
  },
];

export const questionByCode = Object.fromEntries(questions.map((q) => [q.code, q]));
