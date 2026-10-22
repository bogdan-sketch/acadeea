/**
 * Curated tutorial content — the single source for the "Centru de ajutor"
 * help-center page and the live coachmark walkthroughs on every client.
 * Romanian, explicit ("ca la prosti" — assume zero prior knowledge).
 *
 * Tutorial mode is a PER-USER preference (each client stores it locally,
 * e.g. web Profil → Preferințe) — NOT an org/admin setting; this endpoint
 * has no gate, it's harmless static copy like /changelog. Each step's `id`
 * is a stable anchor key — clients map it to a real UI element to show a
 * small contextual hint (not a forced full-screen tour) the first time the
 * user encounters it; when no such element exists on a platform (e.g. a
 * still-stubbed Android screen), the client falls back to read-along text
 * in the help center only.
 *
 * `platforms` on a FLOW means "this flow's feature exists on these
 * platforms at all" — not every step is guaranteed a live anchor there.
 */

export type TutorialPlatform = 'web' | 'ios' | 'android';

export interface TutorialStep {
  /** Stable anchor key clients map to a real UI element, e.g. 'tasks.create.selectRecipe'. */
  id: string;
  title: string;
  body: string;
}

export interface TutorialFlow {
  /** Stable flow key, e.g. 'tasks.create'. */
  id: string;
  title: string;
  /** Help-center grouping. */
  category: string;
  /** Platforms this flow's feature exists on. */
  platforms: TutorialPlatform[];
  steps: TutorialStep[];
}

const ALL: TutorialPlatform[] = ['web', 'ios', 'android'];

export const TUTORIAL_FLOWS: TutorialFlow[] = [
  {
    id: 'auth.basics',
    title: 'Autentificare și navigare de bază',
    category: 'Primii pași',
    platforms: ALL,
    steps: [
      {
        id: 'auth.basics.login',
        title: 'Autentificare',
        body: 'Introdu adresa de email și parola primite de la administrator, apoi apasă butonul de conectare. Dacă ai uitat parola, folosește linkul „Ai uitat parola?” de sub formular.',
      },
      {
        id: 'auth.basics.sidebar',
        title: 'Meniul principal',
        body: 'Din meniul din stânga (pe telefon: bara de jos) ajungi la Board (taskuri), Rețete, Stoc, Comenzi, Locații, Utilizatori și Setări. Ce vezi în meniu depinde de rolul tău.',
      },
      {
        id: 'auth.basics.account',
        title: 'Contul tău',
        body: 'Apasă pe numele tău (sus în meniu, pe telefon în Setări) pentru a-ți edita profilul, a schimba parola sau a te deconecta.',
      },
    ],
  },
  {
    id: 'tasks.create',
    title: 'Cum creezi un task de producție',
    category: 'Producție',
    platforms: ALL,
    steps: [
      {
        id: 'tasks.create.open',
        title: 'Pornește un task nou',
        body: 'Din Board, apasă butonul „+ Task nou” din colțul din dreapta sus.',
      },
      {
        id: 'tasks.create.mode',
        title: 'Un produs sau mai multe',
        body: 'Alege „Un produs” pentru un singur task, sau „Mai multe produse” dacă vrei să creezi dintr-o dată taskuri pentru mai multe rețete (ex. toate sosurile de înghețată) — vezi „Task multiplu și familie de taskuri”.',
      },
      {
        id: 'tasks.create.selectRecipe',
        title: 'Alege rețeta',
        body: 'Rețetele apar în ordine alfabetică. Caută sau derulează lista și selectează produsul pe care vrei să-l produci.',
      },
      {
        id: 'tasks.create.quantity',
        title: 'Cantitatea',
        body: 'Cantitatea se completează automat cu randamentul rețetei — o poți modifica. Aplicația verifică pe loc dacă ai suficientă materie primă în stoc și te avertizează dacă nu.',
      },
      {
        id: 'tasks.create.location',
        title: 'Locația de producție',
        body: 'Locația se preselectează automat (locația implicită setată de administrator, sau „Laborator” dacă nu e configurată una). O poți schimba dacă produci în altă locație.',
      },
      {
        id: 'tasks.create.dates',
        title: 'Termen și prioritate',
        body: 'Setează opțional data planificată, termenul limită și prioritatea (Normal / Important / Urgent), și cine e responsabil de task.',
      },
      {
        id: 'tasks.create.submit',
        title: 'Salvează taskul',
        body: 'Apasă „Creează task”. Taskul apare pe Board, în coloana „De făcut”.',
      },
    ],
  },
  {
    id: 'tasks.transitions',
    title: 'Cum muți un task prin etapele de producție',
    category: 'Producție',
    platforms: ALL,
    steps: [
      {
        id: 'tasks.transitions.start',
        title: 'Pornește taskul',
        body: 'Deschide taskul și apasă „Începe”. Aplicația rezervă automat materia primă necesară din stoc.',
      },
      {
        id: 'tasks.transitions.blocked',
        title: 'Dacă nu e stoc suficient',
        body: 'Dacă nu ai destulă materie primă, taskul trece automat în „Blocat” și îți arată exact ce lipsește. Completează stocul (recepție sau transfer) și încearcă din nou.',
      },
      {
        id: 'tasks.transitions.finalize',
        title: 'Finalizează taskul',
        body: 'Când producția e gata, apasă „Finalizează” și introdu cantitatea reală obținută. Produsul finit intră automat în stoc, cu propriul lot și dată de expirare.',
      },
      {
        id: 'tasks.transitions.byproducts',
        title: 'Resturi / byproducts',
        body: 'Dacă rețeta are resturi utilizabile (ex. resturi de blat), le poți declara la finalizare — intră și ele în stoc, ca semipreparate.',
      },
    ],
  },
  {
    id: 'tasks.multi',
    title: 'Task multiplu și familie de taskuri',
    category: 'Producție',
    platforms: ALL,
    steps: [
      {
        id: 'tasks.multi.mode',
        title: 'Alege „Mai multe produse”',
        body: 'La crearea unui task, comută pe „Mai multe produse” pentru a grupa mai multe rețete într-un singur pas — ex. toate sosurile de înghețată dintr-o dată.',
      },
      {
        id: 'tasks.multi.rows',
        title: 'Adaugă produsele',
        body: 'Adaugă câte un rând pentru fiecare rețetă, cu cantitatea ei. Poți șterge un rând cu iconița de coș.',
      },
      {
        id: 'tasks.multi.family',
        title: 'Familie de taskuri (semipreparate)',
        body: 'Activează „include semipreparate” ca aplicația să creeze automat, sub fiecare task, câte un subtask pentru fiecare semipreparat din rețetă (ex. la un tort: aluat, cremă, glazură) — ca un arbore genealogic.',
      },
      {
        id: 'tasks.multi.group',
        title: 'Eticheta de grup',
        body: 'Taskurile create împreună poartă o etichetă de grup vizibilă pe board, ca să le identifici ușor.',
      },
    ],
  },
  {
    id: 'stock.receive',
    title: 'Recepție marfă (intrare în stoc)',
    category: 'Stoc',
    platforms: ALL,
    steps: [
      {
        id: 'stock.receive.open',
        title: 'Deschide recepția',
        body: 'Din Stoc, apasă „Recepție”. Locația se preselectează automat (locația implicită setată de administrator, sau „Laborator”).',
      },
      {
        id: 'stock.receive.addRow',
        title: 'Adaugă materialele primite',
        body: 'Pentru fiecare material primit, alege materia primă, cantitatea, prețul de achiziție și — opțional — numărul lotului, data expirării și factura.',
      },
      {
        id: 'stock.receive.submit',
        title: 'Confirmă recepția',
        body: 'Apasă „Salvează recepția”. Stocul se actualizează imediat, pe locația aleasă.',
      },
    ],
  },
  {
    id: 'stock.rawMaterial.create',
    title: 'Adaugă o materie primă nouă',
    category: 'Stoc',
    platforms: ALL,
    steps: [
      {
        id: 'stock.rawMaterial.create.open',
        title: 'Adaugă material',
        body: 'Din Stoc → Materii prime, apasă butonul „+” pentru a adăuga un material nou.',
      },
      {
        id: 'stock.rawMaterial.create.unit',
        title: 'Unitatea de măsură',
        body: 'Alege unitatea în care ții evidența acestui material — kilograme/grame sau litri/mililitri pentru cele lichide, bucăți pentru cele care se numără. Asta hotărăște cum se scade din stoc și cum se calculează costul rețetelor care îl folosesc.',
      },
    ],
  },
  {
    id: 'stock.testConsumption',
    title: 'Consum pentru teste',
    category: 'Stoc',
    platforms: ALL,
    steps: [
      {
        id: 'stock.testConsumption.open',
        title: 'Deschide „Consum teste”',
        body: 'Din pagina de materii prime, apasă acțiunea „Consum teste” — pentru materiale folosite la probe/rețete de test, nu la o producție reală.',
      },
      {
        id: 'stock.testConsumption.rows',
        title: 'Alege materialele',
        body: 'Adaugă materialele și cantitățile consumate la test. Se scad din stoc separat, cu un motiv dedicat („Consum teste”), vizibil în istoricul mișcărilor.',
      },
    ],
  },
  {
    id: 'stock.finishedGoods',
    title: 'Stoc de produse finite și loturi',
    category: 'Stoc',
    platforms: ALL,
    steps: [
      {
        id: 'stock.finishedGoods.overview',
        title: 'Stocul de produse finite',
        body: 'Din Stoc → „Stoc produse” vezi cantitățile de produse finite și semipreparate, pe fiecare locație.',
      },
      {
        id: 'stock.finishedGoods.lots',
        title: 'Loturi pe șarjă',
        body: 'Fiecare șarjă produsă primește propriul lot (ex. „10082026-Fistic 1”) și propria dată de expirare. Deschide un produs pentru a vedea toate loturile lui și totalul la finalul listei.',
      },
      {
        id: 'stock.finishedGoods.fifo',
        title: 'Consum automat FIFO',
        body: 'Când produsul iese din stoc (livrare, transfer), aplicația consumă automat mai întâi lotul cel mai vechi.',
      },
    ],
  },
  {
    id: 'recipes.create',
    title: 'Cum creezi sau editezi o rețetă',
    category: 'Rețete',
    platforms: ALL,
    steps: [
      {
        id: 'recipes.create.open',
        title: 'Rețetă nouă',
        body: 'Din Rețete, apasă „+ Rețetă nouă”. Completează numele, categoria, unitatea de măsură și randamentul.',
      },
      {
        id: 'recipes.create.ingredients',
        title: 'Adaugă ingredientele',
        body: 'Apasă „Adaugă ingredient” — poți alege fie o materie primă, fie un alt semipreparat deja existent (ex. o cremă folosită în mai multe torturi).',
      },
      {
        id: 'recipes.create.byproduct',
        title: 'Byproduct (opțional)',
        body: 'Dacă rețeta lasă un rest utilizabil (ex. resturi de blat), activează comutatorul „Byproduct” și completează numele și cantitatea.',
      },
      {
        id: 'recipes.create.save',
        title: 'Salvează',
        body: 'Apasă „Salvează”. Rețeta apare imediat în listă și poate fi folosită la crearea de taskuri.',
      },
    ],
  },
  {
    id: 'orders.create',
    title: 'Cum creezi o comandă și o livrezi',
    category: 'Comenzi',
    platforms: ALL,
    steps: [
      {
        id: 'orders.create.open',
        title: 'Comandă nouă',
        body: 'Din Comenzi, apasă „+ Comandă nouă” și completează datele clientului și termenul de livrare.',
      },
      {
        id: 'orders.create.items',
        title: 'Adaugă produsele',
        body: 'Adaugă câte un rând pentru fiecare produs comandat, cu cantitatea dorită.',
      },
      {
        id: 'orders.create.status',
        title: 'Urmărește statusul',
        body: 'Comanda trece prin etapele Nouă → În pregătire → Gata → Livrată. Actualizează statusul pe măsură ce avansează.',
      },
      {
        id: 'orders.create.deliveryNote',
        title: 'Nota de livrare',
        body: 'La livrare, poți captura semnătura clientului direct din aplicație — nota de livrare se generează automat.',
      },
    ],
  },
  {
    id: 'stock.transfers',
    title: 'Transfer de stoc între locații',
    category: 'Stoc',
    platforms: ALL,
    steps: [
      {
        id: 'stock.transfers.open',
        title: 'Transfer nou',
        body: 'Din Stoc → „Transferuri”, apasă „+ Transfer nou” și alege locația sursă și destinația.',
      },
      {
        id: 'stock.transfers.items',
        title: 'Alege produsele',
        body: 'Adaugă materialele sau produsele finite de transferat, cu cantitatea. Stocul se scade imediat din sursă.',
      },
      {
        id: 'stock.transfers.transit',
        title: 'Pune-l în tranzit',
        body: 'Când marfa pleacă efectiv, marchează transferul „În tranzit” și alege persoana responsabilă de transport.',
      },
      {
        id: 'stock.transfers.finalize',
        title: 'Finalizează la sosire',
        body: 'La destinație, marchează „Finalizat” — stocul se adaugă automat acolo. Poți captura și semnătura de primire.',
      },
    ],
  },
  {
    id: 'stock.excel',
    title: 'Export și import de stoc în Excel',
    category: 'Stoc (administrator)',
    platforms: ['web'],
    steps: [
      {
        id: 'stock.excel.export',
        title: 'Exportă stocul',
        body: 'Din Stoc → Materii prime, folosește acțiunea „Exportă Excel” (vizibilă doar pentru administrator) — descarci tot stocul într-un fișier editabil.',
      },
      {
        id: 'stock.excel.import',
        title: 'Importă modificările',
        body: 'După ce editezi fișierul, folosește „Importă Excel”. Aplicația îți arată întâi exact ce se schimbă, înainte să confirmi.',
      },
    ],
  },
  {
    id: 'locations.manage',
    title: 'Locații și locația implicită',
    category: 'Locații',
    platforms: ALL,
    steps: [
      {
        id: 'locations.manage.create',
        title: 'Adaugă o locație',
        body: 'Din Locații, apasă „+ Locație nouă” și completează numele, tipul (ex. Laborator, Depozit) și adresa.',
      },
      {
        id: 'locations.manage.defaultDelivery',
        title: 'Locație implicită de livrare',
        body: 'Comutatorul „Livrare implicită” setează locația din care pleacă automat comenzile cu livrare.',
      },
      {
        id: 'locations.manage.defaultProduction',
        title: 'Locație implicită de producție/recepție',
        body: 'Comutatorul „Producție/recepție” setează locația preselectată automat la crearea unui task și la recepția de marfă, pentru toți utilizatorii din organizație.',
      },
    ],
  },
  {
    id: 'users.roles',
    title: 'Utilizatori și roluri',
    category: 'Administrare',
    platforms: ALL,
    steps: [
      {
        id: 'users.roles.invite',
        title: 'Invită un utilizator',
        body: 'Din Setări → „Utilizatori și roluri”, apasă „Invită utilizator” și completează emailul și rolul. Persoana primește un email cu link de setare a parolei.',
      },
      {
        id: 'users.roles.permissions',
        title: 'Ce poate face fiecare rol',
        body: 'Fiecare rol (administrator, șef cofetar, cofetar, gestionar, șofer) are un set diferit de permisiuni — ce vede și ce poate modifica în aplicație.',
      },
      {
        id: 'users.roles.deactivate',
        title: 'Dezactivează un utilizator',
        body: 'Când cineva pleacă din echipă, dezactivează-i contul din pagina lui de profil — nu-i mai poate accesa datele, dar istoricul rămâne intact.',
      },
    ],
  },
  {
    id: 'settings.org',
    title: 'Setări organizație și branding',
    category: 'Administrare',
    platforms: ALL,
    steps: [
      {
        id: 'settings.org.company',
        title: 'Date firmă',
        body: 'Din Setări → „Firma mea”, completează datele fiscale (CUI, sediu) folosite pe documentele legale (avize, facturi).',
      },
      {
        id: 'settings.org.branding',
        title: 'Branding și teme',
        body: 'Din Setări → „Branding și teme” personalizezi culoarea, logo-urile și fontul aplicației pentru organizația ta, separat pentru modul luminos și întunecat.',
      },
      {
        id: 'profile.tutorial',
        title: 'Modul tutorial',
        body: 'Din Profil → Preferințe, fiecare utilizator își poate porni sau opri singur sfaturile contextuale — nu e o setare de organizație.',
      },
    ],
  },
  {
    id: 'calendar.myDay',
    title: 'Calendar și „Ziua mea”',
    category: 'Producție',
    platforms: ALL,
    steps: [
      {
        id: 'calendar.myDay.filter',
        title: 'Filtrul „Ziua mea”',
        body: 'Pe Board, activează „Ziua mea” pentru a vedea doar taskurile tale relevante azi — scadente azi, restante sau fără termen.',
      },
      {
        id: 'calendar.myDay.calendar',
        title: 'Vedere de calendar',
        body: 'Din „Calendar”, vezi toate taskurile și comenzile planificate, grupate pe zi — util pentru a organiza săptămâna.',
      },
    ],
  },
];
