/**
 * Curated, user-facing changelog — the single source for the web /changelog
 * page and the iOS "Noutăți" screen. Romanian, newest entry first.
 *
 * Process: when a feature batch lands on dev, add/extend the entry for the
 * version in the repo-root VERSION file (bump with scripts/bump-version.sh).
 * Keep the language user-facing — what changed for the people using the app,
 * not commit messages. NO platform prefixes in the text ("Web: ...") — tag
 * each item via `platforms` instead; clients render them as badges and the
 * web page filters by platform tabs.
 */

export type ChangelogPlatform = 'web' | 'ios' | 'android' | 'api';

export interface ChangelogItem {
  text: string;
  platforms: ChangelogPlatform[];
}

export interface ChangelogEntry {
  version: string;
  date: string; // ISO yyyy-mm-dd
  title: string;
  /** Short bullets shown in the iOS "Ce e nou" popup. */
  highlights: string[];
  nou: ChangelogItem[];
  imbunatatiri: ChangelogItem[];
  reparat: ChangelogItem[];
  platforms: ChangelogPlatform[];
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.39.1',
    date: '2026-10-20',
    title: 'Android: aplicația nu mai crapă la pornire după reinstalare',
    highlights: ['Android: aplicația pornește normal și după reinstalare sau pe un telefon nou'],
    nou: [],
    imbunatatiri: [],
    reparat: [
      {
        text: 'Android: după reinstalare, schimbarea telefonului sau pe unele telefoane mai vechi, aplicația crăpa la pornire. Acum pornește normal, iar dacă sesiunea veche nu mai poate fi citită, cere doar o nouă autentificare.',
        platforms: ['android'],
      },
    ],
    platforms: ['android'],
  },
  {
    version: '1.39.0',
    date: '2026-10-19',
    title: 'Filtre fixe la scroll, status la comenzi, „Pregătiri”',
    highlights: [
      'Filtrele (locații, categorii, tipuri) rămân sus când derulezi; titlul și butoanele se ascund și reapar când urci',
      'Comenzi: filtru de status, implicit doar comenzile noi',
      '„Livrări” devine „Pregătiri” și e vederea implicită',
    ],
    nou: [
      {
        text: 'Comenzi: buton de filtru pe status lângă calendar — implicit doar „Nouă”, poți adăuga Pregătită, În tranzit, Livrată etc.',
        platforms: ['web', 'ios', 'android', 'api'],
      },
    ],
    imbunatatiri: [
      {
        text: 'Pe toate paginile cu filtre (Stoc, Comenzi, Producție, Rețete, Calendar, Expirări): rândurile de filtre rămân fixe sus; titlul, căutarea și butoanele se ascund la derulare în jos și reapar la derulare în sus.',
        platforms: ['web', 'ios', 'android'],
      },
      {
        text: 'Comenzi: vederea „Livrări” se numește acum „Pregătiri” și e deschisă implicit.',
        platforms: ['web', 'ios', 'android'],
      },
      {
        text: 'Filtrele se derulează doar stânga-dreapta și nu mai reîncarcă pagina când tragi de ele în jos.',
        platforms: ['web', 'ios', 'android'],
      },
    ],
    reparat: [
      {
        text: 'Revizie stocuri: datele de expirare salvate de Excel în alt format (număr, „15.01.27”) se citesc corect și nu mai blochează încărcarea.',
        platforms: ['api'],
      },
    ],
    platforms: ['web', 'ios', 'android', 'api'],
  },
  {
    version: '1.38.0',
    date: '2026-10-19',
    title: 'Filtre de livrare mai clare: Ridicare și Livrare',
    highlights: [
      'Filtrele de comenzi: „Toate” implicit, încă o atingere pe un filtru te duce înapoi la „Toate”',
      'Filtru „Livrare” pentru toate comenzile livrate; ridicările apar direct cu numele locației',
    ],
    nou: [
      {
        text: 'Comenzi: filtru „Livrare” care arată toate comenzile livrate (și câte un filtru pe fiecare tip de livrare, când sunt mai multe).',
        platforms: ['web', 'ios', 'android', 'api'],
      },
      {
        text: 'Metode de livrare: fiecare metodă din magazin poate fi marcată Ridicare sau Livrare (detectat automat, corectabil de administrator), fără nicio schimbare în magazin.',
        platforms: ['web', 'ios', 'android', 'api'],
      },
    ],
    imbunatatiri: [
      {
        text: 'Filtrele de livrare arată numele scurt: „Ridicare la Acadeea Napoca” apare ca „Acadeea Napoca”.',
        platforms: ['web', 'ios', 'android', 'api'],
      },
      {
        text: '„Toate” e selectat implicit; atingerea filtrului deja ales revine la „Toate”. Lista de filtre se actualizează la fiecare reîncărcare.',
        platforms: ['web', 'ios', 'android'],
      },
    ],
    reparat: [
      {
        text: 'iPhone: tragerea în jos peste filtrele de comenzi nu mai reîncarcă tot ecranul — filtrele stau fixe și se derulează doar stânga-dreapta.',
        platforms: ['ios'],
      },
    ],
    platforms: ['web', 'ios', 'android', 'api'],
  },
  {
    version: '1.37.0',
    date: '2026-10-18',
    title: 'Comenzi pe intrări și livrări, filtre pe tipul de livrare',
    highlights: [
      'Comutator Intrări / Livrări la comenzi, cu grupare pe zile și „Azi” în față',
      'Filtru pe tipul de livrare din magazin, cu denumiri scurte',
      'Locațiile pot fi „unitate principală” — de acolo se scad vânzările de pe site',
    ],
    nou: [
      {
        text: 'Comenzi: comutator Intrări / Livrări. Intrări arată comenzile după când au intrat, cele mai noi primele; Livrări le ordonează după data livrării, cele fără dată apar la „Azi”.',
        platforms: ['web', 'ios', 'android', 'api'],
      },
      {
        text: 'Lista de comenzi e grupată pe zile (19 oct, Mâine, Azi, Ieri, Mai vechi) și se deschide la „Azi”.',
        platforms: ['web', 'ios', 'android'],
      },
      {
        text: 'Filtru pe tipul de livrare din magazinul online (de ex. „Livrare în Cluj-Napoca”), în listă și în calendar; administratorii pot da fiecărei livrări o denumire scurtă, folosită în filtre și pe carduri.',
        platforms: ['web', 'ios', 'android', 'api'],
      },
      {
        text: 'Locații: opțiunea „Unitate principală” — vânzările de pe site se scad din stocul ei (locația de ridicare dacă e principală, altfel prima unitate principală).',
        platforms: ['web', 'ios', 'api'],
      },
      {
        text: 'Setări: opțiunea „Livrări din magazinul online” pornește sau oprește tot ce ține de livrările din WooCommerce pentru firma ta.',
        platforms: ['web', 'ios', 'android', 'api'],
      },
    ],
    imbunatatiri: [
      {
        text: 'Calendarul comenzilor se deschide pe „Azi” și are aceleași filtre (Intrări / Livrări, tip de livrare).',
        platforms: ['web', 'ios', 'android', 'api'],
      },
    ],
    reparat: [],
    platforms: ['web', 'ios', 'android', 'api'],
  },
  {
    version: '1.36.3',
    date: '2026-10-19',
    title: 'Stocul pe locație și pentru produse finite',
    highlights: [
      'Pe web, filtrul de locație din Stoc arată și semipreparatele și produsele finite ale locației',
    ],
    nou: [],
    imbunatatiri: [],
    reparat: [
      {
        text: 'Stoc: când alegi o locație, semipreparatele și produsele finite arată cantitatea din locația respectivă (nu totalul), ca pe telefon.',
        platforms: ['web'],
      },
    ],
    platforms: ['web'],
  },
  {
    version: '1.36.2',
    date: '2026-10-19',
    title: 'Revizie stocuri: produsele finite se pot corecta din nou',
    highlights: [
      'Revizia stocurilor aplică din nou cantitățile corectate la produse finite și semipreparate',
    ],
    nou: [],
    imbunatatiri: [],
    reparat: [
      {
        text: 'Revizie stocuri: „Aplică modificările” nu mai dă eroarea „Date invalide în cerere” când se corectează cantitatea unui produs finit sau semipreparat.',
        platforms: ['api'],
      },
    ],
    platforms: ['api'],
  },
  {
    version: '1.36.1',
    date: '2026-10-18',
    title: 'Data de livrare și din pluginul actual al magazinului',
    highlights: [
      'Comenzile de pe site preiau data și metoda de livrare din pluginul instalat acum pe magazin',
    ],
    nou: [],
    imbunatatiri: [],
    reparat: [
      {
        text: 'Importul din WooCommerce citește data și metoda de livrare și din pluginul de livrare instalat acum pe site, nu doar din versiunea lui nouă.',
        platforms: ['api'],
      },
    ],
    platforms: ['api'],
  },
  {
    version: '1.36.0',
    date: '2026-10-18',
    title: 'Comenzi de pe site cu dată și metodă de livrare',
    highlights: [
      'Comenzile de pe site preiau data și metoda de livrare din noul plugin al magazinului',
      'Locațiile au un „ID extern” — comenzile cu ridicare ajung direct la locația potrivită',
    ],
    nou: [
      {
        text: 'Locații: câmp nou „ID extern (WooCommerce)” — același ID setat pe metoda de livrare din magazinul online. Comenzile de pe site cu acest ID devin ridicări de la locația respectivă.',
        platforms: ['web', 'ios', 'api'],
      },
      {
        text: 'Comenzile de pe site afișează metoda de livrare aleasă de client (în listă și în detaliul comenzii, la „Predare”).',
        platforms: ['web', 'ios', 'android', 'api'],
      },
    ],
    imbunatatiri: [
      {
        text: 'Importul din WooCommerce citește data de livrare din noul plugin al magazinului; vechiul câmp text „Comanda se ridică…” se folosește doar când lipsește data nouă. Comenzile cu mai multe livrări le listează pe toate în note.',
        platforms: ['api'],
      },
    ],
    reparat: [
      {
        text: 'Detaliul comenzii: etapele de status („În pregătire”, „În tranzit”) stau pe un singur rând și au aceeași înălțime.',
        platforms: ['ios', 'android'],
      },
      {
        text: 'Sesiunea nu se mai pierde când reînnoirea eșuează temporar (de ex. fără internet); se reînnoiește o singură dată pentru mai multe cereri simultane.',
        platforms: ['web', 'ios'],
      },
      {
        text: 'Cantitățile cu virgulă sau separator de mii („1.250,5”) se citesc corect, iar zecimalele salvate se păstrează.',
        platforms: ['web', 'ios'],
      },
      {
        text: 'Unitatea veche a unui produs rămâne selectabilă în formular.',
        platforms: ['web'],
      },
      {
        text: 'Abaterea de randament se colorează după procentul afișat.',
        platforms: ['ios'],
      },
    ],
    platforms: ['web', 'ios', 'android', 'api'],
  },
  {
    version: '1.35.4',
    date: '2026-10-17',
    title: 'Antet fix pe telefon, rețete compacte pe iPhone',
    highlights: [
      'Pe telefon, titlul, căutarea și filtrele rămân sus când derulezi, ca la Producție',
      'iPhone: rețetele ca și carduri colorate, câte două pe rând',
    ],
    nou: [],
    imbunatatiri: [
      {
        text: 'Panou, Comenzi, Stoc, Rețete, Calendar și Expirări: antetul rămâne fix, doar conținutul se derulează.',
        platforms: ['web', 'ios', 'android'],
      },
      {
        text: 'iPhone: rețetele apar ca și carduri colorate, mai mici, câte două pe rând; pe iPad trei sau mai multe.',
        platforms: ['ios'],
      },
    ],
    reparat: [
      {
        text: 'Android: sesiunea expirată se reînnoiește singură, fără mesajul „Nu am putut reînnoi sesiunea”.',
        platforms: ['android'],
      },
      {
        text: 'Android: cantitățile din rețete cu virgulă sau separator de mii („1.250,5”) se citesc corect.',
        platforms: ['android'],
      },
    ],
    platforms: ['web', 'ios', 'android'],
  },
  {
    version: '1.35.3',
    date: '2026-10-17',
    title: 'Unități de măsură corecte peste tot, rețete colorate pe iPad',
    highlights: [
      'Stocul folosește o singură unitate per produs; schimbarea unității convertește tot (stoc, loturi, jurnal)',
      'Recepția arată conversia înainte de salvare („= 0,6 kg în stoc”)',
      'iPad: rețetele ca pe web, colorate pe categorie',
    ],
    nou: [
      {
        text: 'Recepție: alegi g sau kg și vezi cantitatea convertită în unitatea produsului.',
        platforms: ['web', 'ios'],
      },
    ],
    imbunatatiri: [
      {
        text: 'iPad: rețetele apar ca și carduri colorate, cu stocul și categoria; cele fără stoc sunt gri, la final.',
        platforms: ['ios'],
      },
      {
        text: 'iPad: Stocul nu mai împarte ecranul în listă și detaliu; fiecare ecran se deschide întreg.',
        platforms: ['ios'],
      },
    ],
    reparat: [
      {
        text: 'Schimbarea unității unui produs (kg ↔ g) nu mai lasă stocul, loturile și jurnalul în unități diferite.',
        platforms: ['api'],
      },
      { text: 'Ajustarea stocului aliniază și loturile.', platforms: ['api'] },
      {
        text: 'Stocurile afectate de consumurile de test vechi (g scăzute din kg) au fost corectate.',
        platforms: ['api'],
      },
    ],
    platforms: ['web', 'ios', 'api'],
  },
  {
    version: '1.35.2',
    date: '2026-10-17',
    title: 'Rețete colorate, comenzi fără numere WooCommerce, meniul + din buton',
    highlights: [
      'Rețete: carduri colorate pe categorie, cu stocul mare în colț; cele fără stoc sunt gri, la final, cu „Pornește rețeta”',
      'Comenzile apar peste tot după produs și client, fără numărul din WooCommerce',
      'iOS: meniul + se deschide din buton; calendarele pornesc pe ziua de azi',
    ],
    nou: [
      {
        text: 'Rețete fără stoc: „Pornește rețeta” deschide un task nou cu rețeta aleasă.',
        platforms: ['web'],
      },
      {
        text: 'Calendar: alegi ce straturi vezi (Comenzi, Producție, Expirări); fără selecție vezi tot.',
        platforms: ['web'],
      },
    ],
    imbunatatiri: [
      {
        text: 'Valori nutriționale: tabel ca pe etichetă, cu „Salvează” în antet.',
        platforms: ['web'],
      },
      {
        text: 'Calendar, Comenzi, Panou: produsele și clientul în loc de numărul comenzii.',
        platforms: ['web', 'ios'],
      },
      {
        text: 'iOS: meniul + apare deasupra butonului, nu din partea de sus a ecranului.',
        platforms: ['ios'],
      },
      {
        text: 'iOS: calendarul de producție și cel de comenzi se deschid pe ziua de azi.',
        platforms: ['ios'],
      },
    ],
    reparat: [],
    platforms: ['web', 'ios', 'api'],
  },
  {
    version: '1.35.1',
    date: '2026-10-17',
    title: 'Producție pe 5 coloane, Panou cu logo, comenzi cu produsele în față',
    highlights: [
      'Producție: cinci coloane compacte, mereu pe un rând, cu „Afișează mai multe” și pagină pentru fiecare stare',
      'iOS Panou: logo-ul firmei, bula cu poza și numele tău, fără dată și oră',
      'Comenzi: produs, cantitate, client, număr; cea mai nouă comandă sus',
    ],
    nou: [
      {
        text: 'Producție: coloana Anulat și pagina „Toate” pentru fiecare stare.',
        platforms: ['web'],
      },
      {
        text: 'Identitate: logo pentru temele luminoase și logo pentru temele întunecate.',
        platforms: ['web'],
      },
    ],
    imbunatatiri: [
      {
        text: 'Producție: carduri mai compacte; coloanele goale nu mai afișează nimic.',
        platforms: ['web'],
      },
      {
        text: 'iOS Panou: gradient de accent sus, logo, bula de profil; „Comenzi azi”; fără bule cu numere în meniu.',
        platforms: ['ios'],
      },
      {
        text: 'iOS Comenzi: rândul arată produsul, cantitatea, clientul și numărul fără „WOO”; fără ora de livrare și fără filtre; cea mai nouă comandă sus.',
        platforms: ['ios'],
      },
      { text: 'iOS: titlurile din liste sunt puțin mai mari.', platforms: ['ios'] },
      { text: 'Revizie stocuri: pașii arată mai clar.', platforms: ['web'] },
      {
        text: 'Pozele la rețete sunt ascunse (funcția rămâne disponibilă).',
        platforms: ['web', 'ios'],
      },
    ],
    reparat: [
      {
        text: 'Datele altor firme nu mai apar în activitate, statistici, loturi sau expirări.',
        platforms: ['api'],
      },
      {
        text: 'Recepția în altă unitate (kg în loc de g) adaugă cantitatea corectă.',
        platforms: ['api'],
      },
      {
        text: 'Subtaskurile terminate adaugă semipreparatul în stoc și deblochează taskul principal.',
        platforms: ['api'],
      },
      { text: 'Prețul de vânzare se poate seta din nou.', platforms: ['api'] },
      { text: 'Un utilizator dezactivat iese imediat din aplicație.', platforms: ['api'] },
    ],
    platforms: ['web', 'ios', 'api'],
  },
  {
    version: '1.35.0',
    date: '2026-10-17',
    title: 'Aspect nou pe web și iOS, profil cu setări, fără liste derulante',
    highlights: [
      'Web și iOS au aspectul nou: 6 teme (3 luminoase, 3 întunecate), fonturi noi, butoane cu text și explicații la hover',
      'Profil și Setări sunt o singură pagină, cu taburile Date și Setări; logo pentru temele luminoase și întunecate',
      'Producție: coloane cu „Afișează mai multe”, coloana Anulat și o pagină cu toate taskurile pe fiecare stare',
      'Importul din eBriza citește exportul original (UTF-16)',
    ],
    nou: [
      {
        text: 'Producție: tragi un task dintr-o coloană în alta ca să-i schimbi starea.',
        platforms: ['web'],
      },
      {
        text: 'Producție: „Toate (N)” deschide pagina cu toate taskurile unei stări.',
        platforms: ['web'],
      },
      {
        text: 'Comenzi noi pe web: Livrare sau Ridicare, cu locația de ridicare.',
        platforms: ['web'],
      },
      {
        text: 'Profil: taburile Date și Setări; Deconectare e în antetul profilului.',
        platforms: ['web', 'ios'],
      },
      { text: 'Rețete: poze la rețete (încărcare din web și iOS).', platforms: ['web', 'ios'] },
    ],
    imbunatatiri: [
      {
        text: 'Nicio listă derulantă: alegerile se fac din butoane sau dintr-o listă cu căutare.',
        platforms: ['web', 'ios'],
      },
      {
        text: 'Butoanele din antet au un cuvânt și o explicație la hover; textul tăiat arată numele complet la hover.',
        platforms: ['web'],
      },
      {
        text: 'Stoc: șapte acțiuni rapide și filtrul Epuizate; pe ecrane înguste rămân doar iconițele.',
        platforms: ['web', 'ios'],
      },
      {
        text: 'Contrast mai bun în toate temele: text alb pe culoarea de accent, statusuri lizibile pe fundal întunecat.',
        platforms: ['web', 'ios'],
      },
      {
        text: 'iPad: bară laterală fixă, dock sub conținut, ecranele de stoc și materii prime pe noul aspect.',
        platforms: ['ios'],
      },
      {
        text: 'Datele fără oră nu mai afișează 00:00 sau 03:00; prețurile folosesc virgula.',
        platforms: ['web', 'ios'],
      },
    ],
    reparat: [
      {
        text: 'Sesiunea nu se mai închide la erori temporare de rețea sau prea multe cereri.',
        platforms: ['web', 'ios', 'api'],
      },
      {
        text: 'Crearea de taskuri și consumabile din web funcționează din nou.',
        platforms: ['web', 'api'],
      },
      {
        text: 'Calendarul de comenzi nu mai arată comenzile cu o zi mai devreme.',
        platforms: ['web', 'api'],
      },
      {
        text: 'iOS: trasul în jos pentru reîmprospătare nu mai golește Stocul și nu mai afișează „Eroare cancelled”.',
        platforms: ['ios'],
      },
      { text: 'iOS: lista de comenzi nu mai sare la reîmprospătare.', platforms: ['ios'] },
      { text: 'iOS: Profil și setări nu se mai mișcă lateral.', platforms: ['ios'] },
      { text: 'Loturile de stoc nu mai sunt vizibile altor firme.', platforms: ['api'] },
    ],
    platforms: ['web', 'ios', 'api'],
  },
  {
    version: '1.34.2',
    date: '2026-10-16',
    title: 'Stoc și Comenzi fără cardurile care se ascundeau la scroll',
    highlights: [
      'Cardurile de status de pe Stoc și Comenzi (care dispăreau la scroll) au fost scoase',
      '„Fără stoc” e acum un buton în rândul de acțiuni rapide de pe Stoc, lângă Transferuri',
    ],
    nou: [],
    imbunatatiri: [
      {
        text: 'Stoc: filtrul „Fără stoc” stă în rândul orizontal de acțiuni rapide (apasă → doar produsele pe 0, apasă din nou → toate).',
        platforms: ['ios'],
      },
      {
        text: 'Stoc și Comenzi: cardurile de status care se minimizau la scroll au fost eliminate; lista începe imediat sub acțiunile rapide.',
        platforms: ['ios'],
      },
    ],
    reparat: [],
    platforms: ['ios', 'api'],
  },
  {
    version: '1.34.1',
    date: '2026-10-16',
    title: 'Noutățile, vizibile și în producție',
    highlights: [
      'Pagina „Noutăți” (versiune cu versiune) e disponibilă pe web și pe iPhone, nu doar pe mediul de test',
    ],
    nou: [],
    imbunatatiri: [
      {
        text: 'Setări › Noutăți duce la istoricul versiunilor; pe iPhone apare și fereastra „Ce e nou” după actualizare.',
        platforms: ['web', 'ios'],
      },
    ],
    reparat: [
      {
        text: 'Pagina /changelog răspundea 404 în producție (rămăsese blocată pe mediul de test).',
        platforms: ['web'],
      },
    ],
    platforms: ['web', 'ios', 'api'],
  },
  {
    version: '1.34.0',
    date: '2026-10-16',
    title: 'Revizie stocuri, jurnalul lunii și scăderea automată a comenzilor de pe site',
    highlights: [
      'Stoc › Revizie stocuri: Excel cu TOT stocul pe loturi, îl corectezi și îl încarci înapoi — se ajustează doar ce e în fișier, cu raport',
      'Mișcări de stoc: jurnalul se deschide pe ultima lună, cu interval de date și export Excel',
      'Comenzile de pe site ajunse „în procesare” se scad automat din stoc',
    ],
    nou: [
      {
        text: 'Revizie stocuri: export Excel cu patru foi (Materii prime, Consumabile, Semipreparate, Produse finite), un rând per lot — nume, furnizor, factură, data expirării, preț de achiziție, cantitate. Importul aceluiași fișier (și parțial) ajustează DOAR rândurile găsite și arată raportul cu ce s-a schimbat; fiecare cantitate ajustată apare în Mișcări ca „Revizie stocuri”.',
        platforms: ['api', 'web'],
      },
      {
        text: 'Revizie stocuri pe telefon: exportul Excel se descarcă și se trimite din Stoc › Revizie (admin); fișierul corectat se încarcă pe web.',
        platforms: ['ios', 'android'],
      },
      {
        text: 'Mișcări de stoc: export Excel al jurnalului (dată, tip, produs, fel, categorie, cantitate, locație, task, notă, cine), cu filtrele listei.',
        platforms: ['api', 'web', 'ios', 'android'],
      },
      {
        text: 'Comenzile WooCommerce cu status „în procesare” (sau finalizate) se scad automat din stocul locației implicite în momentul în care ajung în Horae — o singură dată per comandă; produsele nepotrivite rămân pe scădere, de verificat. Scăderile manuale pe interval sar comenzile deja scăzute.',
        platforms: ['api', 'web'],
      },
    ],
    imbunatatiri: [
      {
        text: 'Mișcări de stoc: lista se deschide pe ultimele 30 de zile și are interval „De la / Până la”.',
        platforms: ['web'],
      },
      {
        text: 'Webhook-urile WooCommerce de tip „comandă actualizată” nu mai eșuează pentru comenzi deja primite — actualizează comanda stocată.',
        platforms: ['api'],
      },
    ],
    reparat: [],
    platforms: ['api', 'web', 'ios', 'android'],
  },
  {
    version: '1.33.0',
    date: '2026-10-16',
    title: 'Scăderea stocului din vânzări, pornită în producție',
    highlights: [
      'Stoc › Vânzări e disponibil acum și în producție: Excel/CSV din eBriza, manual sau comenzile de pe site',
      'Șablon CSV cu toate produsele (completezi doar cantitatea) pentru scoateri manuale din stoc',
      'Butonul Acasă din bara de jos pe Android funcționează din orice ecran',
    ],
    nou: [
      {
        text: 'Șablon CSV pentru scoateri manuale: din „Scădere nouă” › Upload Excel descarci un fișier cu toate produsele vândabile (Denumire; Cantitate; U.M.), completezi cantitățile și îl încarci înapoi.',
        platforms: ['api', 'web', 'ios', 'android'],
      },
    ],
    imbunatatiri: [
      {
        text: 'Scăderea stocului din vânzări (eBriza .xlsx/.csv, manual, WooCommerce) e activă în producție, nu doar pe mediul de test.',
        platforms: ['api', 'web', 'ios', 'android'],
      },
      {
        text: 'Raportul CSV exportat din WooCommerce (Analytics › Produse: „Product title” / „Items sold”) e recunoscut la încărcare.',
        platforms: ['api'],
      },
    ],
    reparat: [
      {
        text: 'Android: butonul „Acasă” din bara de jos nu făcea nimic din unele ecrane.',
        platforms: ['android'],
      },
    ],
    platforms: ['api', 'web', 'ios', 'android'],
  },
  {
    version: '1.32.1',
    date: '2026-10-16',
    title: 'Caruselul de categorii, curățat',
    highlights: [
      'Categoriile fără produse nu mai apar în carusel',
      'Când alegi o categorie, plăcile mari (Materii prime / Semipreparate / Produse finite) rămân toate la locul lor',
    ],
    nou: [],
    imbunatatiri: [],
    reparat: [
      {
        text: 'Stoc: în carusel apăreau categorii cu 0 produse; acum apar doar cele care au ceva în ele (o categorie principală numără și subcategoriile).',
        platforms: ['web', 'ios', 'android'],
      },
      {
        text: 'Stoc pe iPhone/iPad: când alegeai o categorie din carusel, celelalte plăci mari dispăreau; acum rămân toate, iar numărul lor nu depinde de categoria aleasă.',
        platforms: ['ios'],
      },
    ],
    platforms: ['web', 'ios', 'android'],
  },
  {
    version: '1.32.0',
    date: '2026-10-16',
    title: 'Categoria mare, apoi caruselul de categorii',
    highlights: [
      'La Stoc: alegi categoria mare (Materii prime / Semipreparate / Produse finite), iar sub ea apare caruselul cu categoriile ei, ca înainte',
      'Un chip filtrează; apeși din nou pe el și revii la toată categoria mare. Nu mai există „Toate”',
    ],
    nou: [],
    imbunatatiri: [
      {
        text: 'Stoc: sub plăcile Materii prime / Semipreparate / Produse finite apare caruselul cu categoriile celei alese (chips, ca înainte); un chip filtrează lista, apăsat din nou o deselectează. Pe web la fel, cu tabelele grupate pe categorie.',
        platforms: ['web', 'ios', 'android'],
      },
      {
        text: 'Rețete pe iPhone/iPad: plăcile de categorii au fost înlocuite cu caruselul de categorii al tipului ales, ca înainte.',
        platforms: ['ios'],
      },
    ],
    reparat: [],
    platforms: ['web', 'ios', 'android'],
  },
  {
    version: '1.31.2',
    date: '2026-10-16',
    title: 'Stoc pe web: trei plăci mari; grupuri pliabile pe telefon',
    highlights: [
      'Pe web, Stoc are trei plăci mari (Materii prime / Semipreparate / Produse finite), iar lista e grupată pe categorie',
      'Rețete pe web revine la chips-urile de categorii de dinainte',
      'Pe telefon, grupurile pe categorie din Stoc și Produse se pot plia dintr-un tap pe eticheta categoriei',
    ],
    nou: [],
    imbunatatiri: [
      {
        text: 'Stoc pe web: în locul comutatorului Materii prime / Semipreparate / Byproduct sunt trei plăci mari colorate (Materii prime, Semipreparate, Produse finite) cu numărul de articole, iar tabelul de sub ele e împărțit pe categorii, cu categoria ca etichetă deasupra fiecărui grup.',
        platforms: ['web'],
      },
      {
        text: 'Grupurile pe categorie din Stoc și Produse se pliază/depliază cu un tap pe eticheta categoriei.',
        platforms: ['ios', 'android'],
      },
    ],
    reparat: [
      {
        text: 'Rețete pe web: plăcile de categorii au fost scoase, lista de categorii e din nou cea de dinainte.',
        platforms: ['web'],
      },
    ],
    platforms: ['web', 'ios', 'android'],
  },
  {
    version: '1.31.1',
    date: '2026-10-16',
    title: 'Plăcile de categorii apar și fără numărătoare',
    highlights: ['Plăcile de categorii de la Rețete apar chiar dacă numărătoarea nu e disponibilă'],
    nou: [],
    imbunatatiri: [],
    reparat: [
      {
        text: 'La Rețete, plăcile de categorii nu apăreau deloc dacă serverul nu răspundea la numărătoarea pe categorii; acum apar toate, fără numere.',
        platforms: ['web'],
      },
    ],
    platforms: ['web'],
  },
  {
    version: '1.31.0',
    date: '2026-10-16',
    title: 'Categoriile ca plăci, nu ca listă derulantă',
    highlights: [
      'La Rețete, categoriile sunt plăci mici colorate (număr de rețete, prim/semi/finit); categoriile goale nu mai apar',
      'La Stoc și Produse pe telefon: trei plăci (Materii prime / Semipreparate / Produse finite), iar produsele sunt grupate pe categorie, cu categoria ca etichetă deasupra grupului',
    ],
    nou: [],
    imbunatatiri: [
      {
        text: 'Filtrul de categorie de la Rețete e un „bento”: fiecare categorie principală e o placă mică în culoarea ei, cu numărul de rețete și eticheta prim/semi/finit; subcategoriile apar ca pastile doar la categoria aleasă; categoriile fără rețete nu apar. Nicio listă derulantă.',
        platforms: ['web', 'ios'],
      },
      {
        text: 'La Stoc (iPhone/iPad) și Produse: sub locații sunt trei plăci — Materii prime, Semipreparate, Produse finite — iar lista e grupată pe categorie, cu categoria ca pastilă în capul fiecărui grup.',
        platforms: ['ios', 'android'],
      },
    ],
    reparat: [],
    platforms: ['api', 'web', 'ios', 'android'],
  },
  {
    version: '1.30.0',
    date: '2026-10-16',
    title: 'Categoriile, mai ușor de navigat',
    highlights: [
      'În liste (rețete, produse, stoc) categoriile se aleg dintr-un selector compact cu categoriile principale; subcategoriile apar doar după ce alegi o categorie',
    ],
    nou: [],
    imbunatatiri: [
      {
        text: 'Filtrul de categorie din liste (rețete, produse, stoc) nu mai e un șir nesfârșit cu fiecare subcategorie: un selector cu categoriile principale, iar după ce alegi una, doar subcategoriile ei. O categorie principală aleasă include automat și subcategoriile ei.',
        platforms: ['api', 'web', 'ios', 'android'],
      },
    ],
    reparat: [],
    platforms: ['api', 'web', 'ios', 'android'],
  },
  {
    version: '1.29.1',
    date: '2026-10-16',
    title: 'Numele taskului, primul câmp',
    highlights: ['La „Task nou” pe web, numele taskului e primul câmp din formular'],
    nou: [],
    imbunatatiri: [
      {
        text: 'La „Task nou”, câmpul „Nume task” este acum primul din formular, înaintea rețetei.',
        platforms: ['web'],
      },
    ],
    reparat: [],
    platforms: ['web'],
  },
  {
    version: '1.29.0',
    date: '2026-10-16',
    title: 'Nume și vizibilitate la taskuri, locație implicită, dock pe iPad',
    highlights: [
      'Taskurile pot avea un nume propriu, nu doar numele rețetei',
      'Vizibilitatea unui task: doar cine e asignat, toată lumea sau anumite persoane; administratorii văd tot',
      'O locație implicită pentru toată organizația: se preselectează la orice operațiune (task, recepție, stoc nou, vânzări, consum test, transfer)',
      'Pe iPad poți ascunde meniul lateral; navigarea și acțiunile rapide trec într-un dock centrat jos',
    ],
    nou: [
      {
        text: 'Nume custom la task: câmpul „Nume task” la creare (și la editare pe iPhone/Android); gol = numele rețetei. Numele apare în liste, pe panou, în detalii și pe Acasă, iar căutarea îl găsește.',
        platforms: ['api', 'web', 'ios', 'android'],
      },
      {
        text: 'Vizibilitate per task: „Doar cine e asignat” (implicit), „Toată lumea” sau „Anumite persoane” (persoanele alese plus cel asignat). Administratorii și cei cu drept de administrare a taskurilor văd toate taskurile, inclusiv în calendarul de producție.',
        platforms: ['api', 'web', 'ios', 'android'],
      },
      {
        text: 'Locația implicită a organizației se setează din lista de locații (steluța / comutatorul „Implicită”, doar administratori) și e preselectată la orice operațiune: task nou, recepție marfă, stoc nou, vânzări, consum test și sursa transferurilor. Dacă nu e setată, rămâne regula veche: laboratorul, apoi prima locație.',
        platforms: ['web', 'ios', 'android'],
      },
      {
        text: 'Pe iPad: buton de ascundere a meniului lateral; cu meniul ascuns, secțiunile (Acasă, Comenzi, Producție, Stoc, Rețete) și acțiunile rapide (Stoc nou, Task nou, Rețetă nouă, Transfer) stau într-un dock plutitor centrat jos, iar conținutul folosește toată lățimea.',
        platforms: ['ios'],
      },
    ],
    imbunatatiri: [],
    reparat: [],
    platforms: ['web', 'ios', 'android'],
  },
  {
    version: '1.28.1',
    date: '2026-10-16',
    title: 'Aplicația pe iPad',
    highlights: [
      'Pe iPad aplicația are acum un meniu lateral (secțiuni, instrumente, administrare, cont) în loc de bara de taburi',
      'Listele de taskuri, comenzi, rețete și stoc se afișează ca grilă de carduri, panoul de producție umple ecranul, iar acasă e pe două coloane',
      'Linkurile de resetare a parolei și de invitație trimise din producție duc din nou la aplicație',
    ],
    nou: [
      {
        text: 'Layout dedicat pentru iPad: meniu lateral cu secțiunile principale, instrumentele (calendare, transferuri, recepție, expirări, necesar MP, analitice), administrarea și contul; acasă pe două coloane cu mai multe rânduri la stoc și producție; listele principale ca grilă de carduri pe 2–3 coloane; panoul de producție cu toate cele cinci coloane vizibile; formularele, detaliile și setările centrate pe o coloană lizibilă.',
        platforms: ['ios'],
      },
    ],
    imbunatatiri: [],
    reparat: [
      {
        text: 'Linkurile din emailurile de resetare a parolei / invitație deschideau o pagină inexistentă (vechiul app.acadeea.ro); acum duc la adresa organizației.',
        platforms: ['api', 'web'],
      },
      {
        text: '„Continuă cu Google” / „Continuă cu Apple” și conectarea conturilor din Setări nu erau activate în producție.',
        platforms: ['api', 'ios', 'web'],
      },
    ],
    platforms: ['api', 'web', 'ios'],
  },
  {
    version: '1.28.0',
    date: '2026-10-12',
    title: 'Acțiuni multiple',
    highlights: [
      'În modul „Selectează” ai acum meniul Acțiuni: schimbi starea, asignezi, muți data, pui categoria sau arhivezi mai multe rânduri odată',
      'Bara de selecție pe iOS e mai curată: Toate · N selectate · Acțiuni · coș',
    ],
    nou: [
      {
        text: 'Acțiuni multiple pe listele principale: taskuri (stare, asignare, dată planificată, termen, prioritate, locație), comenzi (stare, livrator, termen, arhivare), transferuri (în tranzit / finalizează / anulează), materii prime și consumabile (categorie, activ/întrerupt, furnizor, stoc minim), rețete (arhivare, ciornă, categorie), vânzări (renunță / anulează). Fiecare rând care nu permite acțiunea e raportat cu motivul, restul se actualizează.',
        platforms: ['api', 'web', 'ios', 'android'],
      },
    ],
    imbunatatiri: [
      {
        text: 'Bara de selecție a fost refăcută: butonul de ștergere e doar coșul, acțiunile stau într-un meniu, „Gata” din bara de sus închide selecția.',
        platforms: ['ios'],
      },
    ],
    reparat: [],
    platforms: ['api', 'web', 'ios', 'android'],
  },
  {
    version: '1.27.0',
    date: '2026-10-12',
    title: 'Selectează și șterge',
    highlights: [
      'Buton „Selectează" pe listele de taskuri, comenzi, transferuri, rețete, materii prime, consumabile și vânzări',
      'Bifezi ce vrei și ștergi dintr-o dată; dacă ceva depinde de ce ștergi, îți arată ce se duce cu el și îți cere confirmarea',
    ],
    nou: [
      {
        text: 'Mod de selecție pe listele principale: bifezi mai multe rânduri și le ștergi împreună, cu confirmare.',
        platforms: ['web', 'ios', 'android'],
      },
      {
        text: 'Înainte de ștergere vezi exact ce se mai duce cu rândurile alese (taskuri ale rețetei, linii de comandă, rețete care folosesc materia primă etc.) și confirmi; nu mai există „nu se poate șterge pentru că…”.',
        platforms: ['api', 'web', 'ios', 'android'],
      },
      {
        text: 'Transferurile active șterse returnează stocul la sursă; scăderile de vânzări confirmate se anulează (stocul revine) înainte de ștergere.',
        platforms: ['api'],
      },
    ],
    imbunatatiri: [],
    reparat: [],
    platforms: ['api', 'web', 'ios', 'android'],
  },
  {
    version: '1.26.0',
    date: '2026-10-12',
    title: 'Resetare date',
    highlights: [
      'Setări → Resetare date: golești exact ce vrei — producție, stocuri, transferuri, comenzi, vânzări, notificări',
      'Rețetele și materiile prime nu se ating decât dacă le bifezi explicit; înainte se face backup automat',
    ],
    nou: [
      {
        text: 'Resetare date (Setări → Administrare → „Resetare date”, doar administratori): alegi categoriile de golit — Producție (taskuri), Stocuri, Transferuri, Comenzi și livrări, Vânzări → stoc, Notificări — și vezi pentru fiecare câte înregistrări se șterg. Dependențele se bifează automat (de exemplu rețetele trag după ele taskurile, stocurile, comenzile). Confirmare prin cuvântul RESETEAZA.',
        platforms: ['api', 'web', 'ios', 'android'],
      },
      {
        text: 'Rețetele și materiile prime / consumabilele stau într-o zonă separată „Date de bază” și nu se șterg niciodată implicit — doar dacă le bifezi explicit. Nu există buton „reset la tot”.',
        platforms: ['api', 'web', 'ios', 'android'],
      },
      {
        text: 'Înainte de orice resetare se salvează automat starea organizației în Backup & Restaurare („Înainte de resetare (…)”), de unde poți reveni dacă te răzgândești. Resetarea apare și în Jurnal sistem.',
        platforms: ['api'],
      },
    ],
    imbunatatiri: [],
    reparat: [],
    platforms: ['api', 'web', 'ios', 'android'],
  },
  {
    version: '1.25.0',
    date: '2026-10-04',
    title: 'Vânzări → stoc și pe telefon',
    highlights: [
      'Scazi din stoc ce s-a vândut direct din aplicație: raport eBriza, manual sau comenzile de pe site',
      'Verifici fiecare produs, ajustezi cantitatea și confirmi totul o dată — stocul nu ajunge pe minus',
    ],
    nou: [
      {
        text: 'Vânzări → stoc în aplicația de telefon (din ecranul Stoc → „Vânzări”, sau „Scade vânzări” de la produse): alegi locația, apoi sursa — fișierul Excel exportat din eBriza, introducere manuală sau comenzile de pe site dintr-un interval.',
        platforms: ['ios', 'android'],
      },
      {
        text: 'Ecranul de confirmare pe telefon: „Scade”, „Produs nou” sau „Ignoră” pe fiecare produs, schimbi produsul potrivit, ajustezi cantitatea cu +/−, alegi între „oprește la 0” și „suprascrie stocul” când s-a vândut mai mult decât era. Jurnalul scăderilor, cu anulare, e disponibil și aici.',
        platforms: ['ios', 'android'],
      },
    ],
    imbunatatiri: [],
    reparat: [],
    platforms: ['ios', 'android'],
  },
  {
    version: '1.24.0',
    date: '2026-10-02',
    title: 'Jurnal sistem și invitații care nu se mai blochează',
    highlights: [
      'Setări → Jurnal sistem: vezi tot ce se întâmplă — acțiuni, erori, emailuri, joburi',
      'Invitațiile se pot retrimite, iar un email eșuat nu mai blochează invitația',
    ],
    nou: [
      {
        text: 'Jurnal sistem (Setări → Jurnal sistem, pentru administratori): fiecare acțiune care modifică date (cine, ce, când, rezultat), fiecare eroare, autentificările reușite și eșuate, emailurile trimise sau eșuate (cu motivul), joburile automate (backup, arhivare comenzi, expirări) și sincronizările WooCommerce. Filtre pe tip, nivel, dată și căutare liberă, mod „Live”, detalii complete pe fiecare intrare. Intrările se păstrează 90 de zile.',
        platforms: ['api', 'web'],
      },
    ],
    imbunatatiri: [
      {
        text: 'Invitarea din nou a aceluiași email retrimite invitația (link nou, valabil 72 de ore) în loc să dea eroare.',
        platforms: ['api'],
      },
    ],
    reparat: [
      {
        text: 'Când emailul de invitație nu putea fi trimis, invitația rămânea „în așteptare” și nu mai putea fi refăcută. Acum primești motivul exact, iar invitația nu rămâne blocată.',
        platforms: ['api'],
      },
    ],
    platforms: ['api', 'web'],
  },
  {
    version: '1.23.0',
    date: '2026-10-02',
    title: 'Vânzări → stoc: scazi din stoc ce s-a vândut, dintr-un raport sau manual',
    highlights: [
      'Încarci raportul de vânzări din eBriza și produsele se recunosc automat după nume',
      'Verifici totul pe un singur ecran și confirmi o dată — stocul nu ajunge niciodată pe minus',
    ],
    nou: [
      {
        text: 'Vânzări → stoc (Stoc → „Vânzări → stoc” sau butonul „Scade vânzări” din Stoc produse): alegi locația, apoi sursa — raportul Excel exportat din eBriza, introducere manuală sau comenzile de pe site dintr-un interval. Produsele din raport sunt potrivite automat cu cele din aplicație după nume (de ex. „sos usturoi” = „Sos de usturoi”), iar potrivirile pe care le confirmi sunt reținute pentru data viitoare.',
        platforms: ['api', 'web'],
      },
      {
        text: 'Ecran de confirmare: pentru fiecare produs alegi „Scade”, „Produs nou” sau „Ignoră”, schimbi produsul potrivit și ajustezi cantitatea cu +/− (o cantitate negativă pune marfa înapoi în stoc). Dacă s-a vândut mai mult decât era în stoc, primești un avertisment: stocul se oprește la 0 (vânzarea rămâne înregistrată integral) sau îl suprascrii cu cât ai numărat pe raft.',
        platforms: ['web'],
      },
      {
        text: 'Produsele din raport care nu există în aplicație pot fi adăugate pe loc, cu cantitatea pe care o ai acum în stoc. Totul se aplică într-un singur pas, cu o singură notificare-rezumat, iar fiecare scădere rămâne în jurnal (cine, când, stoc înainte/după) și poate fi anulată.',
        platforms: ['api', 'web'],
      },
    ],
    imbunatatiri: [
      {
        text: 'Mișcările de stoc au un tip nou, „Vânzare”, afișat în istoricul de mișcări.',
        platforms: ['api', 'web', 'ios', 'android'],
      },
    ],
    reparat: [],
    platforms: ['api', 'web', 'ios', 'android'],
  },
  {
    version: '1.22.0',
    date: '2026-08-30',
    title: 'Mod tutorial: sfaturi contextuale, pentru fiecare utilizator',
    highlights: [
      'Fiecare utilizator își poate porni singur, din Profil, sfaturi contextuale pe ecran',
      'Centru de ajutor cu explicații căutabile pentru fiecare funcție a aplicației',
    ],
    nou: [
      {
        text: 'Mod tutorial (Profil → Preferințe — fiecare utilizator îl pornește sau oprește singur, nu e o setare de organizație): odată activat, apar sfaturi contextuale exact acolo unde ai nevoie — de exemplu, la adăugarea unei materii prime, un mesaj lângă câmpul de unitate de măsură. Fiecare sfat se închide o singură dată („Am înțeles”), fără să blocheze restul ecranului. Un „Centru de ajutor” cu ghiduri căutabile pentru task-uri, rețete, stoc, comenzi, locații, utilizatori și setări rămâne disponibil oricând, cu opțiunea unui tur ghidat pas-cu-pas.',
        platforms: ['api', 'web', 'ios', 'android'],
      },
    ],
    imbunatatiri: [],
    reparat: [],
    platforms: ['api', 'web', 'ios', 'android'],
  },
  {
    version: '1.21.2',
    date: '2026-08-30',
    title: 'Locație de producție/recepție implicită, controlabilă din admin',
    highlights: [
      'Administratorul poate seta orice locație ca implicită pentru taskuri și recepția de marfă',
    ],
    nou: [],
    imbunatatiri: [
      {
        text: 'Locație implicită de producție/recepție: un administrator poate seta din pagina de locații orice locație ca implicită (nu doar „Laborator”). Se preselectează automat la crearea unui task și la recepția de marfă.',
        platforms: ['api', 'web'],
      },
    ],
    reparat: [],
    platforms: ['api', 'web'],
  },
  {
    version: '1.21.1',
    date: '2026-08-30',
    title: 'Corecții la loturile produselor finite și taskul multiplu',
    highlights: [
      'Numele loturilor de produse finite folosesc acum ziua calendaristică a României, nu ora serverului',
      'Butonul de ștergere de la taskul multiplu are dimensiunea corectă',
      'Locația implicită la recepția de marfă e acum „Laborator”',
    ],
    nou: [],
    imbunatatiri: [
      {
        text: 'La recepția de marfă, locația implicită e acum „Laborator” (dacă există), la fel ca la crearea unui task.',
        platforms: ['web'],
      },
    ],
    reparat: [
      {
        text: 'Numărul lotului la produsele finite (ex. „10082026-Fistic 1”) se calculează după ziua calendaristică din România, nu după ora serverului — o șarjă produsă noaptea nu mai primea data zilei greșite. Două finalizări simultane pentru același produs nu mai pot genera din greșeală același număr de lot.',
        platforms: ['api'],
      },
      {
        text: 'La taskul multiplu, butonul de ștergere a unui produs din listă avea o dimensiune prea mare față de celelalte controale din rând.',
        platforms: ['web'],
      },
    ],
    platforms: ['api', 'web'],
  },
  {
    version: '1.21.0',
    date: '2026-08-08',
    title: 'Taskuri multiple, loturi la produse finite și backup automat',
    highlights: [
      'Poți crea mai multe taskuri odată, cu tot cu semipreparatele rețetei',
      'Produsele finite au acum loturi separate pe fiecare șarjă, cu data lor de expirare',
      'Backup automat în fiecare noapte + „Salvează starea” manual, cu restaurare dintr-un click',
    ],
    nou: [
      {
        text: 'Task multiplu și „familie” de taskuri: creezi mai multe produse într-un singur pas (ex. toate sosurile de înghețată), opțional cu taskuri generate automat pentru fiecare semipreparat din rețetă. Taskurile create împreună poartă o etichetă de grup vizibilă pe board.',
        platforms: ['api', 'web', 'ios'],
      },
      {
        text: 'Stoc diferențiat pe loturi la produse finite și semipreparate: fiecare șarjă produsă primește propriul număr de lot și propria dată de expirare, iar consumul se face automat din lotul cel mai vechi. Vezi loturile din pagina de stoc produse.',
        platforms: ['api', 'web', 'ios'],
      },
      {
        text: 'Consum pentru teste: materiile prime folosite la probe/teste se scad din stoc cu un motiv dedicat, vizibil în istoricul mișcărilor.',
        platforms: ['api', 'web', 'ios'],
      },
      {
        text: 'Export și import de stoc în Excel (doar administratori): descarci tot stocul într-un fișier editabil, iar la import vezi întâi exact ce se schimbă și confirmi.',
        platforms: ['api', 'web'],
      },
      {
        text: 'Backup & Restaurare în Setări: aplicația își salvează singură starea în fiecare noapte, iar tu poți salva manual („Salvează starea acum”) și restaura organizația la orice moment salvat. În plus, un backup separat al întregii baze de date rulează zilnic pe server.',
        platforms: ['api', 'web'],
      },
    ],
    imbunatatiri: [
      {
        text: 'La crearea unui task, rețetele apar în ordine alfabetică, iar locația de producție „Laborator” e preselectată.',
        platforms: ['web', 'ios'],
      },
      {
        text: 'Pe telefonul Android, mișcarea de tip „Intrare” are acum câmpuri pentru numărul de lot, data expirării și prețul de achiziție — recepțiile făcute de pe telefon nu mai pierd aceste informații.',
        platforms: ['android'],
      },
    ],
    reparat: [
      {
        text: 'Din stoc se poate ajunge acum la fișa oricărui produs finit sau semipreparat (înainte, unele produse duceau la o pagină fără informații) și istoricul de randament al rețetelor se afișează corect.',
        platforms: ['web'],
      },
    ],
    platforms: ['api', 'web', 'ios', 'android'],
  },
  {
    version: '1.20.0',
    date: '2026-08-07',
    title: 'Comenzi din magazinul online și arhivarea comenzilor',
    highlights: [
      'Comenzile din magazinul online (WooCommerce) intră singure în aplicație, cu numele clientului și produsele reale',
      'Comenzile livrate sau anulate pot fi arhivate — iar după 60 de zile se arhivează singure',
      'Filtru „Ziua mea” pe board: vezi doar taskurile tale relevante pentru azi',
    ],
    nou: [
      {
        text: 'Integrare WooCommerce: comenzile din magazinul online sunt preluate automat la fiecare 15 minute, cu numele clientului, produsele comandate și data de livrare. Produsele care nu au încă o rețetă asociată apar cu numele lor real din magazin, nu se mai pierd.',
        platforms: ['api', 'web', 'ios', 'android'],
      },
      {
        text: 'Arhivarea comenzilor: comenzile livrate sau anulate pot fi arhivate (individual din pagina comenzii sau toate odată cu „Arhivează finalizatele”), iar cele închise de peste 60 de zile se arhivează automat în fiecare noapte. Comenzile arhivate rămân accesibile din filtrul „Arhivate”, dar nu mai încarcă listele, statisticile sau calendarul.',
        platforms: ['api', 'web'],
      },
      {
        text: 'Filtrul „Ziua mea” pe board-ul de producție: un singur buton care arată doar taskurile tale — cele scadente azi, restante sau fără termen — pe web, iPhone și Android.',
        platforms: ['api', 'web', 'ios', 'android'],
      },
    ],
    imbunatatiri: [
      {
        text: 'Comenzile din iPhone arată acum numele clientului, produsele și data livrării direct în listă și în calendar.',
        platforms: ['ios'],
      },
      {
        text: 'Pagina de comenzi de pe web a fost reorganizată: cardurile de status sunt singurul filtru (fără filtre duplicate), iar tabelul nu mai iese din pagină indiferent de lungimea denumirilor.',
        platforms: ['web'],
      },
    ],
    reparat: [
      {
        text: 'Comenzile cu produse fără rețetă asociată nu mai dispar din aplicațiile de telefon (eroarea „The data couldn’t be read”).',
        platforms: ['ios', 'android'],
      },
      {
        text: 'Nu mai apare o licărire a ecranului de încărcare imediat după autentificare pe web.',
        platforms: ['web'],
      },
      {
        text: 'Pachet de reparații din sesizările echipei: sincronizarea WooCommerce nu mai inventează produse la comenzile nemapate, plus corecturi la rețete, taskuri și stoc.',
        platforms: ['api', 'web'],
      },
    ],
    platforms: ['api', 'web', 'ios', 'android'],
  },
  {
    version: '1.19.0',
    date: '2026-08-03',
    title: 'Notificări push pe iPhone și autentificare cu Apple',
    highlights: [
      'Notificările importante ajung acum ca notificare push pe telefon, nu doar în aplicație',
      'Autentificarea „Continuă cu Apple” funcționează acum și în aplicația publicată',
    ],
    nou: [
      {
        text: 'Notificări push reale pe iOS: alertele (de ex. materiale pe cale să expire) sunt trimise ca notificare pe telefon prin serviciul Apple, către toate dispozitivele pe care ești autentificat. Dispozitivele care nu mai sunt valide sunt curățate automat.',
        platforms: ['api', 'ios'],
      },
    ],
    imbunatatiri: [
      {
        text: 'Autentificarea „Continuă cu Apple” este acum activă și pe mediul de producție (până acum funcționa doar pe cel de test).',
        platforms: ['api', 'ios'],
      },
    ],
    reparat: [],
    platforms: ['api', 'ios'],
  },
  {
    version: '1.18.0',
    date: '2026-07-31',
    title: 'Comenzi din WooCommerce, ștergere cont și comenzi pentru cofetari',
    highlights: [
      'Comenzile din magazinul online (WooCommerce) intră automat în Horae, cu termenul de ridicare completat din textul clientului',
      'Îți poți șterge contul direct din aplicație',
      'Șefii de cofetărie și cofetarii pot acum vedea și edita comenzile',
    ],
    nou: [
      {
        text: 'Import automat de comenzi din WooCommerce: comenzile din magazinul online apar în Horae ca și comenzi (numerotate WOO-…, cu sursa marcată), verificate la fiecare 15 minute. Fiecare produs din magazin se mapează manual la o rețetă de către administrator.',
        platforms: ['api'],
      },
      {
        text: 'Termenul de ridicare scris liber de client (ex. „28.07.2026", „duminică, 2 august", „mâine") este interpretat automat și completat ca dată pe comandă; ce nu se poate citi cu siguranță rămâne gol, cu textul original în notițe, pentru verificare.',
        platforms: ['api'],
      },
      {
        text: 'Ștergerea contului: din Setări îți poți șterge singur contul, cu confirmarea parolei. Datele personale sunt anonimizate și nu te mai poți autentifica. Ultimul administrator activ nu-și poate șterge contul până nu atribuie rolul altcuiva.',
        platforms: ['api', 'web', 'ios', 'android'],
      },
    ],
    imbunatatiri: [
      {
        text: 'Șeful de cofetărie și cofetarul pot acum vedea și edita comenzile (până acum șeful doar le vedea, iar cofetarul nu avea acces). Editarea rețetelor rămâne doar la administrator.',
        platforms: ['api', 'web', 'ios', 'android'],
      },
      {
        text: 'Protecție împotriva abuzului pe server (limitare de rate): un plafon global de cereri și unul mai strict pe autentificare, ca serviciul să rămână stabil.',
        platforms: ['api'],
      },
    ],
    reparat: [
      {
        text: 'Termenul comenzii („Termen") este acum validat ca dată reală, nu text liber — nu se mai poate salva o valoare care nu e dată.',
        platforms: ['api', 'web', 'ios', 'android'],
      },
      {
        text: 'Pe iOS, în vederea „toate locațiile", stocul scăzut și epuizat este acum însumat corect pe locații, nu raportat separat.',
        platforms: ['ios'],
      },
    ],
    platforms: ['api', 'web', 'ios', 'android'],
  },
  {
    version: '1.17.0',
    date: '2026-07-22',
    title: 'Android la paritate: calendar livrări, istoric preț, documente transfer',
    highlights: [
      'Aplicația de Android a primit calendarul de livrări, istoricul de preț la materii prime și documentele de transfer (aviz + declarație de conformitate)',
    ],
    nou: [
      {
        text: 'Pe Android: calendar de livrări (Zi / Săptămână / Lună) în Comenzi, grupat pe zile — aceleași vizualizări ca pe iOS și web.',
        platforms: ['android'],
      },
      {
        text: 'Pe Android: istoricul prețului de achiziție la materii prime, cu grafic de evoluție, direct în detaliul materiei prime.',
        platforms: ['android'],
      },
      {
        text: 'Pe Android: din detaliul unui transfer poți genera și tipări (sau salva ca PDF) avizul de însoțire a mărfii și declarația de conformitate — la fel ca pe iOS.',
        platforms: ['android'],
      },
    ],
    imbunatatiri: [],
    reparat: [],
    platforms: ['android'],
  },
  {
    version: '1.16.1',
    date: '2026-07-22',
    title: 'Byproducturile intră în stoc la finalizarea producției',
    highlights: [
      'La finalizarea unui task, byproducturile rețetei intră automat în stocul de semipreparate',
    ],
    nou: [],
    imbunatatiri: [],
    reparat: [
      {
        text: 'Byproducturile declarate pe o rețetă intră acum automat în stoc la finalizarea producției (scalate cu mărimea șarjei), cu mișcare de intrare în istoricul de stoc și termen de valabilitate propriu. Până acum rămâneau doar declarate, fără să apară nicăieri după producție.',
        platforms: ['api', 'web', 'ios', 'android'],
      },
    ],
    platforms: ['api', 'web', 'ios', 'android'],
  },
  {
    version: '1.16.0',
    date: '2026-07-16',
    title: 'Design nou pe web, Android reconstruit + byproducturi',
    highlights: [
      'Aplicația web are un design complet nou: mai aerisit, mai cald, mai ușor de citit',
      'Aplicația de Android a fost reconstruită complet, la paritate cu iOS ca design și funcții',
      'Un singur selector cu căutare pentru toate ingredientele (materii prime, semipreparate, byproducturi)',
      'O rețetă poate lăsa în urmă un byproduct, salvat automat ca semipreparat',
    ],
    nou: [
      {
        text: 'Aplicația de Android a fost reconstruită de la zero, cu același design cald și aceleași funcții ca pe iOS: producție, comenzi, stoc (materii prime, semipreparate, produse, consumabile), rețete (vizualizare, creare și editare cu selector unificat de ingrediente și byproducturi), transferuri între locații, locații și echipamente.',
        platforms: ['android'],
      },
      {
        text: 'Pe Android au apărut și: notificări în aplicație (clopoțel cu contor de necitite), analitice (producție, comenzi, productivitatea echipei), integrări eBriza / WooCommerce, editarea unui task și istoricul de randament la rețete.',
        platforms: ['android'],
      },
      {
        text: 'Design complet nou al aplicației web: paletă caldă, titluri elegante, meniu lateral reorganizat pe grupuri (Zilnic, Catalog, Stoc & aprovizionare), pagini restructurate — Stoc cu listă directă și secțiuni într-un modal, Setări pe carduri, pagină separată de Profil.',
        platforms: ['web'],
      },
      {
        text: 'Filtrele sunt acum „pastile”: apeși pentru a filtra, apeși din nou pentru a scoate filtrul — fără opțiunea „Toate”. Pe Producție și Comenzi ai și vizualizări rapide Azi / Săptămâna / Luna.',
        platforms: ['web'],
      },
      {
        text: 'La Prețuri poți seta un cost manual per rețetă (manoperă, utilități — peste costul ingredientelor); marja se calculează pe el, iar click pe numele rețetei deschide componentele cu costul fiecărui ingredient. Istoricul arată acum produsul și producătorul.',
        platforms: ['web', 'api'],
      },
      {
        text: 'Pe telefon aplicația web se simte ca appul de iOS: titlu compact cu căutare extensibilă, filtre pe un singur rând glisabil, statistici care se ascund la scroll, carduri-filtru pe Comenzi și acțiuni rapide fixate sus la scroll.',
        platforms: ['web'],
      },
      {
        text: 'Byproducturi: o rețetă poate marca ce rămâne după preparare (ex. resturi de blat). Bifezi „Rețeta lasă un byproduct” la finalul rețetei, completezi numele și cantitatea, iar el se salvează ca semipreparat marcat byproduct, legat de rețeta din care provine.',
        platforms: ['web', 'ios', 'api'],
      },
      {
        text: 'Byproducturile apar ca o categorie separată în selectorul de ingrediente și pot fi folosite în alte rețete ca orice semipreparat.',
        platforms: ['web', 'ios'],
      },
    ],
    imbunatatiri: [
      {
        text: 'La adăugarea unui ingredient în rețetă nu mai alegi întâi „materie primă sau semipreparat”: un singur selector cu căutare listează totul, grupat pe materii prime, semipreparate și byproducturi.',
        platforms: ['web', 'ios'],
      },
    ],
    reparat: [
      {
        text: 'Pagina de autentificare nu mai afișează formularul prea jos: formularul (inclusiv butoanele Apple/Google) este acum centrat pe verticală, la fel ca în aplicația de iOS.',
        platforms: ['web'],
      },
    ],
    platforms: ['web', 'ios', 'android', 'api'],
  },
  {
    version: '1.15.2',
    date: '2026-07-14',
    title: 'Semipreparate în unitatea lor + istoric de intrări mai clar',
    highlights: [
      'Un semipreparat se folosește automat în unitatea în care a fost făcut',
      'Istoricul de intrări (loturi) arată mai clar, cu cât a mai rămas din fiecare lot',
    ],
    nou: [],
    imbunatatiri: [
      {
        text: 'Istoricul de intrări al unei materii prime a fost redesenat: fiecare lot e un card cu data, furnizorul, prețul, numărul de lot, expirarea (evidențiată când e depășită) și o bară cu cât a mai rămas din lot.',
        platforms: ['ios'],
      },
    ],
    reparat: [
      {
        text: 'Când adaugi un semipreparat ca ingredient într-o rețetă, el se folosește acum automat în unitatea în care a fost făcut (randamentul lui) — nu mai apare eroarea de unitate incompatibilă și stocul se scade corect la produsele numărate în bucăți.',
        platforms: ['ios'],
      },
    ],
    platforms: ['ios'],
  },
  {
    version: '1.15.1',
    date: '2026-07-14',
    title: 'Semipreparate pe bucată folosite la gramaj',
    highlights: ['Un semipreparat numărat în bucăți poate fi folosit la gramaj în alte rețete'],
    nou: [],
    imbunatatiri: [],
    reparat: [
      {
        text: 'Un semipreparat al cărui randament e în bucăți poate fi acum folosit ca ingredient la gramaj (ex: „150 g" dintr-un blat numărat în bucăți) — setezi în rețeta semipreparatului cât reprezintă o bucată (ex: 1 bucată = 2 kg sau 0,5 l) și conversia se face automat, fără eroarea de unitate incompatibilă. Costul și scăderea din stoc folosesc aceeași conversie.',
        platforms: ['web', 'ios', 'api'],
      },
    ],
    platforms: ['web', 'ios', 'api'],
  },
  {
    version: '1.15.0',
    date: '2026-07-13',
    title: 'Autentificare cu Apple și Google, plus protecție extinsă la ieșirea din editare',
    highlights: [
      'Te poți autentifica cu Apple sau Google',
      'Când primești invitație, poți crea contul direct cu Apple sau Google',
      'Ești întrebat înainte să pierzi modificări nesalvate și în formularele de stoc',
    ],
    nou: [
      {
        text: 'Autentificare cu Apple și Google: pe ecranul de login apar „Continuă cu Apple" și „Continuă cu Google". Când accepți o invitație îți poți crea contul direct cu Apple sau Google, fără parolă. Dacă ești deja autentificat, îți poți conecta un cont Apple/Google din Setări → Conturi conectate ca să te loghezi mai simplu data viitoare.',
        platforms: ['web', 'ios', 'api'],
      },
    ],
    imbunatatiri: [
      {
        text: 'Protecția la modificări nesalvate acoperă acum și formularele din stoc: la adăugarea sau editarea unei materii prime, a unui consumabil, a unui furnizor sau a unei locații, dacă ai modificări nesalvate și închizi fereastra ești întrebat înainte să pierzi tot.',
        platforms: ['web'],
      },
    ],
    reparat: [],
    platforms: ['web', 'ios', 'api'],
  },
  {
    version: '1.14.0',
    date: '2026-07-13',
    title: 'Schițe de rețete, notificări și protecție la ieșirea din editare',
    highlights: [
      'Salvezi o rețetă ca schiță și apare în listă doar când o publici',
      'Primești notificări când ți se asignează un task și când expiră materii prime',
      'La ieșirea dintr-un formular cu modificări nesalvate ești întrebat înainte să pierzi tot',
    ],
    nou: [
      {
        text: 'Rețete în lucru: apeși „Salvează ca schiță" ca să pui o rețetă pe pauză; rămâne editabilă, dar nu apare în listă și nu poate intra în producție/comenzi până când o publici. Un comutator „Schițe" arată doar rețetele nefinalizate.',
        platforms: ['web', 'ios', 'api'],
      },
      {
        text: 'Notificări: ești anunțat când ți se asignează un task și când o materie primă se apropie de expirare (pragul în zile se setează per materie primă, din admin). Un clopoțel cu contor de necitite deschide lista de notificări.',
        platforms: ['web', 'ios', 'api'],
      },
      {
        text: 'Protecție la ieșirea din editare: dacă ai modificări nesalvate într-un formular (rețetă, task, transfer, materie primă, comandă) și dai înapoi, ești întrebat dacă vrei să renunți — nu mai pierzi tot procesul dintr-o atingere greșită.',
        platforms: ['web', 'ios'],
      },
    ],
    imbunatatiri: [],
    reparat: [],
    platforms: ['web', 'ios', 'api'],
  },
  {
    version: '1.13.1',
    date: '2026-07-13',
    title: 'Corecturi: listă completă de ingrediente și fila Invitați',
    highlights: [
      'La adăugarea unui ingredient în rețetă vezi acum toate materiile prime și semipreparatele, nu doar primele 20',
      'Fila „Invitați" din Utilizatori nu mai dă eroare',
    ],
    nou: [],
    imbunatatiri: [],
    reparat: [
      {
        text: 'Selectorul de componente din rețetă (materie primă / semipreparat) afișa doar primele 20 de intrări, în ordine alfabetică — restul apăreau doar dacă le căutai după nume. Acum se încarcă lista completă a stocului.',
        platforms: ['ios', 'web'],
      },
      {
        text: 'Fila „Invitați" din ecranul Utilizatori întorcea o eroare pentru rolurile care puteau vedea utilizatorii dar nu aveau permisiunea separată de gestionare a invitațiilor; acum folosește aceeași permisiune ca lista de utilizatori.',
        platforms: ['api'],
      },
    ],
    platforms: ['ios', 'web', 'api'],
  },
  {
    version: '1.13.0',
    date: '2026-07-12',
    title: 'Brandul tău, peste tot: teme personalizabile și un nou ecran de pornire',
    highlights: [
      'Ecran de pornire nou: spirala de puncte se formează în jurul logo-ului tău',
      'Culorile aplicației sunt acum personalizabile pe teme (luminos/întunecat), separat pe web, iOS și Android',
      'Cantitățile se afișează în unitatea cea mai citibilă: 1000 g devine 1 kg, peste tot',
    ],
    nou: [
      {
        text: 'Ecran de pornire (preloader) nou: o spirală de puncte se formează în jurul logo-ului cofetăriei, cu gradientul culorii tale de accent — identic pe web, iOS și Android',
        platforms: ['web', 'ios', 'android'],
      },
      {
        text: 'Când nu ești autentificat, ecranul de pornire se transformă lin în login: logo-ul urcă și apare formularul de autentificare pe același fundal',
        platforms: ['web', 'ios', 'android'],
      },
      {
        text: 'Personalizare avansată a temei: fiecare variabilă de culoare (accent, text, fundal, carduri, separatoare, seriile din grafice) se poate seta separat pentru tema luminoasă și cea întunecată; din web controlezi toate platformele, iar aplicațiile mobile își reglează fiecare doar tema proprie',
        platforms: ['web', 'ios', 'android', 'api'],
      },
      {
        text: 'Fontul aplicației se alege dintr-o listă predefinită (Sistem, Inter, Manrope, Lora, Poppins)',
        platforms: ['web', 'ios', 'android'],
      },
      {
        text: 'Prioritatea task-urilor se citește dintr-o privire: triunghi colorat pe nivel (1 albastru → 5 roșu) cu cifra înăuntru, în listă, board și detalii',
        platforms: ['web', 'ios', 'android'],
      },
      {
        text: 'Titlu mic centrat în bara de sus pe paginile principale, între lupă și „+” — dispare cât timp cauți',
        platforms: ['ios'],
      },
    ],
    imbunatatiri: [
      {
        text: 'Regulă generală de afișare a cantităților: mg → g → kg și ml → l se aleg automat pentru cea mai citibilă valoare (100000 mg devine 100 g), inclusiv pe avize și foile de drum; formularele rămân în unitatea de stoc',
        platforms: ['web', 'ios', 'android', 'api'],
      },
      {
        text: 'Logo-urile s-au simplificat: unul pentru tema luminoasă și unul pentru cea întunecată, folosite peste tot (login, ecranul de pornire, aplicație)',
        platforms: ['web', 'ios', 'android', 'api'],
      },
      {
        text: 'Pagina Acasă afișează logo-ul cofetăriei în loc de numele scris',
        platforms: ['ios'],
      },
      {
        text: 'Căutarea stă ascunsă într-o lupă în stânga barei și se deschide în bară, cu focus direct; listele au rânduri fără linii de separare, iar statisticile se aliniază ca acțiunile rapide (centrate când sunt puține)',
        platforms: ['ios'],
      },
      {
        text: 'Datele scadente apar în format european scurt („14 iul.”), fără an',
        platforms: ['ios'],
      },
    ],
    reparat: [
      {
        text: 'Ștergerea unui logo chiar îl șterge — nu mai rămâne o imagine veche afișată din câmpurile moștenite',
        platforms: ['api', 'ios', 'web'],
      },
      {
        text: 'Logo-ul nu mai „clipește” la pornirea aplicației: varianta salvată local rămâne pe ecran până se descarcă cea nouă',
        platforms: ['ios'],
      },
      {
        text: 'Paginile fără titlu mare nu mai lasă o bandă goală sub bara de sus',
        platforms: ['ios'],
      },
      {
        text: 'Pe avizul de însoțire, prețul unitar se recalculează la unitatea afișată, așa că Cantitate × Preț unitar = Valoare rămâne corect când cantitatea e afișată în kg/l',
        platforms: ['ios'],
      },
    ],
    platforms: ['web', 'ios', 'android', 'api'],
  },
  {
    version: '1.12.1',
    date: '2026-07-12',
    title: 'Acasă renăscut și acțiuni rapide unificate',
    highlights: [
      'Pagina Acasă redesenată: vânzările zilei, materialele cu probleme pe nume, task-urile recente',
      'Cardurile de statistici filtrează lista pe toate paginile (Stoc, Comenzi, Producție)',
      'Totalurile de stoc de pe Acasă sunt acum coerente între „Toate” și locații',
    ],
    nou: [
      {
        text: 'Pagina Acasă arată acum vânzările de azi, comenzile și task-urile scadente, materialele sub minim pe nume (cu cantitate / minim) și task-urile recente cu status — totul cu legături directe către paginile potrivite',
        platforms: ['ios'],
      },
      {
        text: 'Cardurile de statistici din capul paginilor Comenzi și Producție funcționează ca filtre, la fel ca pe Stoc: un tap filtrează lista, încă un tap revine la „toate”',
        platforms: ['ios'],
      },
    ],
    imbunatatiri: [
      {
        text: 'Acțiunile rapide arată identic pe toate paginile (cerc cu accent + etichetă); în bara de sus rămâne doar „+” — Calendar, Statistici, Filtre și Furnizori s-au mutat în rândul de acțiuni rapide',
        platforms: ['ios'],
      },
      {
        text: 'Antetul paginii Acasă (dată, acțiuni rapide, bara de locații) stă fix sus, ca pe restul paginilor',
        platforms: ['ios'],
      },
    ],
    reparat: [
      {
        text: 'Totalurile de stoc de pe ecranul principal la „Toate locațiile” se calculează acum după cea mai slabă locație a fiecărui material — un material epuizat la o locație apare „lipsă” peste tot, nu „stoc scăzut” global și „lipsă” local',
        platforms: ['api'],
      },
      {
        text: 'Un card de statistică selectat rămâne apăsabil și când valoarea lui ajunge 0, ca să poți scoate filtrul',
        platforms: ['ios'],
      },
    ],
    platforms: ['api', 'ios'],
  },
  {
    version: '1.12.0',
    date: '2026-07-11',
    title: 'Stocul, la un tap distanță',
    highlights: [
      'Cardurile de stoc de pe ecranul principal și din pagina de stoc filtrează lista dintr-un tap',
      'Acțiuni rapide în capul paginilor și salvare din antetul formularelor',
      'Doar data, fără oră, peste tot — termenele și planificările nu mai cer ora',
    ],
    nou: [
      {
        text: 'Cardurile de sumar din pagina de stoc (Active / Stoc scăzut / Fără stoc / Total) funcționează ca filtre: un tap arată doar produsele cu acel status, încă un tap revine la „toate”',
        platforms: ['ios'],
      },
      {
        text: 'Cardurile de stoc de pe ecranul principal („Lipsă”, „Stoc scăzut”) deschid direct pagina de stoc cu filtrul potrivit activ — și păstrează locația selectată',
        platforms: ['ios'],
      },
      {
        text: 'Acțiuni rapide în susul paginii de rețete (Arhivate, Categorii) în locul meniului „…” cu o singură opțiune',
        platforms: ['ios'],
      },
      {
        text: 'Pagini publice de Confidențialitate și Suport pe horae.ca (politica de date, contact, întrebări frecvente)',
        platforms: ['web'],
      },
      {
        text: 'Lista de cumpărături se generează din deficitele planului de Necesar MP, iar planul se păstrează doar cât navighezi dus-întors la lista de cumpărături',
        platforms: ['web'],
      },
    ],
    imbunatatiri: [
      {
        text: 'Butoanele de salvare stau acum în antetul formularelor, în stilul acțiunilor rapide, pe toate paginile',
        platforms: ['web'],
      },
      {
        text: 'Doar data, fără oră: termenele limită, planificarea producției și data de ridicare/livrare nu mai cer ora',
        platforms: ['web', 'ios'],
      },
      {
        text: 'Cantitatea la transfer se alege din valori rapide (1 / 3 / 5 / 10 / Tot) plus câmp liber — fără slider',
        platforms: ['ios'],
      },
      {
        text: 'Furnizorul la adăugarea de stoc se alege dintr-o listă (dropdown), nu se mai scrie de mână',
        platforms: ['ios'],
      },
    ],
    reparat: [
      {
        text: 'Totalurile din cardurile de sumar ale stocului se calculează acum corect și când statusul salvat al unui produs rămăsese în urmă',
        platforms: ['api'],
      },
      {
        text: 'Textele din liste și formulare nu mai apar colorate cu culoarea de brand — doar iconițele și elementele de acțiune păstrează accentul',
        platforms: ['ios'],
      },
      {
        text: 'Iconițele de acțiune nu mai cădeau pe albastrul de sistem după selecție în listele de alegere (produse la transfer, rețete la comandă)',
        platforms: ['ios'],
      },
    ],
    platforms: ['api', 'web', 'ios'],
  },
  {
    version: '1.11.0',
    date: '2026-07-10',
    title: 'Branding pe culorile tale, peste tot',
    highlights: [
      'Culoarea de accent a organizației se aplică acum consecvent în toată aplicația (meniu, grafice, evidențieri)',
      'Două culori noi de brand — secundară și terțiară — pentru grafice și statistici',
    ],
    nou: [
      {
        text: 'Paletă de brand extinsă: pe lângă culoarea de accent poți alege o culoare secundară și una terțiară (Setări → Culori brand) — apar în statistici, iconițe și grafice pe toate platformele; dacă nu le alegi, se derivează automat din accent, în armonie',
        platforms: ['api', 'web', 'ios', 'android'],
      },
      {
        text: 'Branding și teme: pagină dedicată cu tab-uri pe platforme (Web / iOS / Android), control extins pe culori (text, fundal, card, accent apăsat), documentație de variabile cu copiere, și import prin lipire — editezi CSS-ul offline, îl lipești, iar valorile se extrag automat',
        platforms: ['api', 'web'],
      },
      {
        text: 'Administrarea rolurilor pe Android, la fel ca pe web și iOS: nivele de acces pe secțiuni + „Mod avansat” pentru control fin pe acțiuni',
        platforms: ['android'],
      },
    ],
    imbunatatiri: [],
    reparat: [
      {
        text: 'Culoarea de accent aleasă se aplică acum peste tot — elementul activ din meniu, inelele de focus, graficele și evidențierile nu mai rămân pe rozul implicit',
        platforms: ['web'],
      },
      {
        text: 'Textul de pe butoanele colorate își alege automat alb sau negru în funcție de cât de deschisă e culoarea de accent, ca să rămână lizibil',
        platforms: ['web'],
      },
    ],
    platforms: ['api', 'web', 'ios', 'android'],
  },
  {
    version: '1.10.0',
    date: '2026-07-09',
    title: 'Stoc mai limpede, transferuri sigure, aviz complet',
    highlights: [
      'Valorile nutriționale sunt acum pornite din start — apar pe produse și semipreparate fără nicio setare',
      'Avizul de însoțire captează delegatul, transportul, ora expediției și semnătura de primire',
      'Ajustare de stoc direct pe produsele finite și semipreparate',
    ],
    nou: [
      {
        text: 'Valorile nutriționale sunt disponibile din start (nu mai trebuie activate din Setări) — declarația nutrițională apare pe produsele finite și semipreparate, calculată automat din ingrediente',
        platforms: ['api', 'web', 'ios'],
      },
      {
        text: 'Avizul de însoțire a mărfii captează acum digital seria și numărul CI-ului delegatului, mijlocul de transport și ora expediției (se completează la crearea transferului) și o semnătură de primire desenată pe ecran — toate apar pe avizul tipărit în locul liniilor goale',
        platforms: ['api', 'web'],
      },
      {
        text: 'Ajustare de stoc direct pentru produsele finite și semipreparate: pe „Stoc produse" fiecare rând are un buton de Ajustare (pe locație, cu avertizare la stoc rezervat), la fel ca la materiile prime',
        platforms: ['api', 'web'],
      },
      {
        text: 'Poți crea o materie primă nouă chiar în timpul recepției — dacă nu o găsești în listă, o adaugi pe loc (denumire + unitate) și continui recepția fără să pleci din pagină',
        platforms: ['web'],
      },
    ],
    imbunatatiri: [
      {
        text: 'Pagina unui articol de stoc arată cantitatea la vedere, imediat sub acțiunile rapide (stocul minim rămâne la detalii) — pe materii prime și consumabile',
        platforms: ['web'],
      },
      {
        text: 'Lista de producție afișează cel mai recent task primul, ca ordine implicită predictibilă',
        platforms: ['api', 'web'],
      },
      {
        text: 'Materiile prime introduse din greșeală se pot șterge când stocul e 0, chiar dacă au apărut pe un transfer finalizat (rămâne un avertisment că se pierde istoricul) — blocarea rămâne doar pentru transferurile în curs',
        platforms: ['api', 'web'],
      },
    ],
    reparat: [
      {
        text: 'Numele produselor apar din nou în lista „Stoc produse" (înainte rândurile erau goale)',
        platforms: ['web'],
      },
      {
        text: 'La un task nou de producție se deschide corect meniul de locație și pentru utilizatorii fără locație asignată',
        platforms: ['web'],
      },
      {
        text: 'Transferurile nu se mai pot finaliza de două ori — stocul destinației nu mai poate fi adăugat dublu în urma unei reîncercări, iar totalurile rămân corecte',
        platforms: ['api'],
      },
    ],
    platforms: ['api', 'web', 'ios'],
  },
  {
    version: '1.9.0',
    date: '2026-07-07',
    title: 'Ordinea categoriilor, la liber',
    highlights: [
      'Toate sub-categoriile într-o singură listă, reordonabile prin tragere — ordinea aleasă se aplică peste tot',
      'O sub-categorie importantă (de ex. pentru un candy bar) poate sta prima, indiferent de grupa ei',
    ],
    nou: [
      {
        text: 'Reordonare globală a categoriilor: toate sub-categoriile apar într-o singură listă (cu culorile lor) și se pot trage în orice ordine — inclusiv o sub-categorie de la semipreparate deasupra tuturor. Ordinea aleasă e cea din carusel și filtre, pe toate aplicațiile',
        platforms: ['api', 'web', 'ios'],
      },
      {
        text: 'Transferurile au acum un câmp „Destinatar" (persoana care primește marfa) — opțional, apare pe detaliul transferului și pe avizul de însoțire; util la transporturile către evenimente, alături de destinația liberă cu adresă',
        platforms: ['api', 'web', 'ios'],
      },
      {
        text: 'Prețuri cu sau fără TVA: în Setări alegi dacă firma e plătitoare de TVA (și cota), iar la introducerea oricărui preț de achiziție ai bifa „prețul include TVA" — sistemul convertește automat și reține costul real (fără TVA la plătitori, care îl recuperează; cu TVA la neplătitori)',
        platforms: ['api', 'web', 'ios'],
      },
      {
        text: 'Alergeni la materiile prime: bifezi cei 14 alergeni UE (soia, lapte, gluten…) pe pagina materiei, iar semipreparatele și produsele finite îi moștenesc automat din rețetă — declarația arată „Conține alergeni: soia (Ciocolată)…" lângă valorile nutriționale',
        platforms: ['api', 'web', 'ios'],
      },
      {
        text: '„Păstrează lotul": pe istoricul de intrări al unei materii prime poți bloca un lot de la consumul FIFO — producția folosește celelalte loturi și îl atinge doar când nu mai există altă opțiune; util când vrei să ții un lot pentru un scop anume sau colegii lucrează fizic din alt lot',
        platforms: ['api', 'web', 'ios'],
      },
    ],
    imbunatatiri: [
      {
        text: 'Câmpurile de preț de achiziție arată acum explicit unitatea (RON/kg, RON/l) la recepție, ajustare și pe pagina materiei prime',
        platforms: ['web', 'ios'],
      },
      {
        text: 'Aplicația web are acum iconița Horae în tab-ul browserului, iar după autentificare iconița devine logo-ul organizației tale și rămâne așa pe dispozitiv',
        platforms: ['web'],
      },
      {
        text: 'Declarația nutrițională apare acum și pe paginile de stoc ale semipreparatelor și produselor finite, iar când nicio materie primă din rețetă nu are valori completate se afișează explicit ce lipsește (în loc să dispară secțiunea)',
        platforms: ['web', 'ios'],
      },
      {
        text: 'Setare nouă „Locația de livrare implicită" (Setări → Livrări): locația din care pleacă comenzile cu livrare — cu ea setată, livrările din ziua curentă apar și pe cardul locației respective de pe ecranul principal, nu doar pe „Toate"',
        platforms: ['web', 'api'],
      },
      {
        text: 'Câmpurile de cantitate din formularul de rețetă pornesc goale în loc să afișeze un „0" peste care se scrie (nu mai rezultă „0800" când tastezi 800)',
        platforms: ['ios'],
      },
      {
        text: 'În lista de stoc, unitatea de măsură apare acum în dreapta, sub cantitate (109 / kg) — nu sub denumirea articolului',
        platforms: ['ios'],
      },
      {
        text: 'Pagina unui articol de stoc, curățată: toate cantitățile au unitatea de măsură, stocul total apare mereu (chiar și 0), iar rândurile Disponibil/Rezervat/Deschise/Comandate și locațiile apar doar când au valori diferite de 0; „Stoc minim" s-a mutat la Informații ca să nu fie confundat cu stocul curent',
        platforms: ['web', 'ios'],
      },
      {
        text: 'Popup-ul „Ce e nou" are acum link către changelog-ul detaliat cu toate versiunile; pe Android au apărut popup-ul, plus pagina Setări → Noutăți cu istoricul complet (ca pe web)',
        platforms: ['ios', 'android'],
      },
      {
        text: 'Confirmări după acțiunile principale: recepția, transferul și ajustarea de stoc afișează un mesaj de confirmare cu rezumatul efectelor („Recepție făcută — Laborator: 10 kg făină…", „Transferul a fost inițiat", „Stocul la X a fost redus la 0")',
        platforms: ['web', 'ios'],
      },
    ],
    reparat: [
      {
        text: 'Costul de producție al rețetelor se calculează corect: prețul de achiziție e interpretat per kg (sau per litru), nu per gram — un ingredient de 100 g la 6 lei/kg costă acum 0,60 lei, nu 600 lei',
        platforms: ['api'],
      },
      {
        text: 'Materiile prime cu stoc 0 se pot șterge definitiv chiar dacă au apărut pe transferuri finalizate — doar un transfer încă în curs mai blochează ștergerea, iar mesajul explică acum exact motivul',
        platforms: ['api', 'web', 'ios', 'android'],
      },
      {
        text: 'Rețetele nu mai pot fi salvate cu un semipreparat într-o unitate incompatibilă cu randamentul lui (de ex. „2 g" dintr-un blat măsurat în bucăți) — situație care lăsa costul rețetei fără valoare; unitatea semipreparatului e acum fixată automat și pe web',
        platforms: ['api', 'web'],
      },
      {
        text: 'Stocul cu zecimale (de ex. 5,45 kg) nu mai e rotunjit la număr întreg pe paginile de detaliu și în liste — aplicația afișa 5 în loc de 5,45',
        platforms: ['ios'],
      },
      {
        text: 'Loaderul nu mai rămâne blocat pe ecran în listele de producție și comenzi după reîmprospătare sau schimbarea filtrelor',
        platforms: ['ios'],
      },
      {
        text: 'Schimbarea tab-ului din meniul de jos pornește mereu de la ecranul principal al secțiunii — nu mai rămâi pe sub-pagina unde ai fost data trecută (de ex. detaliul unui articol de stoc)',
        platforms: ['ios'],
      },
      {
        text: 'Expirări: lista arată cantitatea rămasă (loturile consumate complet nu mai apar), iar fereastra de timp are acum și opțiunile 180 zile și 1 an — lista goală însemna doar că nimic nu expiră în următoarele 30 de zile',
        platforms: ['api', 'ios'],
      },
    ],
    platforms: ['api', 'web', 'ios'],
  },
  {
    version: '1.8.0',
    date: '2026-07-06',
    title: 'Bun venit la Horae — platforma devine multi-organizație',
    highlights: [
      'Acadeea devine Horae: fiecare organizație are propria adresă (organizația-ta.horae.ca) și date complet separate',
      'Branding personalizat per organizație: logo, culoare de accent, font și iconiță de aplicație, alese de administrator',
      'Recepție, Transfer și Ajustare stoc direct din pagina oricărui articol de stoc',
    ],
    nou: [
      {
        text: 'Platforma se numește acum Horae. Fiecare organizație are propriul subdomeniu (de ex. acadeea.horae.ca) cu date complet izolate: utilizatori, roluri, rețete, stocuri, locații și comenzi separate per organizație',
        platforms: ['api', 'web', 'ios', 'android'],
      },
      {
        text: 'Pagină de prezentare pe horae.ca cu autentificare centrală: după login ești dus automat pe subdomeniul organizației tale',
        platforms: ['web'],
      },
      {
        text: 'Branding personalizat per organizație, setat de administrator: logo-uri, culoare de accent, font (Inter, Manrope, Lora, Poppins sau fontul de sistem) și iconiță de aplicație — aplicate pe web și în aplicațiile mobile',
        platforms: ['api', 'web', 'ios', 'android'],
      },
      {
        text: 'Acțiuni rapide pe pagina fiecărui articol de stoc: Recepție (pornește recepția cu articolul preselectat), Transfer (pornește transferul cu articolul și locația preselectate) și Ajustare stoc',
        platforms: ['web', 'ios'],
      },
      {
        text: 'Ajustarea de stoc are acum o notiță opțională — motivul ajustării apare în istoricul de mișcări. Stocul poate fi adus la 0, cu avertisment de confirmare dacă articolul este rezervat pentru o sarcină în lucru sau un transfer în curs',
        platforms: ['api', 'web', 'ios'],
      },
      {
        text: 'Pagină de detaliu pentru consumabile, cu informații, mișcări recente și acțiuni rapide',
        platforms: ['web'],
      },
      {
        text: 'Buton de căutare în stoc (lângă Transferuri/Recepție/Expirări) care caută deodată în materii prime, semipreparate, produse și consumabile',
        platforms: ['ios'],
      },
      {
        text: 'Ordinea categoriilor și sub-categoriilor poate fi controlată de administrator din Setări (săgeți sus/jos) — în loc de ordine alfabetică. Ordinea stabilită se reflectă în carusel și filtre pe toate aplicațiile',
        platforms: ['api', 'web', 'ios'],
      },
      {
        text: 'Transferurile pot merge către o destinație scrisă liber (de ex. un eveniment), cu adresă opțională — fără să salvezi locația în sistem; la finalizare marfa iese din stoc',
        platforms: ['api', 'web', 'ios'],
      },
    ],
    imbunatatiri: [
      {
        text: 'Valorile nutriționale sunt afișate în ordinea standard de etichetă: valoare energetică (kJ/kcal), grăsimi cu acizi grași saturați, glucide cu zaharuri, proteine, fibre, sare — cu mențiunea că valorile sunt informative',
        platforms: ['web', 'ios'],
      },
      {
        text: 'Rețetele pot avea o „greutate produs finit" opțională (după coacere): când e completată, valorile nutriționale la 100 g sunt calculate corect pe greutatea finală, nu pe suma ingredientelor crude. Caloriile se calculează automat din materii prime, prin semipreparate, până la produsul final',
        platforms: ['api', 'web', 'ios'],
      },
      {
        text: 'Istoricul de mișcări arată acum nota, locația și persoana care a făcut fiecare mișcare',
        platforms: ['api', 'web', 'ios'],
      },
      {
        text: 'Articolele de stoc afișează stocul defalcat pe locații',
        platforms: ['web', 'ios'],
      },
    ],
    reparat: [
      {
        text: 'Costul de producție ține cont de unitățile de măsură (prețul pe kg nu se mai înmulțea direct cu gramele), folosește prețul ultimei recepții și include semipreparatele în calcul',
        platforms: ['api', 'web', 'ios'],
      },
      {
        text: 'Numele produselor apar în lista de mișcări de stoc pe web, iar căutarea din pagină funcționează',
        platforms: ['web', 'api'],
      },
      {
        text: 'Task-urile pornite pot fi editate din board — butonul Editare nu te mai aruncă înapoi la vizualizare',
        platforms: ['ios'],
      },
      {
        text: 'Ajustarea stocului la produse finite se salvează corect pe locație și nu mai este anulată de următoarea producție; listele de stoc se reîmprospătează la revenirea din detaliu',
        platforms: ['api', 'ios'],
      },
      {
        text: 'Exportul Excel al necesarului de materii prime funcționează din aplicația iOS (eroarea „Eroare server (201)")',
        platforms: ['api', 'ios'],
      },
      {
        text: 'La ajustarea stocului pe o locație, selectorul de articole arată doar ce există efectiv în stoc pe acea locație, nu materiile prime de pe alte locații',
        platforms: ['ios'],
      },
    ],
    platforms: ['web', 'ios', 'api'],
  },
  {
    version: '1.7.0',
    date: '2026-07-04',
    title: 'Arhivare rețete și ecran principal reorganizat',
    highlights: [
      'Rețetele pot fi arhivate — dispar din liste și din selectoare, dar istoricul rămâne',
      'Filtrele de locație stau acum chiar deasupra sumarelor și rămân vizibile la derulare',
      'Acțiunile rapide sunt mai compacte — toate patru pe un singur rând',
    ],
    nou: [
      {
        text: 'Rețetele pot fi arhivate (de ex. rețetele de test care nu se pot șterge): o rețetă arhivată dispare din lista de zi cu zi și din selectoarele de producție/comenzi, dar istoricul ei rămâne intact. Rețetele arhivate se găsesc într-o vizualizare separată, de unde pot fi reactivate oricând',
        platforms: ['api', 'web', 'ios'],
      },
    ],
    imbunatatiri: [
      {
        text: 'Filtrele de locație s-au mutat sub acțiunile rapide, chiar deasupra sumarelor pe care le controlează, și rămân lipite sus când derulezi pagina',
        platforms: ['ios'],
      },
      {
        text: 'Acțiunile rapide (Stoc nou, Task nou, Rețetă nouă, Transfer stoc) sunt mai compacte și încap toate patru pe un rând, ca micile casete de sumar din pagina de stoc',
        platforms: ['ios'],
      },
    ],
    reparat: [],
    platforms: ['ios'],
  },
  {
    version: '1.5.0',
    date: '2026-07-04',
    title: 'Cantități afișate natural și ecran principal reorganizat',
    highlights: [
      'Cantitățile se afișează natural: "2 buc", nu "2.0 buc"; zecimalele cu virgulă ("1,5 kg")',
      'Acțiunile rapide au revenit sus pe ecranul principal (iOS)',
    ],
    nou: [],
    imbunatatiri: [
      {
        text: 'Cantitățile apar fără zecimale inutile ("2 buc" în loc de "2.0 buc") și cu virgulă românească atunci când au zecimale reale ("1,5 kg") — peste tot: rețete, producție, stoc, comenzi, transferuri',
        platforms: ['web', 'ios', 'android'],
      },
      {
        text: 'Acțiunile rapide (Stoc nou, Task nou, Rețetă nouă, Transfer stoc) au revenit în partea de sus a ecranului principal, înaintea sumarelor',
        platforms: ['ios'],
      },
      {
        text: 'Meniul de jos arată acum "Comenzi" în loc de "Vânzări"',
        platforms: ['ios'],
      },
    ],
    reparat: [
      {
        text: 'Ecranul principal cumulează corect datele din toate locațiile: "Toate" arată acum alertele de stoc din orice locație (înainte apărea 0 deși o locație avea stoc scăzut), comenzile de livrat/preluat se numără după locația reală a comenzii (ridicările după punctul de ridicare, livrările după locația implicită de livrare), iar producția după locația de producție a taskului',
        platforms: ['api', 'ios', 'web', 'android'],
      },
      {
        text: 'Numărul de alerte de stoc de pe ecranul principal nu mai e plafonat la 10',
        platforms: ['api', 'ios', 'web'],
      },
    ],
    platforms: ['web', 'ios', 'android'],
  },
  {
    version: '1.4.0',
    date: '2026-07-04',
    title: 'Derulare mai fluidă în liste',
    highlights: ['Listele se derulează fluid — pagina următoare se încarcă din timp, fără pauze'],
    nou: [],
    imbunatatiri: [
      {
        text: 'Listele lungi (materii prime, consumabile, rețete, comenzi, sarcini, utilizatori etc.) încarcă pagina următoare înainte să ajungi la capăt, așa că derularea nu se mai oprește cu rotița de încărcare la fiecare capăt de listă',
        platforms: ['ios'],
      },
    ],
    reparat: [],
    platforms: ['ios'],
  },
  {
    version: '1.3.0',
    date: '2026-07-03',
    title: 'Valabilitate produse proprii și declarația de conformitate',
    highlights: [
      'Termen de valabilitate pe rețete (1/2/3/6/12 luni sau personalizat)',
      'Produsele produse primesc automat dată de expirare și apar în lista de expirări',
      'Declarație de conformitate printabilă pentru fiecare transfer',
    ],
    nou: [
      {
        text: 'Termen de valabilitate pe rețete (produse finite și semipreparate): alegi 1, 2, 3, 6 sau 12 luni ori o valoare personalizată; stocul produs primește automat data de expirare la finalizarea producției',
        platforms: ['web', 'ios', 'api'],
      },
      {
        text: 'Produsele proprii apar în lista de expirări alături de materiile prime, cu etichetă de tip și locația unde se află; data de expirare e vizibilă și pe stocul de produse',
        platforms: ['web', 'ios', 'android', 'api'],
      },
      {
        text: 'Declarație de conformitate printabilă pe fiecare transfer, fidelă modelului companiei: antet legal complet (adresă, CUI, Reg. Com., contact), serie CB persistentă, textul legal standard, produsele livrate și semnătura administratorului; datele legale se setează în Setări',
        platforms: ['web', 'ios', 'api'],
      },
    ],
    imbunatatiri: [
      {
        text: 'Acțiunile de transfer (marchează în tranzit, finalizează, anulează) sunt acum în corpul paginii, ca la producție, nu în meniul din colț',
        platforms: ['ios'],
      },
    ],
    reparat: [],
    platforms: ['web', 'ios', 'android', 'api'],
  },
  {
    version: '1.2.0',
    date: '2026-07-03',
    title: 'Backup automat, restaurare și ștergerea materiilor prime greșite',
    highlights: [
      'Backup zilnic automat, cu păstrarea ultimelor 3 zile',
      'Descarcă sau restaurează baza de date din Setări (doar administratori)',
      'Materiile prime introduse din greșeală se pot șterge definitiv (doar la stoc 0)',
    ],
    nou: [
      {
        text: 'Backup automat al bazei de date în fiecare noapte la 03:00, cu păstrarea ultimelor 3 zile — poți reveni la starea de acum 1–2 zile',
        platforms: ['api'],
      },
      {
        text: 'Setări → Backup & restaurare (doar administratori): restaurare dintr-un backup zilnic, descărcarea unui backup ca fișier și restaurarea din fișier încărcat',
        platforms: ['web'],
      },
      {
        text: 'Ștergere definitivă a materiilor prime introduse din greșeală: permisă doar când stocul este 0, cu avertisment când mai există stoc și cu atenționare că se pierde istoricul și trasabilitatea dacă materia a fost folosită în rețete sau producție',
        platforms: ['web', 'ios', 'android'],
      },
    ],
    imbunatatiri: [
      {
        text: 'Changelog-ul este împărțit pe platforme: filtre pe web și etichete pe fiecare schimbare',
        platforms: ['web', 'ios'],
      },
      {
        text: 'Fișa de trasabilitate se poate printa cu un singur buton, iar foaia de parcurs se tipărește pe formularul legal standard (unitate, tip autovehicul, combustibil, dată, nr. auto, șofer, plecare/sosire, km, act de însoțire, consum, semnături) — precompletată cu ce știe sistemul',
        platforms: ['web', 'ios'],
      },
      {
        text: 'Aviz de însoțire a mărfii pe transferuri (bon de transfer): serie și număr generate automat și păstrate la reprintare, furnizor/cumpărător cu CUI și adresă, bunuri cu preț unde e cunoscut, date de expediție și semnătura gestionarului primitor; avizul comenzii folosește același format legal; CUI-ul și adresa sediului se setează în Setări',
        platforms: ['web', 'ios', 'api'],
      },
    ],
    reparat: [
      {
        text: 'Câmpurile "Tip ambalaj" și "Cantitate/bucată" nu se mai completează singure cu valori implicite ("Sac", "1.0") la crearea sau editarea materiilor prime',
        platforms: ['ios'],
      },
      {
        text: 'Fișa de trasabilitate distribuită ca text include acum și furnizorul și data de expirare a fiecărui lot (apăreau doar pe ecran); expirarea apare acum și pe fișa din web',
        platforms: ['ios', 'web'],
      },
      {
        text: 'Nu mai apar coduri sau ID-uri în loc de nume: toate listele de selecție (produse, locații, persoane, furnizori, roluri, unități) afișează numele, iar câmpurile moarte care cereau ID-uri au dispărut',
        platforms: ['web', 'ios', 'android'],
      },
    ],
    platforms: ['web', 'ios', 'android', 'api'],
  },
  {
    version: '1.1.0',
    date: '2026-07-03',
    title: 'Recepție marfă, transferuri complete pe web și aliniere între aplicații',
    highlights: [
      'Recepție marfă multi-linie pe web, cu lot, factură și expirare',
      'Transferuri de stoc complet funcționale pe web (creare, detaliu, tranzit, finalizare)',
      'Editare rețete pe web, cu ingrediente semipreparate',
      'Semnătură pe avizul de livrare direct din web + printare',
      'Statisticile din liste se ascund elegant la scroll (iOS)',
    ],
    nou: [
      {
        text: 'Pagină de recepție marfă cu mai multe materiale odată — lot, dată de expirare, preț de achiziție și număr de factură pe fiecare rând; acțiunile rapide „Recepție” duc direct aici',
        platforms: ['web'],
      },
      {
        text: 'Creare transfer de stoc (produse + materii prime, cu disponibilitate afișată, transportator și destinație) și pagină de detaliu cu tot fluxul: aprobare/respingere, marcare în tranzit, finalizare, anulare',
        platforms: ['web'],
      },
      {
        text: 'Editarea rețetelor (până acum se puteau doar crea și șterge) — inclusiv ingrediente de tip semipreparat',
        platforms: ['web'],
      },
      {
        text: 'Gestionarea produselor dintr-o comandă (adaugă/șterge) direct din pagina comenzii',
        platforms: ['web'],
      },
      {
        text: 'Semnarea avizului de livrare pe ecran (semnătură desenată + nume) și versiune de printare a avizului',
        platforms: ['web'],
      },
      {
        text: 'Editarea materiilor prime (nume, producător, stoc minim, pierdere, unitate, depozitare) din pagina de detaliu',
        platforms: ['web'],
      },
      {
        text: 'Cardurile de statistici din Producție, Comenzi și Stoc se ascund la scroll în jos și revin la scroll în sus',
        platforms: ['ios'],
      },
      {
        text: 'Crearea comenzilor funcționează de-adevăratelea (cu produse și cantități)',
        platforms: ['android'],
      },
      {
        text: 'Ecran principal cu statistici, Setări cu personalizare (branding), alerte de stoc scăzut și statistici comenzi',
        platforms: ['android'],
      },
      {
        text: 'Pagina de noutăți: /changelog pe web (test) și „Noutăți” în aplicația iOS de test, cu popup „Ce e nou” după update',
        platforms: ['web', 'ios'],
      },
    ],
    imbunatatiri: [
      {
        text: 'Versionare lizibilă peste tot: 1.1.0 în loc de 1.0 (build)',
        platforms: ['web', 'ios', 'android', 'api'],
      },
      {
        text: 'Aprobările de transfer sunt acum vizibile în toate aplicațiile (starea aprobat/respins + motiv)',
        platforms: ['web', 'ios', 'android', 'api'],
      },
      {
        text: 'Prototipul de design (app-test/design-system) este 1:1 cu aplicația, cu date demo — comentariile ancorate merg în continuare',
        platforms: ['web'],
      },
    ],
    reparat: [
      {
        text: 'Butonul „Transfer nou” și deschiderea unui transfer duceau la pagină inexistentă (404)',
        platforms: ['web'],
      },
      {
        text: 'Aprobarea/respingerea transferurilor nu ajungea la server (endpoint greșit)',
        platforms: ['web'],
      },
      {
        text: 'Crearea de rețete eșua din cauza unor câmpuri trimise greșit',
        platforms: ['web'],
      },
      {
        text: 'Numele ingredientelor apăreau goale în detaliul rețetei',
        platforms: ['web'],
      },
      {
        text: 'Maparea produselor la integrări (eBriza/WooCommerce) nu salva nimic',
        platforms: ['web'],
      },
      {
        text: 'Dialogul de comandă nouă confirma succesul fără să creeze comanda',
        platforms: ['android'],
      },
      {
        text: 'Materiile prime dezactivate nu mai apar în lista de ingrediente la crearea rețetelor',
        platforms: ['ios'],
      },
    ],
    platforms: ['web', 'ios', 'android', 'api'],
  },
  {
    version: '1.0.0',
    date: '2026-07-02',
    title: 'Design nou + trasabilitate completă a producției',
    highlights: [
      'Design nou pe toate platformele',
      'Fișă de trasabilitate cu loturi exacte (FIFO) și facturi',
      'Necesar de materii prime cu export Excel',
    ],
    nou: [
      {
        text: 'Design system nou aplicat peste tot — meniu reorganizat (Operațiuni / Administrare), pagini mai aerisite',
        platforms: ['web', 'ios', 'android'],
      },
      {
        text: 'Fișa de trasabilitate a unui produs include loturile exact consumate (FIFO) cu numărul de lot, factura și furnizorul fiecărui ingredient',
        platforms: ['web', 'ios', 'api'],
      },
      {
        text: 'Necesar MP: introduci ce vrei să produci (ex. 200 fraisier, 100 cookies) și primești lista agregată de materii prime cu furnizor și deficit de cumpărat, exportabilă în Excel',
        platforms: ['web', 'ios', 'api'],
      },
      {
        text: 'Valori nutriționale pe ingrediente, agregate automat pe rețetă (funcție opțională, se activează din Setări)',
        platforms: ['web', 'ios', 'api'],
      },
      {
        text: 'Pagina publică /design-system pe test: prototipul + documentația de design, cu comentarii ancorate pentru stakeholderi',
        platforms: ['web'],
      },
    ],
    imbunatatiri: [
      {
        text: 'Ștergerea unei locații se face cu o singură confirmare și curăță tot ce ține de ea',
        platforms: ['web', 'ios', 'api'],
      },
      {
        text: 'Teste automate pe toate endpoint-urile la fiecare commit — erorile de server nu mai ajung în aplicații',
        platforms: ['api'],
      },
      {
        text: 'Aplicațiile mobile respectă cerințele de publicare App Store / Play Store (privacy manifest, permisiuni minime)',
        platforms: ['ios', 'android'],
      },
    ],
    reparat: [
      {
        text: 'Erori 500 la ștergerea locațiilor, taskurilor și rețetelor cu date legate',
        platforms: ['api'],
      },
      {
        text: 'CORS pe app-test.acadeea.ro',
        platforms: ['web'],
      },
      {
        text: 'Numele produselor lipseau din alertele de stoc scăzut de pe dashboard',
        platforms: ['web', 'api'],
      },
    ],
    platforms: ['web', 'ios', 'android', 'api'],
  },
];
