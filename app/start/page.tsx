import { questions } from '@/lib/content/screening';
import { requiredTests } from '@/lib/content/tests';
import { disclaimer } from '@/lib/content/clinic';
import { bookableDates, slotTimes } from '@/lib/rules/slots';
import { fmtDate, isoDay } from '@/lib/time';
import { isTodo } from '@/lib/i18n';
import { Footer, Header, getLang } from '../_components/ui';
import IntakeWizard from './wizard';

export const dynamic = 'force-dynamic';

export default async function StartPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const lang = getLang(await searchParams);
  const dates = bookableDates(new Date(), 12).map((d) => ({ iso: isoDay(d), label: fmtDate(d), times: slotTimes(d) }));
  const qs = questions.map((q) => ({ code: q.code, text: q.text[lang], hint: q.hint?.[lang], todo: isTodo(q.source), flagText: q.onFlagText?.[lang] }));
  const tests = requiredTests.map((t) => ({ code: t.code, title: t.title[lang], validDays: t.validDays }));
  return (
    <>
      <Header lang={lang} path="/start" />
      <main className="container-x py-8 sm:py-12">
        <IntakeWizard lang={lang} dates={dates} questions={qs} tests={tests} disclaimer={disclaimer[lang]} />
      </main>
      <Footer lang={lang} />
    </>
  );
}
