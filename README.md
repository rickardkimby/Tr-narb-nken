# Tränarbänken

Ett fiktivt fotbollsmanagerspel — 5 länder, 3 divisioner per land, 300 klubbar, egna cuper, ekonomi, akademi och en egen matchmotor. Byggt som en fristående webbapp så du kan dela en länk med vänner. Varje person som öppnar länken spelar sin egen, oberoende karriär — sparningen sker lokalt i webbläsaren (samma sätt som appar som Wordle sparar din statistik).

Spelet är gjort för **liggande läge** på telefon. I stående läge visas en uppmaning att vrida skärmen.

Appen har en **service worker** som cachar sidan efter första besöket — fungerar därför även vid dåligt/nätverkslöst läge efter att den öppnats en gång, och kvalificerar som en riktig installerbar PWA på Android (automatisk "Installera app"-ruta i Chrome, inte bara manuell "Lägg till på hemskärmen").

## Testa lokalt

Kräver [Node.js](https://nodejs.org) (version 18 eller senare).

```bash
npm install
npm run dev
```

Öppnas på `http://localhost:5173`. Testa gärna på din telefon genom att öppna samma adress via datorns lokala IP (visas i terminalen när du kör `npm run dev -- --host`).

## Publicera så vänner kan spela

Enklaste vägen är **Vercel** eller **Netlify** — båda har gratisnivåer som räcker gott och gott för det här.

### Alternativ A: Vercel (rekommenderas, snabbast)

1. Skapa ett konto på [vercel.com](https://vercel.com) (går bra med GitHub-inloggning).
2. Ladda upp den här mappen till ett nytt GitHub-repo (eller kör `npx vercel` direkt i mappen från terminalen och följ instruktionerna — då behövs inget GitHub alls).
3. Vercel upptäcker automatiskt att det är ett Vite-projekt. Klicka Deploy.
4. Du får en länk typ `https://tranarbanken.vercel.app` — dela den med vem du vill.

### Alternativ B: Netlify

1. Kör `npm run build` — skapar en `dist`-mapp med hela appen som statiska filer.
2. Gå till [app.netlify.com/drop](https://app.netlify.com/drop) och dra `dist`-mappen dit.
3. Klart — du får en länk direkt.

### Alternativ C: GitHub Pages

1. Lägg koden i ett GitHub-repo.
2. Kör `npm run build`.
3. Publicera innehållet i `dist`-mappen via repots Pages-inställningar (Settings → Pages → välj `dist` som källa, eller använd ett verktyg som `gh-pages`-paketet).

## Lägga till på hemskärmen (som en riktig app)

När sidan är öppnad i mobilens webbläsare:

- **iPhone (Safari):** tryck på Dela-ikonen → "Lägg till på hemskärmen".
- **Android (Chrome):** tryck på menyn (⋮) → "Lägg till på startskärmen".

Då får spelet en egen ikon och öppnas i fullskärm utan webbläsarens adressfält.

## Om sparningen

Varje spelare sparas i webbläsarens `localStorage` på just den enheten. Det betyder:

- Ingen inloggning behövs — spelet finns kvar nästa gång du öppnar länken på samma telefon/dator.
- Sparningen är **inte** delad mellan enheter eller mellan personer. Om du spelar på både mobilen och datorn har du två separata karriärer.
- Rensar du webbläsarens data (eller använder privat/inkognitoläge) försvinner sparningen.

## Struktur

```
├── index.html                     Startsida, viewport/manifest-inställningar, laddar Tailwind via CDN
├── public/
│   ├── manifest.json               PWA-manifest (namn, ikon, liggande orientering)
│   └── icon-192.png / icon-512.png Appikoner
├── src/
│   ├── main.jsx                    React-startpunkt
│   └── App.jsx                     Hela spelet (en fil, samma kod som artefakten i Claude)
```

Vill du bygga vidare på spelet är `src/App.jsx` samma fil du redan känner igen — allt fungerar precis som innan.
