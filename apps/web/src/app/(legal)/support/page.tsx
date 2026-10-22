import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Suport — Horae',
  description:
    'Cum obții ajutor pentru platforma Horae: contact, întrebări frecvente, resetare parolă.',
};

const CONTACT_EMAIL = 'sergiutigan@gmail.com';

/**
 * Public support page — the App Store / Play Store "Support URL". Keeps a
 * contact channel plus the answers store reviewers usually look for.
 */
export default function SupportPage() {
  return (
    <>
      <h1>Suport</h1>
      <p>
        Ai o întrebare, ai găsit o problemă sau ai nevoie de ajutor cu contul tău Horae? Scrie-ne la{' '}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> — răspundem de obicei în aceeași zi
        lucrătoare.
      </p>

      <h2>Întrebări frecvente</h2>

      <h3>Cum îmi fac cont?</h3>
      <p>
        Conturile sunt create prin invitație de către administratorul organizației tale. Dacă
        organizația ta nu folosește încă Horae, scrie-ne la adresa de mai sus și îți configurăm un
        spațiu de lucru.
      </p>

      <h3>Mi-am uitat parola</h3>
      <p>
        Folosește „Ai uitat parola?” de pe ecranul de autentificare (web sau aplicația mobilă).
        Primești pe email un link de resetare valabil o oră.
      </p>

      <h3>Contul meu s-a blocat</h3>
      <p>
        După 5 încercări eșuate de autentificare contul se blochează automat. Îl poți debloca singur
        prin resetarea parolei, sau cere administratorului organizației să te reactiveze.
      </p>

      <h3>Cum îmi șterg contul și datele?</h3>
      <p>
        Administratorul organizației îți poate dezactiva contul din aplicație. Pentru ștergerea
        definitivă a contului sau a datelor organizației, trimite cererea la{' '}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> — o procesăm în cel mult 30 de zile.
      </p>

      <h3>Unde văd noutățile fiecărei versiuni?</h3>
      <p>
        Pe pagina <a href="/changelog">Noutăți</a> și în aplicațiile mobile, în Setări → „Noutăți”.
      </p>

      <h2>Support (English)</h2>
      <p>
        Need help with Horae? Email us at <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> —
        we usually reply within one business day. Accounts are invitation-based; password reset is
        available from the sign-in screen; account/data deletion requests are honored within 30
        days.
      </p>
    </>
  );
}
