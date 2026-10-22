# Horae — App Store Connect submission pack

Tot ce cere ecranul "Unable to Add for Review", gata de paste. Sursa: acest fisier;
paginile publice cerute exista in repo la `apps/web/src/app/(legal)/` (`/privacy`, `/support`)
si trebuie sa fie LIVE pe horae.ca inainte de submit (Apple verifica URL-urile).

## App Information

| Camp | Valoare |
|---|---|
| Primary category | **Business** |
| Secondary category (optional) | Productivity |
| Content Rights | **Does not contain, show, or access third-party content** |

### Age Rating (questionnaire)
Raspunde **None / No** la toate (violenta, teme sexuale, jocuri de noroc, medical,
limbaj, horror, substante, web necontrolat, user-generated content public, chat).
Rezultat: **4+**.

## Pricing
- Price: **Free (0 USD / Tier 0)**, toate teritoriile (sau restrange la Romania + EU daca vrei).

## App Privacy
- Privacy Policy URL: **https://horae.ca/privacy**

### Data collection (nutrition labels) — raspunsuri exacte
„Do you or your third-party partners collect data from this app?" → **Yes**

| Data type | Collected | Linked to identity | Used for tracking | Purpose |
|---|---|---|---|---|
| Contact Info → Name | Yes | Yes | No | App Functionality |
| Contact Info → Email Address | Yes | Yes | No | App Functionality |
| Identifiers → User ID | Yes | Yes | No | App Functionality, Analytics |
| Usage Data → Product Interaction | Yes | Yes | No | Analytics (PostHog, EU) |
| Diagnostics → Crash Data | Yes | Yes | No | App Functionality (Sentry) |
| Diagnostics → Performance Data | Yes | Yes | No | App Functionality (Sentry) |
| User Content → Other User Content (semnaturi livrare, date operationale) | Yes | Yes | No | App Functionality |

Tracking (cross-app/site): **No** pentru tot. Corespunde cu `PrivacyInfo.xcprivacy` din app.

## Version Information (English U.S. — campurile cu erori)

**Promotional Text** (optional, 170):
> Production, inventory and orders for pastry businesses — recipes, costs, stock and deliveries in one place.

**Description**:
> Horae is the production and inventory platform for pastry shops and bakery labs.
>
> RECIPES & COSTS
> • Recipes with sub-recipes (semi-prepared), versioning and automatic cost per batch
> • Nutrition values and EU-14 allergens rolled up from raw materials
>
> PRODUCTION
> • Production tasks with live stock checks, reservations and traceability
> • FIFO lot tracking: every finished product knows exactly which intake lots it consumed
>
> INVENTORY
> • Per-location stock for raw materials, semi-prepared and finished products
> • Receptions with lots, expiry tracking, low-stock alerts, transfers with delivery notes
> • Requirements planning: compute exactly what to buy for a production plan
>
> ORDERS & DELIVERIES
> • Orders with status flow, delivery notes with digital signature, conformity certificates
>
> Horae is built for teams: role-based permissions, real-time updates across devices, and full white-label branding per organization. An account is provided by your organization's administrator.

**Keywords** (93/100):
> bakery,pastry,inventory,production,stock,recipes,cofetarie,stocuri,productie,retete,laborator

**Support URL:** https://horae.ca/support
**Marketing URL (optional):** https://horae.ca

### Localizare Romanian (recomandat, adauga limba „Romanian")
**Descriere:**
> Horae este platforma de productie si stocuri pentru cofetarii si laboratoare de patiserie.
>
> RETETE SI COSTURI
> • Retete cu semipreparate, versionare si cost automat pe sarja
> • Valori nutritionale si alergeni EU-14 calculati din materii prime
>
> PRODUCTIE
> • Sarcini de productie cu verificare de stoc in timp real, rezervari si trasabilitate
> • Loturi FIFO: fiecare produs finit stie exact ce loturi de receptie a consumat
>
> STOCURI
> • Stoc pe locatii pentru materii prime, semipreparate si produse finite
> • Receptii cu loturi, urmarirea expirarii, alerte de stoc scazut, transferuri cu aviz
> • Necesar de materii prime: calculeaza exact ce trebuie cumparat pentru un plan de productie
>
> COMENZI SI LIVRARI
> • Comenzi cu flux de statusuri, foi de parcurs cu semnatura digitala, certificate de conformitate
>
> Horae e facut pentru echipe: permisiuni pe roluri, actualizari in timp real pe toate dispozitivele si branding complet per organizatie. Contul este creat de administratorul organizatiei tale.

**Cuvinte cheie:** cofetarie,patiserie,stocuri,productie,retete,laborator,inventar,transferuri

## App Review Information (Contact + demo)
- First name / Last name: Sergiu Tigan
- Email: sergiutigan@gmail.com
- Phone: **[COMPLETEAZA — obligatoriu]**
- Sign-in required: **Yes** → ⚠️ **OBLIGATORIU cont demo pe PROD** (build-ul de review
  bate in api.horae.ca). Creeaza un user demo (rol administrator sau cofetar) intr-o
  organizatie cu date de exemplu si pune credentialele aici. Fara asta review-ul pica
  garantat (Guideline 2.1).
- Notes for review (sugestie):
  > Horae is a B2B tool; accounts are provisioned by each organization's admin.
  > Use the demo credentials above. The app is white-labelled per organization —
  > branding (colors, logo) is applied after sign-in.

## Build
- Alege build-ul 1.11.0 urcat pe TestFlight (scheme **Horae**, nu Horae Test, pentru app-ul de prod).

## Ce mai trebuie facut inainte de submit
1. **Deploy prod pentru web** — /privacy si /support trebuie live pe horae.ca.
2. **Screenshots** — minim setul 6.7" (iPhone 15/16 Pro Max, 1290×2796); daca lipsesc, submitul cere si asta.
3. **Cont demo pe prod** + telefon de contact (vezi mai sus).
4. App Privacy trebuie completat de un user cu rol **Admin** in App Store Connect (asa cere eroarea).

## Automatizare (optional)
Cu o cheie App Store Connect API (Users and Access → Integrations → App Store Connect API →
Team Key, rol **App Manager**; da-mi Issuer ID + Key ID + fisierul .p8) pot seta prin API:
categorii, content rights, age rating, pret, descriere/keywords/URL-uri, contactul de review
si selectia build-ului. Exceptie: sectiunea App Privacy (nutrition labels) — Apple o cere
completata manual de un Admin in UI.
