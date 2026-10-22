import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Politica de confidențialitate — Horae',
  description:
    'Cum colectează, folosește și protejează Horae datele personale ale utilizatorilor platformei și ale aplicațiilor mobile.',
};

const LAST_UPDATED = '11 iulie 2026';
const CONTACT_EMAIL = 'sergiutigan@gmail.com';

/**
 * Public privacy policy — required by the App Store / Play Store listings and
 * linked from the site footer. Romanian first (the product language), with an
 * English summary for store reviewers underneath.
 */
export default function PrivacyPolicyPage() {
  return (
    <>
      <h1>Politica de confidențialitate</h1>
      <p>
        <strong>Ultima actualizare:</strong> {LAST_UPDATED}
      </p>
      <p>
        Horae (<strong>horae.ca</strong>) este o platformă de gestiune a producției și a stocurilor
        pentru cofetării și laboratoare de patiserie, disponibilă ca aplicație web și ca aplicații
        native pentru iOS și Android. Această politică explică ce date prelucrăm, în ce scop și ce
        drepturi ai.
      </p>

      <h2>1. Cine suntem</h2>
      <p>
        Platforma Horae este operată de echipa Horae („noi”). Ne poți contacta oricând la{' '}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>

      <h2>2. Ce date colectăm</h2>
      <h3>Date de cont</h3>
      <ul>
        <li>
          Nume și prenume, adresă de email, rol în organizație — necesare pentru autentificare și
          autorizare.
        </li>
        <li>
          Parola este stocată exclusiv sub formă de hash criptografic (argon2); nu o putem citi.
        </li>
      </ul>
      <h3>Date operaționale</h3>
      <ul>
        <li>
          Datele introduse de organizația ta în platformă: rețete, stocuri, comenzi, sarcini de
          producție, transferuri, furnizori, echipamente. Acestea aparțin organizației tale și sunt
          complet izolate de datele altor organizații.
        </li>
        <li>
          Semnături de recepție (imagine) pentru avizele de însoțire și foile de parcurs, când sunt
          folosite.
        </li>
      </ul>
      <h3>Date tehnice</h3>
      <ul>
        <li>
          <strong>Jurnale de erori și performanță</strong> (Sentry): rapoarte de eroare, informații
          despre dispozitiv și sistem, identificator de sesiune — pentru diagnosticarea defectelor.
        </li>
        <li>
          <strong>Analiză de produs</strong> (PostHog, găzduit în UE): ecrane vizitate și acțiuni în
          aplicație, asociate contului tău — pentru a înțelege și îmbunătăți produsul. Nu folosim
          aceste date pentru publicitate și nu urmărim activitatea ta în afara aplicației.
        </li>
        <li>
          <strong>Notificări push</strong>: un token de dispozitiv, doar dacă activezi notificările.
        </li>
      </ul>

      <h2>3. Ce NU facem</h2>
      <ul>
        <li>Nu vindem și nu închiriem date personale.</li>
        <li>Nu afișăm publicitate și nu partajăm date cu rețele publicitare.</li>
        <li>Nu urmărim utilizatorii între aplicații sau site-uri terțe (fără „tracking”).</li>
      </ul>

      <h2>4. Temeiul și scopul prelucrării</h2>
      <ul>
        <li>
          <strong>Executarea contractului</strong>: contul și datele operaționale sunt necesare
          pentru a furniza serviciul.
        </li>
        <li>
          <strong>Interes legitim</strong>: jurnalele de erori și analiza de produs, pentru
          securitatea și îmbunătățirea platformei.
        </li>
        <li>
          <strong>Consimțământ</strong>: notificările push (le poți dezactiva oricând din setările
          dispozitivului).
        </li>
      </ul>

      <h2>5. Împuterniciți (sub-procesatori)</h2>
      <ul>
        <li>Găzduire aplicație web: Vercel.</li>
        <li>Găzduire API și bază de date: server dedicat în Uniunea Europeană.</li>
        <li>Monitorizare erori: Sentry.</li>
        <li>Analiză de produs: PostHog (instanță UE).</li>
        <li>Trimitere email tranzacțional (invitații, resetare parolă): Resend.</li>
      </ul>

      <h2>6. Păstrarea datelor</h2>
      <p>
        Datele contului și datele operaționale sunt păstrate cât timp organizația ta are un cont
        activ. La cererea administratorului organizației, contul și datele asociate sunt șterse.
        Jurnalele tehnice sunt păstrate pe termen scurt și rotate automat.
      </p>

      <h2>7. Drepturile tale</h2>
      <p>
        Conform GDPR, ai dreptul de acces, rectificare, ștergere, restricționare, portabilitate și
        opoziție. Scrie-ne la <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> și răspundem
        în cel mult 30 de zile. Ai și dreptul de a depune o plângere la autoritatea de supraveghere
        (în România: ANSPDCP).
      </p>

      <h2>8. Securitate</h2>
      <p>
        Tot traficul este criptat (TLS). Autentificarea folosește token-uri semnate (JWT RS256) cu
        rotire a token-urilor de reîmprospătare, iar accesul la date este restricționat pe roluri și
        izolat per organizație.
      </p>

      <h2>9. Modificări</h2>
      <p>
        Vom publica aici orice modificare a acestei politici, cu data actualizării. Modificările
        semnificative vor fi anunțate în aplicație.
      </p>

      <hr className="mt-12" />

      <h2>Privacy Policy (English summary)</h2>
      <p>
        Horae is a production &amp; inventory management platform for pastry businesses (web, iOS
        and Android). We collect: account data (name, email, role — required to sign in), the
        operational data your organization enters (recipes, stock, orders, tasks), crash/performance
        diagnostics (Sentry), product analytics tied to your account (PostHog, EU-hosted) and a
        push-notification device token if you enable notifications. Passwords are stored only as
        argon2 hashes.
      </p>
      <p>
        We do <strong>not</strong> sell personal data, show ads, share data with ad networks, or
        track users across third-party apps and websites. Data is retained while your organization
        has an active account and deleted on request. All traffic is TLS-encrypted; access is
        role-restricted and isolated per organization. Sub-processors: Vercel (web hosting), an
        EU-based server (API &amp; database), Sentry (error monitoring), PostHog EU (analytics),
        Resend (transactional email). You can exercise your GDPR rights (access, rectification,
        erasure, portability, objection) by writing to{' '}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>
    </>
  );
}
