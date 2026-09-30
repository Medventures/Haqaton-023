import Link from 'next/link';
import { botUsername } from '@/lib/botinfo';
import { Disclaimer, Footer, Header, getLang } from './_components/ui';

export const dynamic = 'force-dynamic';

const T = {
  ru: {
    badge: 'Эндоскопия · Колоноскопия с седацией',
    h1: 'Подготовка к колоноскопии — без ошибок и лишних звонков',
    lead: 'Ассистент Prime Green Clinic проверит противопоказания и анализы, построит персональный план подготовки по памятке клиники, напомнит о каждом шаге и после процедуры объяснит заключение простыми словами.',
    tg: 'Открыть в Telegram',
    web: 'Пройти на сайте',
    doctor: 'Кабинет врача',
    stepsTitle: 'Как это работает',
    steps: [
      ['Проверка противопоказаний', 'Кнопки «Да / Нет / Не знаю». «Не знаю» не равно «нет»: такой ответ уточнит врач.'],
      ['Анализы', 'ОАК и ЭКГ должны действовать на дату процедуры (не старше 30 дней). Если истекут — подскажем, когда пересдать.'],
      ['План подготовки', 'Врач выбирает препарат и схему, система строит таймлайн: диета, бульон, прозрачные жидкости, дозы, окно голода.'],
      ['Напоминания', 'Диета, приём препарата с подтверждением, цвет стула по шкале, утренний чек-лист, «пора выезжать».'],
      ['Объяснение заключения', 'Заключение дословно + термины простым языком. Тревожные формулировки → запись к специалисту.'],
    ],
    prepTitle: 'Что важно знать о подготовке',
    prep: [
      ['3 дня', 'бесшлаковой диеты (5 дней — при склонности к запорам)'],
      ['до 14:00', 'накануне — только прозрачный бульон и жидкости'],
      ['после 14:00', 'накануне — только прозрачные жидкости: вода, некрепкий чай, осветлённый сок'],
      ['2 этапа', 'приёма препарата (Эзиклен / Кленсия / Фортранс) — схему выбирает врач'],
      ['≥ 2 ч', 'до процедуры закончить приём жидкости (требование седации)'],
      ['30 дней', 'срок годности ОАК и ЭКГ для седации'],
    ],
    prepSrc: 'Источники: памятка и страница услуги Prime Green Clinic; ESGE 2019; US MSTF 2025.',
    safeTitle: 'Безопасность прежде всего',
    safe: [
      ['Решения принимает врач', 'Ассистент не ставит диагноз, не отменяет лекарства и не решает о допуске.'],
      ['Правила, а не догадки', 'Медицинская логика — в редактируемых медиками правилах с источниками. AI только пересказывает словарь и выбирает ответ из FAQ.'],
      ['Тревожные симптомы', 'Фразы вроде «кровь в стуле» или «сильная боль» прерывают сценарий: срочный ответ и флаг дежурному врачу.'],
      ['Личные данные', 'Анализы и заключения — только на защищённой странице по подписанной ссылке, в Telegram — нейтральные уведомления.'],
    ],
    metricsTitle: 'Что измеряем',
    metrics: ['Отмены и их причины', 'Нарушения подготовки до выезда', 'Вопросы, закрытые без звонка', 'Конверсия в консультацию специалиста'],
  },
  kk: {
    badge: 'Эндоскопия · Седациямен колоноскопия',
    h1: 'Колоноскопияға дайындық — қатесіз және артық қоңыраусыз',
    lead: 'Prime Green Clinic көмекшісі қарсы көрсетілімдер мен анализдерді тексереді, клиника жадынамасы бойынша жеке дайындық жоспарын құрады, әр қадамды еске салады және процедурадан кейін қорытындыны қарапайым тілмен түсіндіреді.',
    tg: 'Telegram-да ашу',
    web: 'Сайтта өту',
    doctor: 'Дәрігер кабинеті',
    stepsTitle: 'Қалай жұмыс істейді',
    steps: [
      ['Қарсы көрсетілімдерді тексеру', '«Иә / Жоқ / Білмеймін» түймелері. «Білмеймін» «жоқ» дегенді білдірмейді: мұндай жауапты дәрігер нақтылайды.'],
      ['Анализдер', 'ЖҚА мен ЭКГ процедура күніне жарамды болуы керек (30 күннен аспауы). Мерзімі өтсе — қашан қайта тапсыру керектігін айтамыз.'],
      ['Дайындық жоспары', 'Дәрігер препарат пен схеманы таңдайды, жүйе уақыт кестесін құрады: диета, сорпа, мөлдір сұйықтық, дозалар, аштық терезесі.'],
      ['Еске салғыштар', 'Диета, препаратты растаумен қабылдау, нәжіс түсі шкаласы, таңғы тексеру тізімі, «шығатын уақыт».'],
      ['Қорытындыны түсіндіру', 'Қорытынды сөзбе-сөз + терминдер қарапайым тілмен. Алаңдатарлық тұжырымдар → маманға жазылу.'],
    ],
    prepTitle: 'Дайындық туралы маңызды ақпарат',
    prep: [
      ['3 күн', 'қалдықсыз диета (іш қатуға бейім болса — 5 күн)'],
      ['14:00-ге дейін', 'алдыңғы күні — тек мөлдір сорпа мен сұйықтық'],
      ['14:00-ден кейін', 'алдыңғы күні — тек мөлдір сұйықтық: су, қою емес шай, мөлдір шырын'],
      ['2 кезең', 'препарат қабылдау (Эзиклен / Кленсия / Фортранс) — схеманы дәрігер таңдайды'],
      ['≥ 2 сағ', 'процедураға дейін сұйықтықты тоқтату (седация талабы)'],
      ['30 күн', 'седация үшін ЖҚА мен ЭКГ жарамдылық мерзімі'],
    ],
    prepSrc: 'Дереккөздер: Prime Green Clinic жадынамасы мен қызмет беті; ESGE 2019; US MSTF 2025.',
    safeTitle: 'Қауіпсіздік бірінші орында',
    safe: [
      ['Шешімді дәрігер қабылдайды', 'Көмекші диагноз қоймайды, дәрілерді тоқтатпайды және рұқсат туралы шешпейді.'],
      ['Болжам емес, ережелер', 'Медициналық логика — дереккөздері бар, медиктер өңдейтін ережелерде. AI тек сөздікті мазмұндайды және FAQ-тан жауап таңдайды.'],
      ['Алаңдатарлық белгілер', '«Нәжісте қан» немесе «қатты ауырады» сияқты сөздер сценарийді тоқтатады: шұғыл жауап және кезекші дәрігерге белгі.'],
      ['Жеке деректер', 'Анализдер мен қорытындылар — тек қол қойылған сілтеме бойынша қорғалған бетте, Telegram-да — бейтарап хабарламалар.'],
    ],
    metricsTitle: 'Нені өлшейміз',
    metrics: ['Бас тартулар және олардың себептері', 'Шығар алдындағы дайындық бұзылыстары', 'Қоңыраусыз жабылған сұрақтар', 'Маман кеңесіне конверсия'],
  },
};

export default async function Home({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const lang = getLang(await searchParams);
  const c = T[lang];
  const bot = await botUsername();
  return (
    <>
      <Header lang={lang} path="/" right={<Link href="/doctor" className="btn-ghost btn-sm hidden sm:inline-flex">{c.doctor}</Link>} />
      <main>
        <section className="relative overflow-hidden bg-gradient-to-b from-white to-brand-50">
          <div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-lime/20 blur-3xl" />
          <div className="container-x grid items-center gap-10 py-14 md:grid-cols-[1.2fr_1fr] md:py-20">
            <div className="space-y-6">
              <span className="chip bg-brand-100 text-brand-dark">{c.badge}</span>
              <h1 className="text-3xl font-extrabold leading-tight tracking-tight sm:text-5xl">{c.h1}</h1>
              <p className="max-w-xl text-lg text-muted">{c.lead}</p>
              <div className="flex flex-wrap gap-3">
                {bot && <a href={`https://t.me/${bot}`} className="btn-primary" target="_blank" rel="noreferrer">✈️ {c.tg}</a>}
                <Link href={`/start?lang=${lang}`} className="btn-lime">📝 {c.web}</Link>
                <Link href="/doctor" className="btn-ghost sm:hidden">{c.doctor}</Link>
              </div>
              <Disclaimer lang={lang} />
            </div>
            <div className="card relative p-5">
              <div className="mb-3 flex items-center justify-between text-sm">
                <span className="font-semibold">📋 {lang === 'ru' ? 'План подготовки' : 'Дайындық жоспары'}</span>
                <span className="chip bg-brand-100 text-brand-dark">{lang === 'ru' ? 'пример' : 'мысал'}</span>
              </div>
              <ol className="relative space-y-3 border-l-2 border-brand-100 pl-5 text-sm">
                {[
                  ['✅', 'D-3 09:00', lang === 'ru' ? 'Начало бесшлаковой диеты' : 'Қалдықсыз диета басталады'],
                  ['✅', 'D-1 08:00', lang === 'ru' ? 'Напоминание о визите + бульон до 14:00' : 'Сапар туралы еске салу + 14:00-ге дейін сорпа'],
                  ['🔔', 'D-1 18:00', lang === 'ru' ? 'Первая часть препарата — «Выпил(а)»' : 'Препараттың бірінші бөлігі — «Іштім»'],
                  ['▫️', 'D0 04:00', lang === 'ru' ? 'Вторая часть препарата' : 'Препараттың екінші бөлігі'],
                  ['▫️', 'D0 06:00', lang === 'ru' ? 'Итоговая проверка стула' : 'Нәжісті қорытынды тексеру'],
                  ['▫️', 'D0 07:00', lang === 'ru' ? 'Утренний чек-лист' : 'Таңғы тексеру тізімі'],
                ].map(([i, when, what]) => (
                  <li key={when} className="relative">
                    <span className="absolute -left-[29px] top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-white text-[10px]">{i}</span>
                    <span className="font-mono text-xs text-muted">{when}</span>
                    <p className="font-medium">{what}</p>
                  </li>
                ))}
              </ol>
              <div className="mt-4 flex gap-2">
                {['#6b4226', '#a0622d', '#e0922f', '#f3e27a'].map((c2, i) => (
                  <span key={c2} className="flex-1 rounded-lg py-2 text-center text-xs font-bold" style={{ background: c2, color: i < 2 ? '#fff' : '#13261c' }}>{i + 1}</span>
                ))}
              </div>
              <p className="mt-1 text-center text-xs text-muted">{lang === 'ru' ? 'Шкала стула: цель — 4' : 'Нәжіс шкаласы: мақсат — 4'}</p>
            </div>
          </div>
        </section>

        <section className="container-x py-14">
          <h2 className="mb-8 text-2xl font-bold sm:text-3xl">{c.stepsTitle}</h2>
          <div className="grid gap-4 md:grid-cols-5">
            {c.steps.map(([title, text], i) => (
              <div key={title} className="card p-5">
                <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-full bg-brand text-white font-bold">{i + 1}</div>
                <h3 className="mb-1 font-bold">{title}</h3>
                <p className="text-sm text-muted">{text}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-white py-14">
          <div className="container-x">
            <h2 className="mb-8 text-2xl font-bold sm:text-3xl">{c.prepTitle}</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {c.prep.map(([big, text]) => (
                <div key={big} className="rounded-2xl border border-line bg-surface p-5">
                  <div className="font-display text-2xl font-extrabold text-brand">{big}</div>
                  <p className="text-sm text-muted">{text}</p>
                </div>
              ))}
            </div>
            <p className="mt-4 text-xs text-muted">{c.prepSrc}</p>
          </div>
        </section>

        <section className="container-x grid gap-6 py-14 lg:grid-cols-[1.4fr_1fr]">
          <div>
            <h2 className="mb-6 text-2xl font-bold sm:text-3xl">{c.safeTitle}</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {c.safe.map(([title, text]) => (
                <div key={title} className="card p-5">
                  <h3 className="mb-1 font-bold text-brand-dark">{title}</h3>
                  <p className="text-sm text-muted">{text}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="card flex flex-col justify-between bg-brand p-6 text-white">
            <div>
              <h2 className="mb-4 text-2xl font-bold">{c.metricsTitle}</h2>
              <ul className="space-y-2">
                {c.metrics.map((m) => <li key={m} className="flex gap-2"><span className="text-lime">●</span>{m}</li>)}
              </ul>
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href={`/start?lang=${lang}`} className="btn bg-white text-brand hover:bg-brand-50">{c.web}</Link>
              {bot && <a href={`https://t.me/${bot}`} className="btn border border-white/40 text-white hover:bg-white/10" target="_blank" rel="noreferrer">{c.tg}</a>}
            </div>
          </div>
        </section>
      </main>
      <Footer lang={lang} />
    </>
  );
}
