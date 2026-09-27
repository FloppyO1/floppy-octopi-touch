# FloppyOctoTouch — Piano di realizzazione multi-sessione

> Documento di lavoro per le sessioni di sviluppo con Claude Code.
> Ogni sessione inizia leggendo questo file e **aggiorna la sezione "Stato avanzamento"** alla fine.
> Lingua: piano in italiano; **codice, commenti, commit, README e documentazione pubblica in inglese**.

---

## 0. Avvio di una sessione (procedura per Claude)

L'utente avvia **ogni** sessione con lo stesso prompt:
```
Leggi docs/PLAN.md ed esegui la procedura della sezione 0.
```
Procedura:
1. Leggere **tutto** questo file e, se esiste, `CLAUDE.md`.
2. **Individuare la sessione da eseguire** nella sezione 6 "Stato avanzamento":
   - se c'è una riga `[~]` (in corso) → è una **sessione interrotta**: controllare `git status`, `git log` e le
     "Note tra sessioni", dire all'utente cosa è già fatto e cosa manca, poi completarla;
   - altrimenti → la **prima riga `[ ]`** in ordine.
   - Se tutte sono `[x]`, dirlo all'utente e chiedere come proseguire.
3. Dire all'utente in una riga quale sessione si sta per eseguire; poi marcare la riga come `[~]` con la data
   (così un'interruzione è riconoscibile alla sessione successiva). Nella Sessione 1 il repo git non esiste ancora:
   si parte da `git init`.
4. Eseguire la sessione come descritta nel suo blocco della sezione 4 (il blocco è la specifica, non serve incollarlo),
   rispettando le convenzioni della sezione 3.
5. **Stop intermedi previsti** (aspettare la risposta dell'utente prima di proseguire):
   - Sessione 3: dopo gli screenshot delle varianti del colore d'accento;
   - Sessione 10: dopo ogni passo della checklist hardware (l'utente ha il Pi davanti e riporta l'esito);
     se la sessione si allunga, spezzarla in 10a / 10b.
   - In qualsiasi sessione: quando serve una decisione che il piano non copre.
6. Chiusura: checklist della sezione 3, con **versione = 0.N.0** e tag `v0.N.0` per la Sessione N
   (eccezioni: Sessione 9b → `0.9.1` / `v0.9.1`; Sessione 10 → `1.0.0` / `v1.0.0`). Marcare la riga come `[x]` con la data, aggiungere le note
   in "Note tra sessioni".
7. **Fermarsi.** Non iniziare la sessione successiva: l'utente riavvierà con lo stesso prompt in una nuova sessione.

---

## 1. Requisiti raccolti

### Hardware / software di destinazione
| Voce | Valore |
|---|---|
| SBC | Raspberry Pi 4, 8 GB |
| OS | OctoPi 1.1.0 (build 2025.12.01) — Raspberry Pi OS **Bookworm Lite**, nessun desktop installato |
| OctoPrint | 1.11.8, Python 3.11.2 |
| Display | [7inch HDMI Display (H)](https://www.lcdwiki.com/7inch_HDMI_Display_(H)) — **1024×600**, touch capacitivo GT911 5 punti via **micro-USB (HID, nessun driver)**, luminosità solo da pulsante fisico (non controllabile via software) |
| Orientamento | Orizzontale 1024×600 |
| Stampante | Anet A8 modificata ("Tatara A8"), volume ~220×220×240, **scheda 32 bit (tipo SKR), Marlin 2** |
| Sensori attuali | Nessun sensore di livellamento, nessun sensore filamento — **l'app deve essere pronta per upgrade futuri** (probe, runout sensor, M600/M701/M702) |
| Estrusore | Tipo (direct/bowden) **non noto** → lunghezze carico/scarico/spurgo **configurabili** con default prudenti (carico lento 100 mm; bowden 0 finché l'utente non lo imposta) |
| Display stampante | LCD originale **ancora collegato con buzzer** (resterà montato anche se nascosto) → beep fine stampa via `M300` attivo di default, messaggi `M117` possibili |
| Webcam | **USB (UVC)**, gestita da camera-streamer di OctoPi (in dev: nessuna webcam reale → stream finto/fallback) |
| Slicer | PrusaSlicer / OrcaSlicer (thumbnail incorporate nel G-code) |

### Scelte funzionali
- **Tecnologia**: web app **Svelte 5 + TypeScript + Vite**, aperta in **Chromium kiosk** all'avvio.
- **Connessione**: sempre verso OctoPrint **locale** (127.0.0.1) → funziona anche senza WiFi.
- **Autenticazione**: l'utente **incolla una API key** creata in OctoPrint (chiesta da `install.sh`, modificabile dopo).
- **Connessione stampante all'avvio**: rispetta l'autoconnect di OctoPrint + pulsante "Connetti" manuale (porta/baud).
- **Stile**: dark moderno, pulsanti grandi, pensato per il touch. Tutta la grafica fatta da zero (ispirarsi a OctoPrint solo per le funzioni).
- **Lingue**: inglese + italiano (selezionabile). **Default al primo avvio: inglese**. Orologio **24h**, fuso orario del Pi.
- **Conferme**: popup di conferma sulle azioni critiche (stop stampa, elimina file, spegni/riavvia, temperature alte, disattiva motori durante stampa…).
- **Soglie temperature** (modificabili nelle impostazioni): conferma sopra **hotend 250 °C / piatto 90 °C**; massimo accettato dal NumPad **hotend 275 °C / piatto 110 °C** (se il profilo stampante OctoPrint ha limiti più bassi vincono quelli).
- **Screensaver**: dopo X minuti di inattività mostra una **vista minimale a caratteri grandi** (progresso se in stampa, altrimenti orologio + temperature). Tocco = ritorno. **Opzione (default disattivata)**: in stampa mostra anche la **miniatura del file** accanto alla percentuale, per capire a colpo d'occhio cosa si sta stampando; da spenta il layout resta quello attuale (v0.4.0).
- **Spegnimento schermo** (opzionale, **default disattivato**): dopo N minuti (default 30) di inattività **solo a stampante ferma** spegne l'uscita HDMI; il tocco la riaccende (il tocco di risveglio non attiva nulla). Mai durante la stampa.
- **Host action / prompt Marlin**: se il firmware espone `Cap:PROMPT_SUPPORT`, i messaggi `//action:prompt_begin/choice/show/end`, `//action:pause/resume/cancel`, `//action:notification` vengono mostrati come **dialog touch** e la risposta inviata con `M876 S<n>`. Serve per M600 / runout futuri.
- **Tastiera a schermo**: fatta **dentro l'app**, con lo stesso stile (layout QWERTY IT/EN, tastierino numerico, layout G-code).
- **Navigazione**: **sidebar sinistra con 8 icone** (~88 px di larghezza, pulsanti ~64 px) + **status bar in alto** (~48 px) → area contenuto ~936×552.
- **Colore d'accento**: scelto in Sessione 3 → **teal** (default); ambra e indaco restano selezionabili (impostazione `accent`, UI definitiva in S8).
- **Indicatori ad anello (gauge)**: i valori principali si mostrano come **anelli circolari** con il valore grande al
  centro e un'etichetta sotto (riferimento: immagine fornita dall'utente il 2026-09-25, stile "OctoPrint status
  screen"): hotend e piatto con **attuale al centro + "Target: N °C"** sotto e tacca del target sull'anello,
  ventola %, **job %**, **layer %** (solo con DisplayLayerProgress), e sulla schermata Sistema **CPU % (+ temperatura
  e frequenza), RAM %, disco %**. Accanto agli anelli, righe di stato con icona (profilo stampante, connessione,
  stato stampante). Resi in **SVG** (niente librerie), con transizione fluida del valore, colori dai token del tema
  scuro (accento; colori di stato per heating/errore/fuori soglia), leggibili a 50-80 cm; toccando l'anello di una
  temperatura si apre NumPad/preset, quello della ventola lo slider.

### Schermate
1. **Home**: progresso %, tempo trascorso/rimanente, ETA, layer (se disponibile), temperature hotend/piatto con tap per impostarle, pausa/riprendi/stop, anteprima thumbnail o webcam, velocità (feedrate %) / flusso (flow %) / ventola modificabili al volo. Temperature, ventola, job % e layer % come **indicatori ad anello** (vedi "Scelte funzionali").
2. **File**: tre sorgenti, selezionabili con tab:
   - **Local** (storage `local` di OctoPrint): cartelle, navigazione, ordinamento (nome/data/dimensione), info (tempo stimato, filamento, dimensioni), thumbnail, avvia/seleziona/elimina.
   - **SD stampante** (storage `sdcard` di OctoPrint): elenco, avvia, elimina, init/refresh/release SD; visibile solo se la stampante ha la SD attiva. Niente thumbnail/analisi (non disponibili). Avviso che upload verso SD via seriale è lento (non previsto in v1).
   - **Chiavetta USB sul Pi**: l'agent elenca i `.gcode` sulla chiavetta montata (sola lettura) e li **importa** nello storage local di OctoPrint (upload via API, con progresso), eventualmente in una cartella scelta; poi si stampano come file local. Pulsante "Espelli" sicuro.
3. **Temperature**: controllo hotend/piatto, **preset CRUD** (PLA, PETG, TPU di default; modificabili e aggiungibili), **grafico storico** in tempo reale.
4. **Movimento**: jog X/Y/Z con step selezionabili, home (all/singoli assi), disattiva motori, ventola.
5. **Filamento**: **wizard guidato** (materiale → preriscaldo → carico/scarico → spurgo) **+ controllo manuale** estrusore (lunghezza/velocità). Usa M701/M702/M600 se abilitati, altrimenti sequenze G-code configurabili.
6. **Terminale + Macro**: console G-code con tastiera integrata, filtri (nascondi temperature/`ok`), **macro CRUD** con pulsanti.
7. **Livellamento / Mesh**: livellamento manuale ai 4 angoli + centro (paper test, utile ORA senza probe), Mesh Bed Leveling manuale (`G29` MBL) se abilitato nel firmware, `G29` automatico quando ci sarà un probe, visualizzazione mesh (heatmap), babystep (`M290`), Z-offset (`M851`), salva EEPROM (`M500`).
8. **Sistema**: anelli CPU % (temperatura, frequenza) / RAM % / disco %, IP / stato WiFi, riavvio/spegnimento Pi e riavvio OctoPrint (via system commands di OctoPrint), impostazioni app (lingua, timeout screensaver, capability firmware, azioni PSU/luci, API key), info versione.

### Extra
- Notifica **fine stampa** a schermo (popup grande) + beep opzionale (`M300`).
- **Controllo PSU/luci**: supporto al plugin **PSU Control** se installato + "azioni personalizzate" configurabili (G-code, system command OctoPrint, chiamata API plugin).

### Sviluppo e distribuzione
- **Git locale** (niente remote: lo aggiunge l'utente). Predisporre tutto per GitHub: `README.md` **in inglese**, `LICENSE` **MIT**, `.gitignore`, `CHANGELOG.md`.
- **Nome progetto**: `FloppyOctoTouch`.
- **Dev su Windows con Docker**: container OctoPrint con **Virtual Printer** + dev server della dashboard; **anteprima 1024×600** nel browser del PC per valutare la grafica.
- **Tutto il tooling gira in Docker**: Node/npm (Vite, vitest, build), Python (agent, pytest, ruff), Playwright (screenshot), shellcheck. **Mai** `npm install` / `pip install` sul PC Windows, anche se Node 24 e Python 3.11 sono presenti. Comandi ricorrenti esposti come servizi/profili di `dev/docker-compose.yml` (es. `docker compose run --rm frontend npm test`) e documentati in README e CLAUDE.md. `node_modules` in un volume Docker (non nella cartella del PC) per prestazioni e pulizia.
- **Verifica grafica**: Claude genera **screenshot automatici a 1024×600** con Playwright in un container (salvati in `dev/screenshots/`, ignorati da git salvo quelli per il README) e li esamina; l'utente controlla comunque nel browser.
- **Versioning**: SemVer, parte da **0.1.0** a fine Sessione 1, **bump minor a ogni sessione** (0.2.0, 0.3.0…) con **tag git locale** e voce in `CHANGELOG.md` (formato Keep a Changelog); **v0.9.0** dopo l'installer (S9), **v1.0.0** dopo il test reale (S10). Versione unica mostrata in About, letta da `frontend/package.json` / `agent/pyproject.toml` (tenute allineate).
- **Identità git**: quella globale del PC (`FloppyO1 <thefloppylab@gmail.com>`); `LICENSE` MIT intestata a **Filippo Castellan, 2026**.
- **Installazione sul Pi** con uno script `install.sh` (idempotente), più `update.sh` e `uninstall.sh`.

---

## 2. Architettura

```
┌────────────────────────── Raspberry Pi 4 (OctoPi 1.1.0) ──────────────────────────┐
│                                                                                    │
│  tty1 ── systemd: floppyoctotouch-kiosk.service                                    │
│          cage (Wayland kiosk compositor) ── chromium --kiosk http://127.0.0.1:8765 │
│                                              │                                     │
│  systemd: floppyoctotouch-agent.service      ▼                                     │
│  ┌───────────────────────────────────────────────────────┐                         │
│  │ Agent Python (aiohttp) — 127.0.0.1:8765               │                         │
│  │  • serve la SPA buildata (static)                     │                         │
│  │  • reverse proxy /api /sockjs /plugin /downloads      │──► OctoPrint 127.0.0.1:5000
│  │    → inietta header X-Api-Key (la key non va al JS)   │                         │
│  │  • proxy /webcam → camera-streamer 127.0.0.1:8080     │──► webcam (se presente) │
│  │  • /local/settings  (GET/PUT preset, macro, lingua…)  │                         │
│  │  • /local/system    (IP, SSID, segnale WiFi via nmcli)│                         │
│  │  • /local/thumbnail (estrae thumbnail PrusaSlicer/Orca│                         │
│  │    dai G-code in ~/.octoprint/uploads, con cache)     │                         │
│  │  • /local/usb       (elenca/importa G-code da USB,    │──► /media/usb* (ro)     │
│  │    espelli)                                           │                         │
│  │  • /local/display   (HDMI off/on via wlr-randr)       │──► cage (Wayland)       │
│  └───────────────────────────────────────────────────────┘                         │
└────────────────────────────────────────────────────────────────────────────────────┘
```

### Decisioni chiave e motivazioni
- **Agent Python come reverse proxy same-origin**: niente CORS da abilitare su OctoPrint, l'API key resta lato server (file `~/.config/floppyoctotouch/config.json`, `chmod 600`), si aggiungono endpoint locali (settings, rete, thumbnail) senza toccare OctoPrint né l'haproxy di OctoPi. Python 3.11 è già presente; venv dedicato con `aiohttp`.
- **Sicurezza**: l'agent ascolta **solo su 127.0.0.1** di default (il proxy inietta la API key: esporlo in LAN darebbe controllo senza auth). Opzione `--listen-lan` documentata con avviso esplicito.
- **Real-time**: SockJS di OctoPrint (`/sockjs/websocket`). Flusso auth: `POST /api/login {"passive": true}` (tramite proxy con API key) → `name` + `session` → messaggio socket `{"auth": "name:session"}`. Riconnessione automatica con backoff.
- **Kiosk**: OctoPi è Lite → installare **`cage`** + **Chromium** (verificare nome pacchetto: `chromium` o `chromium-browser`), nessun desktop completo. Flag Chromium: `--kiosk --noerrdialogs --disable-infobars --no-first-run --disable-session-crashed-bubble --disable-translate --disable-pinch --overscroll-history-navigation=0 --ozone-platform=wayland --password-store=basic`, profilo dedicato ripulito a ogni avvio. Cursore nascosto via CSS (`cursor: none` in modalità kiosk). Niente menu contestuale da long-press, niente selezione testo, niente zoom.
- **Offline-first**: font e icone **inclusi nel bundle** (nessuna CDN / Google Fonts), perché senza WiFi non ci sarebbero.
- **Capability firmware**: rilevamento automatico da `M115` (`Cap:AUTOLEVEL`, `Cap:Z_PROBE`, `Cap:EEPROM`, `Cap:EMERGENCY_PARSER`, `Cap:PROMPT_SUPPORT`, …) + **toggle manuali** nelle impostazioni per ciò che M115 non espone (M600/M701/M702, runout sensor, MBL manuale). L'UI nasconde/disabilita i pulsanti non supportati.
- **Thumbnail**: se è installato il plugin **Slicer Thumbnails** (jneilliii) usa il campo `thumbnail` dei file; altrimenti fallback dell'agent che legge i blocchi `; thumbnail begin …` / `; thumbnail_QOI` / `; thumbnail_JPG` dal G-code e li mette in cache.
- **Layer corrente**: da plugin **DisplayLayerProgress** se presente, altrimenti non mostrato (non inventare dati).
- **Grafico temperature**: `uPlot` (leggero, canvas).
- **Icone**: set SVG bundlato (es. Lucide via `lucide-svelte` o import SVG diretti) — solo quelle usate.
- **Persistenza impostazioni**: file JSON gestito dall'agent (`~/.config/floppyoctotouch/settings.json`), con schema versionato e default. In dev, stesso agent in container.
- **Chiavetta USB**: Bookworm Lite non monta nulla in automatico → `install.sh` aggiunge una regola **udev + `systemd-mount`** (o `udisks2`, da valutare in S9) che monta le chiavette **in sola lettura** sotto `/media/usb*` con permessi per l'utente OctoPrint. L'agent non accede mai a percorsi fuori da quei mount (anti path-traversal). Import = upload multipart verso `/api/files/local` (così OctoPrint analizza il file normalmente).
- **SD stampante**: solo tramite API OctoPrint (`/api/files/sdcard`, comandi `M20`/`M21`/`M22` via `POST /api/printer/sd`); capability dal flag `SD_SUPPORT` di OctoPrint / `Cap:` di M115.
- **Spegnimento HDMI**: sotto `cage` si usa `wlr-randr --output HDMI-A-1 --off/--on` (l'agent gira come stesso utente della sessione cage con `WAYLAND_DISPLAY` impostato). Il timer di inattività è nel frontend; se con uscita spenta il touch non arriva a Chromium, fallback: l'agent ascolta `/dev/input/event*` del GT911 (evdev) per il risveglio. **Da verificare sul Pi (S10).**
- **Host prompt Marlin**: parsing delle righe `//action:*` dal log seriale (messaggi `current.logs` del socket) o, se disponibile, dagli eventi del plugin bundled **Action Command Prompt** di OctoPrint; risposta con `M876 S<n>`.
- **Display**: `install.sh` propone (con conferma e backup) di aggiungere a `/boot/firmware/config.txt` le righe del produttore (`hdmi_group=2`, `hdmi_mode=87`, `hdmi_cvt 1024 600 60 6 0 0 0`, `hdmi_drive=1`, `max_usb_current=1`…) e/o `video=HDMI-A-1:1024x600@60` in `cmdline.txt` per KMS. Da verificare sull'hardware reale quale serve.

### Struttura repository prevista
```
FloppyOctoTouch/
├── README.md               # EN: features, screenshots, install, dev, troubleshooting
├── LICENSE                 # MIT
├── CHANGELOG.md
├── CLAUDE.md               # convenzioni per le sessioni Claude Code
├── .gitignore  .editorconfig
├── docs/
│   ├── PLAN.md             # questo file
│   └── ARCHITECTURE.md     # EN
├── frontend/               # Svelte 5 + TS + Vite
│   ├── src/
│   │   ├── lib/api/        # client REST + SockJS, tipi OctoPrint
│   │   ├── lib/stores/     # stato stampante, job, temp, file, settings, capability
│   │   ├── lib/i18n/       # it.json, en.json
│   │   ├── lib/ui/         # design system: Button, Card, Modal, Confirm, Slider, Keyboard, NumPad…
│   │   ├── screens/        # Home, Files, Temperature, Move, Filament, Terminal, Leveling, System, Idle
│   │   └── App.svelte
│   └── preview.html        # cornice 1024×600 per il PC
├── agent/                  # Python aiohttp
│   ├── floppyoctotouch_agent/
│   ├── pyproject.toml
│   └── tests/
├── deploy/
│   ├── install.sh  update.sh  uninstall.sh
│   ├── systemd/            # agent + kiosk unit
│   └── kiosk/              # launcher chromium
├── dev/
│   ├── docker-compose.yml  # octoprint + virtual printer, agent, vite, + tool: playwright, shellcheck, build
│   ├── octoprint/          # seed config
│   ├── fake-usb/           # cartella montata come "chiavetta USB" finta per l'agent in dev
│   ├── screenshots/        # output Playwright (gitignored)
│   ├── e2e/                # script Playwright per screenshot 1024×600
│   └── sample-gcode/       # G-code di test con thumbnail PrusaSlicer/Orca
└── scripts/
    └── build-release.sh    # crea floppyoctotouch-vX.Y.Z.tar.gz (dist + agent + deploy)
```

### Distribuzione
- Il Pi **non deve compilare** il frontend (niente Node sul Pi). Si crea sul PC (via Docker) un **tarball di release** con `frontend/dist`, `agent/`, `deploy/`.
- `install.sh` funziona in due modi: (a) lanciato da dentro il tarball/cartella copiata (`./deploy/install.sh`), (b) in futuro scaricando l'ultima release da GitHub (`--from-github`), quando la repo esisterà. Più avanti: GitHub Action che builda la release al tag.

---

## 3. Convenzioni per tutte le sessioni
- Leggere `docs/PLAN.md` e `CLAUDE.md` prima di iniziare.
- **Una sessione alla volta**: a fine sessione Claude **si ferma** e aspetta il via dell'utente per la successiva. Mai iniziare la sessione dopo in autonomia.
- **Chiusura di ogni sessione** (checklist obbligatoria):
  1. spuntare la sessione in **Stato avanzamento** e scrivere in **Note tra sessioni** cosa è stato fatto, decisioni, deviazioni dal piano, problemi aperti, comandi utili;
  2. aggiornare la documentazione: `README.md`, `CHANGELOG.md`, `docs/ARCHITECTURE.md` (se cambiata);
  3. creare/aggiornare **`CLAUDE.md`** (convenzioni, comandi Docker, struttura, stato attuale in breve);
  4. bump versione (0.N.0), commit e **tag git locale**.
- **Commit**: in inglese, Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`, `test:`…), piccoli e frequenti. **Massimo 3 righe totali**, sempre con il trailer di co-autore IA (richiesto per conformità alle norme sull'uso dell'IA). Formato:
  ```
  feat(agent): add reverse proxy for /api and /sockjs

  Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
  ```
  (il trailer va aggiornato se cambia il modello indicato dal sistema). Solo git locale, **nessun push / nessun remote**.
- **Niente tool sul PC host**: Python, Node, Playwright, shellcheck solo via Docker (vedi sezione 1 "Sviluppo e distribuzione").
- Target touch: elementi interattivi **≥ 56 px**, spaziatura generosa, niente hover-only, feedback visivo immediato al tocco, nessuna azione distruttiva a singolo tap senza conferma.
- Budget prestazioni sul Pi: bundle JS gzip < ~250 KB, 60 fps nelle transizioni, niente polling REST dove c'è il socket.
- Ogni testo UI passa da i18n (it + en) — nessuna stringa hard-coded.
- Tutto deve funzionare **offline**.
- Verificare a **1024×600** ogni schermata modificata: screenshot Playwright in Docker (Claude) + preview nel browser (utente).
- Non inventare API: in caso di dubbio consultare la documentazione OctoPrint (docs.octoprint.org) e verificare contro il container.

---

## 4. Sessioni

Ogni blocco è la **specifica** della sessione. Non va incollato: basta il prompt unico della sezione 0, che fa
scegliere a Claude la sessione giusta. I blocchi restano utili anche per rilanciare a mano una sessione specifica.

### Sessione 1 — Fondamenta, repo e ambiente Docker
**Obiettivo**: repo pronta, ambiente di sviluppo funzionante, "hello world" che parla con OctoPrint virtuale.

```
Leggi docs/PLAN.md. Esegui la Sessione 1:
1. git init locale (nessun remote), crea README.md (inglese, bozza), LICENSE MIT (Filippo Castellan, 2026),
   .gitignore (node, python, dist, .env, dev data), .editorconfig, CHANGELOG.md, CLAUDE.md con le convenzioni della sezione 3.
2. Crea la struttura cartelle della sezione 2.
3. dev/docker-compose.yml con (NIENTE Node/Python installati sul PC: tutto nei container):
   - OctoPrint 1.11.x (immagine ufficiale octoprint/octoprint) con Virtual Printer abilitato (SD virtuale attiva) e volume persistente;
     seed della config per saltare il più possibile il wizard; documenta in README come creare l'API key e metterla in dev/.env.
   - agent Python (aiohttp) con hot reload, che fa da reverse proxy verso OctoPrint (inclusi i websocket di /sockjs) e inietta X-Api-Key;
     monta dev/fake-usb come finta chiavetta.
   - frontend Vite + Svelte 5 + TypeScript con proxy verso l'agent; node_modules in volume Docker.
   - servizi "tool" (profilo compose): playwright (screenshot 1024×600 in dev/screenshots), test (vitest/pytest/ruff), shellcheck.
   Porte di default: OctoPrint 5000, agent 8765, Vite 5173 (configurabili in dev/.env).
4. Agent minimale: static, proxy /api /sockjs /plugin /downloads, GET/PUT /local/settings con default, /local/health.
5. Frontend minimale: pagina che mostra versione OctoPrint, stato connessione stampante e temperature live via socket
   (flusso auth passive login → socket auth). Crea frontend/preview.html che mostra l'app in una cornice 1024×600.
6. Aggiungi dev/sample-gcode con 2-3 G-code piccoli con thumbnail stile PrusaSlicer.
7. Verifica end-to-end con docker compose up: connessione alla Virtual Printer, temperature che si aggiornano; screenshot Playwright.
8. Chiusura sessione (sezione 3): PLAN, README, CHANGELOG, CLAUDE.md, versione 0.1.0, commit (max 3 righe + Co-Authored-By), tag v0.1.0. Poi FERMATI.
```
**Fatto quando**: `docker compose up` → apro `http://localhost:<porta>/preview.html` e vedo le temperature della stampante virtuale aggiornarsi; lo screenshot Playwright lo conferma.

### Sessione 2 — Data layer
**Obiettivo**: client OctoPrint completo e store reattivi, base per tutte le schermate.

```
Leggi docs/PLAN.md e CLAUDE.md. Esegui la Sessione 2:
- Client REST tipizzato (connection, printer, job, files, printerprofiles, settings, system commands, printer command, tool/bed/chamber).
- Client SockJS con riconnessione/backoff, throttle, gestione messaggi connected/current/history/event/plugin.
- Store Svelte 5 (runes): connection, printerState, temperatures (con storico per il grafico, buffer circolare), job/progress,
  files (albero cartelle), logs terminale, events, capability firmware (parsing M115 + override manuali da settings).
- Settings store sincronizzato con l'agent (/local/settings), schema versionato con migrazioni e default
  (preset PLA 200/60, PETG 235/80, TPU 225/50, macro di esempio, lingua = en, orologio 24h, timeout screensaver,
  spegnimento schermo off/30 min, soglie conferma 250/90 e massimi 275/110, beep M300 on, parametri filamento
  prudenti (bowden 0, carico lento 100 mm), capability override).
- Parser host action Marlin (//action:prompt_begin/choice/show/end, pause/resume/cancel, notification) → store "prompt".
- Store file multi-sorgente: local, sdcard (se SD attiva), usb (dall'agent).
- i18n en/it con switch a runtime (default en).
- Rilevamento plugin installati (PSU Control, Slicer Thumbnails, DisplayLayerProgress, Action Command Prompt) da /api/settings / /api/plugin.
- Test unitari (vitest) per parser M115, parser host action, store temperature, migrazioni settings.
- Pagina di debug temporanea che mostra tutti gli store. Verifica contro la Virtual Printer. Chiusura sessione (sezione 3), poi FERMATI.
```

### Sessione 3 — Design system e shell dell'app
**Obiettivo**: look & feel definitivo e componenti riutilizzabili.

```
Leggi docs/PLAN.md e CLAUDE.md. Esegui la Sessione 3:
- Design token (CSS custom properties): palette dark moderna con accenti per stati (idle, printing, paused, error, heating),
  scala tipografica leggibile a 50-80 cm, font bundlato localmente, spaziature, raggi, ombre.
- Colore d'accento: proponi 2-3 varianti (es. ambra, teal, indaco) intercambiabili via token, fai screenshot della Home/gallery
  per ciascuna e FERMATI a chiedermi quale tenere prima di rifinire il resto.
- Shell 1024×600: sidebar sinistra ~88 px con 8 icone da ~64 px (Home, File, Temperature, Movimento, Filamento, Terminale,
  Livellamento, Sistema) + status bar in alto ~48 px (stato stampante, temperature compatte, orologio 24h, WiFi/IP,
  indicatore connessione) → contenuto ~936×552.
- Componente PromptDialog per gli host action di Marlin (usato in S4).
- Componente RingGauge (SVG): valore grande al centro, etichetta/sottotitolo (es. "Target: 190°C"), tacca opzionale
  del target, min/max, colore da token (accento o stato), stato "non disponibile", transizione fluida, tappabile
  (target ≥ 56 px); dimensioni S/M/L. Nella gallery: esempi hotend/piatto/ventola/job/layer/CPU.
- Componenti: Button (varianti, stato pressed), IconButton, Card, Toggle, Slider touch, Stepper +/-,
  Modal, ConfirmDialog, Toast, NumPad (per temperature/valori), OnScreenKeyboard (QWERTY IT/EN, simboli, layout G-code),
  InputField che apre automaticamente tastiera/numpad.
- Overlay "Connessione a OctoPrint…" / "Stampante disconnessa" con pulsante Connetti (porta/baud da OctoPrint).
- Kiosk hardening lato web: no context menu, no selezione, no zoom, cursor none (attivabile da query param ?kiosk=1).
- Pagina /ui-gallery (solo dev) con tutti i componenti. Screenshot di verifica a 1024×600. Chiusura sessione (sezione 3), poi FERMATI.
```

### Sessione 4 — Home, controllo stampa, screensaver, notifiche
```
Leggi docs/PLAN.md e CLAUDE.md. Esegui la Sessione 4:
- Home: progresso grande, tempo trascorso/rimanente/ETA, layer (solo se DisplayLayerProgress), nome file, thumbnail o webcam
  (toggle), temperature con tap → NumPad/preset, pausa/riprendi/stop con conferma, feedrate % (M220), flow % (M221),
  ventola (M106/M107) con slider.
- Layout Home con RingGauge: anelli hotend e piatto (attuale + target), ventola %, job % e layer % (solo con
  DisplayLayerProgress, altrimenti l'anello non compare), righe di stato con icona (profilo, connessione, stato).
- Vista idle (nessun job): stato stampante, ultimo file, scorciatoie (preriscalda preset, home, file recenti).
- Webcam: URL dai settings OctoPrint (verifica API webcam di 1.11), proxy /webcam nell'agent, fallback se assente.
- Screensaver "vista grande": dopo timeout configurabile, progresso gigante in stampa o orologio + temperature da fermo;
  tocco per uscire (il tocco di risveglio NON deve attivare pulsanti sottostanti).
- Spegnimento schermo opzionale (default off): dopo N min solo a stampante ferma → POST /local/display off (wlr-randr);
  in dev l'endpoint è un no-op che logga. Risveglio al tocco senza attivare pulsanti.
- Notifica fine stampa / errore / pausa (eventi PrintDone, PrintFailed, PrintPaused): popup grande + M300 (default on,
  la stampante ha il buzzer sull'LCD).
- Host prompt Marlin: PromptDialog con le scelte del firmware, risposta M876 S<n>; attivo solo con Cap:PROMPT_SUPPORT
  (testare con righe //action finte iniettate nei test, la Virtual Printer non le genera).
- Test con Virtual Printer lanciando un sample-gcode. Chiusura sessione (sezione 3), poi FERMATI.
```

### Sessione 5 — File
```
Leggi docs/PLAN.md e CLAUDE.md. Esegui la Sessione 5:
- Browser file con cartelle di OctoPrint (storage local), breadcrumb, ordinamento nome/data/dimensione (persistente),
  griglia con thumbnail e lista compatta.
- Dettaglio file: thumbnail grande, tempo stimato, filamento usato, dimensioni, data; azioni Stampa, Seleziona, Elimina (conferma).
- Thumbnail: usa plugin Slicer Thumbnails se presente, altrimenti endpoint agent /local/thumbnail che estrae PNG/JPG/QOI
  dai commenti PrusaSlicer/OrcaSlicer con cache su disco (test pytest con i sample-gcode).
- Aggiornamento automatico su eventi UpdatedFiles / FileAdded / FileRemoved.
- Tab SD stampante (storage sdcard): elenco, stampa, elimina, init/refresh/release; nascosta se SD non disponibile
  (la Virtual Printer ha una SD virtuale per i test).
- Tab USB: endpoint agent /local/usb (list, import con progresso verso /api/files/local, eject), confinato a /media/usb*
  (in dev a dev/fake-usb); test pytest anti path-traversal; aggiornamento quando la chiavetta viene inserita/rimossa (polling
  leggero dell'agent o evento udev → websocket locale).
- Ricerca file con tastiera a schermo.
- Miniature anche fuori dal browser file: `thumbnailUrl()` (core/files.ts) usa il fallback dell'agent, così Home
  e "Pronti da stampare" mostrano le miniature anche senza plugin.
- Screensaver con miniatura: impostazione `screensaver.showThumbnail` (default false, migrazione schema v4) che
  nella vista "in stampa" affianca la miniatura (~220 px, a sinistra) alla percentuale grande; se il file non ha
  miniatura o l'opzione è spenta resta il layout attuale. Interruttore provvisorio nella schermata Sistema
  temporanea (quello definitivo in S8). Screenshot di entrambe le varianti.
- Campione reale `dev/sample-gcode/3dbenchy_prusaslicer.gcode` (PrusaSlicer 2.9, profilo Tatara A8, 240 layer,
  ~1 h, **senza miniatura**): usarlo per il caso "nessuna miniatura", per le info file (tempo/filamento) e per
  stampe lunghe sulla Virtual Printer. Se l'utente lo riesporta con le miniature, sostituirlo allo stesso percorso.
- Chiusura sessione (sezione 3), poi FERMATI.
```

### Sessione 6 — Temperature, Movimento, Filamento
```
Leggi docs/PLAN.md e CLAUDE.md. Esegui la Sessione 6:
- Temperature: hotend/piatto con target, NumPad (massimi 275/110, conferma sopra 250/90, da settings), spegni singolo/tutto,
  grafico uPlot (attuale+target, finestra 5/15/30 min),
  preset CRUD completo (nome, hotend, piatto, ventola opzionale) con tastiera a schermo, riordino, ripristino default.
- Movimento: jog X/Y/Z con step 0.1/1/10/50, velocità jog configurabili, home all/X/Y/Z, disattiva motori (M84, conferma
  se in stampa → bloccato), posizione corrente (M114), limiti dal profilo stampante OctoPrint (220×220×240).
- Filamento: wizard (materiale da preset → preriscaldo con attesa → carico/scarico → spurgo → fatto) che usa M701/M702/M600
  se la capability è attiva, altrimenti sequenze G-code configurabili (tipo estrusore direct/bowden, lunghezza bowden,
  velocità veloce/lenta, spurgo) — tipo estrusore NON noto: default prudenti (bowden 0, carico lento 100 mm) e avviso a
  configurarlo al primo utilizzo del wizard;
  pannello manuale estrudi/ritrai con lunghezza e velocità; protezione cold-extrusion lato UI.
- Tutto bloccato/limitato durante la stampa dove ha senso. Chiusura sessione (sezione 3), poi FERMATI.
```

### Sessione 7 — Terminale, Macro, Livellamento/Mesh
```
Leggi docs/PLAN.md e CLAUDE.md. Esegui la Sessione 7:
- Terminale: log live con auto-scroll e pausa, filtri (temperature, ok, busy), input con tastiera layout G-code,
  storico comandi, pulsanti rapidi.
- Macro: CRUD (nome, icona, colore, lista G-code multi-riga, conferma opzionale), griglia di pulsanti, macro di esempio.
- Livellamento: (a) assistito ai 4 angoli + centro con Z0 e paper test (funziona ORA senza probe, con inset configurabile);
  (b) Mesh Bed Leveling manuale G29 S1/S2 guidato se la capability è attiva; (c) G29 automatico se Cap:AUTOLEVEL/Z_PROBE;
  (d) lettura mesh (M420 V / output G29 T) → heatmap con min/max/range; (e) babystep M290 ±0.01/0.05, Z-offset M851, M500 salva.
- Test parser mesh con output Marlin reali (bilinear e MBL). Chiusura sessione (sezione 3), poi FERMATI.
```

### Sessione 8 — Sistema e Impostazioni
```
Leggi docs/PLAN.md e CLAUDE.md. Esegui la Sessione 8:
- Agent: /local/system con IP, interfacce, SSID, qualità segnale (nmcli), hostname, uptime, temperatura CPU, versione app,
  **uso CPU %, frequenza CPU, RAM %, disco %** (da /proc e statvfs, niente dipendenze extra).
- Schermata Sistema: RingGauge CPU (con temperatura e frequenza), RAM e disco, aggiornati ogni pochi secondi solo
  mentre la schermata è visibile; info rete (nessuna gestione WiFi completa in v1, solo stato), system commands di OctoPrint
  (riavvio OctoPrint, riavvio/spegnimento Pi) con conferma, riavvio kiosk.
- Impostazioni: lingua, timeout screensaver, miniatura nello screensaver (on/off), spegnimento schermo (on/off + minuti), beep fine stampa, soglie/massimi
  temperature, capability firmware (auto-rilevate + override), parametri filamento/estrusore, URL webcam manuale,
  API key (sostituzione tramite tastiera, validazione, salvataggio via agent), reset impostazioni.
- PSU/luci: pulsanti se PSU Control è presente (turnPSUOn/Off/getPSUState) + azioni personalizzate configurabili
  (G-code | system command OctoPrint | chiamata API plugin), mostrabili anche nella status bar.
- About: versione, link repo (placeholder), licenza. Chiusura sessione (sezione 3), poi FERMATI.
```

### Sessione 9 — Installazione sul Raspberry
```
Leggi docs/PLAN.md e CLAUDE.md. Esegui la Sessione 9:
- scripts/build-release.sh (eseguibile in Docker su Windows): build frontend, pacchetto agent, tarball versionato con checksum.
- deploy/install.sh idempotente per OctoPi 1.1.0 / Bookworm (arm64 e armhf): controlli preliminari (OS, utente, OctoPrint
  raggiungibile su 127.0.0.1), rileva l'utente che esegue OctoPrint dal servizio systemd e lo propone per conferma,
  apt install cage + chromium (rileva nome pacchetto) + python3-venv + wlr-randr + fonts minimi,
  regola udev + systemd-mount (o udisks2) per montare le chiavette USB in sola lettura su /media/usb*,
  copia in /opt/floppyoctotouch, venv agent, richiesta API key con validazione su /api/version,
  config in ~/.config/floppyoctotouch (chmod 600), systemd units agent + kiosk (cage su tty1, Restart=always,
  attesa agent pronto), disabilita getty@tty1, opzione (con conferma + backup) per config.txt/cmdline.txt del display,
  riepilogo finale e prompt di riavvio. Flag: --non-interactive, --api-key=, --skip-display-config, --listen-lan.
- deploy/update.sh (nuovo tarball, preserva config/settings) e deploy/uninstall.sh (ripristina getty e backup boot).
- shellcheck pulito; test dello script in un container debian:bookworm (con systemd dove possibile / dry-run).
- README: sezione installazione completa + troubleshooting (schermo nero, touch, API key, log con journalctl).
- Chiusura sessione (sezione 3) con versione e tag v0.9.0 locale, poi FERMATI.
```

### Sessione 9b — Installazione in un solo comando
Obiettivo: sul Pi bastano `git clone …` + `cd FloppyOctoTouch` + `./deploy/install.sh`. Niente `chmod`, niente `sudo`
da ricordare. L'unico input manuale è l'**API key**, creata dall'utente in OctoPrint e incollata quando l'installer la
chiede (decisione dell'utente: niente generazione automatica, niente credenziali OctoPrint nell'installer). Tutte le
domande sono **all'inizio** (key + poche conferme con Invio), poi l'installer lavora da solo fino al riavvio.
```
Leggi docs/PLAN.md e CLAUDE.md. Esegui la Sessione 9b:
- Auto-elevazione: se install.sh (e update.sh / uninstall.sh) non gira come root, si rilancia con
  `exec sudo -- bash <script> <argomenti>` (helper in lib/common.sh; errore chiaro se sudo manca). Funziona anche
  `bash deploy/install.sh` se il bit eseguibile si è perso (copia da Windows/zip). Verificare che `install.sh` resti
  100755 nel repo e nel tarball.
- API key inserita a mano (resta il flusso attuale, rifinito):
  - la chiede come PRIMA domanda, subito dopo i controlli preliminari, con istruzioni chiare e l'indirizzo reale del
    Pi: "apri http://<ip>/ da un PC → Impostazioni (chiave inglese) → Application Keys → nome 'FloppyOctoTouch' →
    Generate → copia e incolla qui";
  - input nascosto, spazi/a capo rimossi, formato controllato e validazione su `/api/version`; se OctoPrint la
    rifiuta la richiede (senza limite di tentativi, Ctrl+C per uscire); se OctoPrint non risponde avvisa e la salva
    senza verifica; Invio a vuoto = inserirla dopo dal touch (con avviso), come oggi;
  - `--api-key=` resta (per i test e per chi la vuole passare da riga di comando);
  - reinstallazione con key salvata ancora valida: tenuta senza chiedere (si cambia con `--api-key=` o dal touch).
- Resto automatico, domande tutte all'inizio prima di apt (che dura minuti): utente chiesto SOLO se non rilevato da
  octoprint.service (altrimenti solo mostrato), key, display (Invio = sì), "riavvia alla fine" (Invio = sì se servono
  le impostazioni del display). Poi niente più domande: alla fine riepilogo e riavvio automatico con conto alla
  rovescia di 10 s annullabile con Ctrl+C (se si annulla, il kiosk parte subito come oggi).
- git: controllare se OctoPi 1.1.0 ha già git; README con `sudo apt install -y git` solo se manca. L'URL del clone
  resta un segnaposto finché la repo non è pubblicata (git solo locale): in alternativa copiare la cartella sul Pi.
- Test nel deploy-test: auto-elevazione da utente non root con sudo, `bash deploy/install.sh` senza bit eseguibile,
  ordine delle domande (nessuna domanda dopo l'inizio di apt: prompt pilotati da un tty finto, es. `script`),
  key rifiutata e poi accettata, key vuota, reinstallazione che tiene la key senza chiedere, utente rilevato non
  chiesto. shellcheck pulito; rigenerare il tarball in release/ prima del deploy-test.
- README, sezione "Installation on the Raspberry Pi": è la guida che l'utente segue sul Pi, quindi deve essere
  **semplice e lineare**, leggibile da chi non conosce il progetto. In cima una guida rapida di pochi passi numerati:
  1. prerequisiti in una riga (Pi 4 con OctoPi 1.1.0 e OctoPrint già configurato, schermo collegato);
  2. crea la API key in OctoPrint (percorso esatto dei menu, con cosa scrivere e cosa copiare);
  3. i comandi da copiare così come sono (ssh, eventuale `apt install git`, `git clone`, `cd`, `./deploy/install.sh`);
  4. cosa chiede l'installer (la key da incollare + le conferme con Invio) e cosa succede dopo (riavvio → dashboard
     sullo schermo).
  Solo dopo, in sottosezioni separate: installazione da tarball senza git, opzioni avanzate (flag), aggiornamento,
  disinstallazione, troubleshooting. Niente dettagli interni (unit, sudoers, udev…) nella guida rapida: vanno in
  `docs/ARCHITECTURE.md` o in una sottosezione "What the installer does" in fondo.
- CHANGELOG; CLAUDE.md (stato attuale).
- Chiusura sessione (sezione 3) con versione e tag v0.9.1 locale, poi FERMATI.
```

### Sessione 10 — Test sul Raspberry reale e rifinitura
```
Leggi docs/PLAN.md e CLAUDE.md. Esegui la Sessione 10 (io ho il Raspberry davanti e ti riporto l'esito):
- Guidami nell'installazione sul Pi (flusso della Sessione 9b: key creata in OctoPrint, clone +
  ./deploy/install.sh) e nella checklist hardware: boot → kiosk automatico, touch preciso, risoluzione
  corretta, funzionamento senza WiFi, riconnessione se OctoPrint si riavvia, stampante spenta/accesa, webcam USB UVC,
  chiavetta USB (inserimento, import, espulsione), SD della stampante, beep M300 dal buzzer dell'LCD, host prompt
  (M876, se il firmware ha PROMPT_SUPPORT), spegnimento HDMI e risveglio al tocco, prestazioni (CPU/RAM Chromium),
  screensaver, tempi di avvio.
- Correggi i bug trovati, ottimizza (flag GPU Chromium, bundle size), rifinisci animazioni e dimensioni dei target.
- README finale con screenshot reali, CHANGELOG, tag v1.0.0 locale.
- Suggerisci la GitHub Action per build della release al tag (senza pubblicare nulla).
- Chiusura sessione (sezione 3) con versione 1.0.0.
- Se la sessione si allunga per i bug, spezzala: 10a (installazione + checklist), 10b (fix + rifinitura), con stop fra le due.
```

---

## 5. Rischi e punti da verificare
| Rischio | Mitigazione |
|---|---|
| `cage` + Chromium su Bookworm Lite: nome pacchetto Chromium, permessi seat/tty | Rilevare pacchetto; usare `seatd` o PAM login nella unit; test sul Pi in Sessione 10 |
| Risoluzione 1024×600 non rilevata via EDID con KMS | Opzione `video=HDMI-A-1:1024x600@60` in cmdline.txt + righe produttore in config.txt, con backup |
| API webcam cambiata in OctoPrint ≥1.9 (plugin webcam multipli) | Verificare contro 1.11 nel container; fallback a URL manuale nelle impostazioni |
| Capability non esposte da M115 (M600/M701/M702) | Toggle manuali nelle impostazioni + sequenze G-code alternative |
| Virtual Printer non emula tutto (mesh, M600, thumbnail) | Fixture di output Marlin reali nei test; verifica finale sul Pi |
| Tocco di risveglio dallo screensaver che preme pulsanti | Overlay che "mangia" il primo tocco |
| Chromium che mostra "ripristina sessione" dopo spegnimento brusco | Profilo pulito a ogni avvio + `--disable-session-crashed-bubble` |
| API key esposta in LAN tramite proxy | Agent solo su 127.0.0.1 di default |
| HDMI spento: il touch potrebbe non arrivare a Chromium / cage potrebbe chiudersi senza output | Funzione default off; fallback risveglio via evdev nell'agent; test in S10 |
| Automount USB assente su Bookworm Lite; filesystem exFAT/NTFS | udev + systemd-mount in sola lettura; supporto FAT32/exFAT (pacchetto `exfatprogs` se serve) |
| Chiavetta USB come vettore di path traversal / file enormi | Agent confinato a /media/usb*, solo estensioni .gcode/.gco/.g, limite dimensione configurabile |
| Storage SD via seriale lento e bloccante durante la stampa | Refresh SD solo su richiesta e mai durante la stampa; nessun upload verso SD in v1 |
| Host prompt Marlin non emulati dalla Virtual Printer | Test con righe `//action:` fittizie; verifica reale in S10 |
| Tipo estrusore sconosciuto → carico/scarico errati | Default prudenti + richiesta di configurazione al primo wizard |

---

## 6. Stato avanzamento
_Legenda: `[ ]` da fare · `[~]` in corso (interrotta se la trovi a inizio sessione) · `[x]` completata. Aggiungere la data._

- [x] Sessione 0 — Raccolta requisiti e piano (2026-09-25), integrazione requisiti mancanti (2026-09-25)
- [x] Sessione 1 — Fondamenta, repo e ambiente Docker (2026-09-25, v0.1.0)
- [x] Sessione 2 — Data layer (2026-09-25, v0.2.0)
- [x] Sessione 3 — Design system e shell (2026-09-25, v0.3.0)
- [x] Sessione 4 — Home, controllo stampa, screensaver, notifiche (2026-09-25, v0.4.0)
- [x] Sessione 5 — File (2026-09-25, v0.5.0)
- [x] Sessione 6 — Temperature, Movimento, Filamento (2026-09-25, v0.6.0)
- [x] Sessione 7 — Terminale, Macro, Livellamento/Mesh (2026-09-25, v0.7.0)
- [x] Sessione 8 — Sistema e Impostazioni (2026-09-25, v0.8.0)
- [x] Sessione 9 — Installazione sul Raspberry (2026-09-25, v0.9.0; interrotta una volta e ripresa lo stesso giorno)
- [~] Sessione 9b — Installazione in un solo comando (aggiunta 2026-09-27, iniziata 2026-09-27)
- [ ] Sessione 10 — Test reale e rifinitura (segnata `[~]` il 2026-09-25 senza lavoro fatto, rimessa `[ ]` per fare prima la 9b)

### Note tra sessioni
_(ogni sessione aggiunge qui decisioni prese, deviazioni dal piano, problemi aperti)_

**Sessione 0 — integrazione requisiti (2026-09-25)**
- Aggiunti al piano: regole di lavoro (stop a fine sessione, checklist di chiusura, commit ≤ 3 righe con `Co-Authored-By`),
  tutto il tooling in Docker (Node incluso) + screenshot Playwright, SemVer da 0.1.0 con tag a ogni sessione, identità git.
- Hardware: estrusore di tipo non noto (tutto configurabile), LCD con buzzer ancora collegato (M300 on), webcam USB UVC.
- UI: sidebar 8 icone + status bar, default inglese/24h, accento da scegliere fra varianti in S3, soglie temperature
  250/90 (max 275/110), spegnimento HDMI opzionale, dialog per host prompt Marlin (M876).
- File: oltre a local, anche **SD stampante** e **chiavetta USB sul Pi** (import verso local).
- Installazione: utente OctoPrint rilevato dallo script; automount USB e wlr-randr aggiunti a install.sh.
- Ambiente verificato sul PC: Docker 29.4 + Compose v5.1 (engine Linux) funzionanti; la cartella **non è ancora un repo git**
  (git init in S1). `CLAUDE.md` verrà creato in S1 e deve rimandare alla procedura della sezione 0.
- Aggiunta la **sezione 0**: prompt unico per tutte le sessioni, scelta automatica della sessione da eseguire
  tramite lo Stato avanzamento (`[ ]` / `[~]` / `[x]`), stop intermedi e numerazione delle versioni.

**Sessione 1 — Fondamenta, repo e ambiente Docker (2026-09-25, v0.1.0)**
- Fatto: repo git locale (`main`, nessun remote), README/LICENSE/CHANGELOG/CLAUDE.md/.editorconfig/.gitignore,
  `.gitattributes` (LF ovunque), `docs/ARCHITECTURE.md`. Compose `dev/docker-compose.yml` (progetto
  `floppyoctotouch`): `octoprint-init` + `octoprint` 1.11.8, `agent` (hot reload), `frontend` (Vite), tool
  `agent-test`, `frontend-test`, `build`, `playwright`, `shellcheck`. Porte solo su 127.0.0.1.
- Verifica end-to-end OK: Virtual Printer `Operational` su `VIRTUAL`, profilo 220×220×240, temperature live
  via socket sia da Vite (5173) sia dalla build servita dall'agent (8765); screenshot in `dev/screenshots/`
  (uno copiato in `docs/images/home-v0.1.0.png` per il README). Test: agent 11 pytest + ruff, frontend 7 vitest
  + svelte-check + tsc. Bundle: 16.8 KB gzip.
- Versioni toolchain: Svelte 5.57, Vite 8.3, vite-plugin-svelte 7.3, vitest 5.0, **TypeScript 6.0**
  (la 7 non è ancora supportata da svelte-check), Node 24 nei container, Playwright 1.63.0 (progetto separato
  in `dev/e2e`, versione npm = tag immagine).
- **API key di sviluppo**: nessun passaggio manuale. `octoprint-init` registra il valore di `OCTOPRINT_API_KEY`
  (default `floppyoctotouch-dev-api-key-not-secret`) come application key dell'utente `admin` scrivendo
  `data/appkeys/keys.yaml`. Il README documenta anche la procedura manuale (Settings → Application Keys).
- Deviazioni / scoperte:
  - l'immagine `octoprint/octoprint` porta già un `config.yaml` nel volume → il seed viene **fuso** una sola
    volta (marker `.floppyoctotouch-seeded`); per cambiare il seed serve `down -v`.
  - OctoPrint 1.11 ha ancora la chiave globale `api.key` nel config (non usata da noi).
  - La Virtual Printer riporta `chamber` con valori `null` (la UI nasconde i riscaldatori senza lettura) e
    scalda quasi istantaneamente. Capability simulate impostate nel seed (EEPROM on, PROMPT_SUPPORT/AUTOLEVEL/
    Z_PROBE off, EXTENDED_M20 on): utili per i test M115 in S2.
  - `preview.html` è inclusa anche nella build (comoda per provare la release dal PC).
  - L'agent tratta `/local/settings` come documento opaco con default minimi (`schemaVersion: 1`,
    `language: en`, `clock24h: true`): **schema completo, default e migrazioni vanno fatti nel frontend in S2**.
  - i18n minimale già presente (`t()` + en/it + test chiavi allineate): in S2 va esteso/persistito, non rifatto.
- Problemi aperti / note per le prossime sessioni:
  - `octoprint_url` con path prefix (es. `http://host/octoprint`) non supportato dal proxy (non serve su OctoPi).
  - Il container Playwright è in UTC (orari negli screenshot in UTC); sul Pi vale il fuso del sistema.
  - Il servizio `frontend` esegue `npm install` a ogni avvio (pochi secondi se già aggiornato).
  - Riconnessione socket testata solo a livello unitario (backoff): verificarla con riavvio di OctoPrint in S2.
- Comandi utili: vedi `CLAUDE.md` (sezione Commands) e README.

**Modifica al piano (2026-09-25, dopo la Sessione 1)**
- Su richiesta dell'utente aggiunti gli **indicatori ad anello** (immagine di riferimento in stile "OctoPrint status
  screen"): requisito in sezione 1, componente RingGauge in S3, layout Home con anelli in S4, anelli CPU/RAM/disco
  e metriche agent in S8. Non era previsto prima. Adattarli al tema scuro e al colore d'accento scelto in S3.

**Sessione 2 — Data layer (2026-09-25, v0.2.0)**
- Fatto: client REST tipizzato (`lib/api/octoprint.ts`, `agent.ts`), socket con `reauthRequired` e throttle 2
  (≈1 Hz; OctoPrint accumula log e temperature, non si perde nulla), logica pura testata in `lib/core/`
  (M115, host action, buffer circolare temperature, albero file, fase stampante, rilevamento plugin, schema
  impostazioni, formattazione), store Svelte 5 in `lib/stores/` + `dataLayer.ts` che collega il socket agli store,
  pagina di debug temporanea `screens/Debug.svelte`. 53 test vitest, 11 pytest; bundle 27,4 KB gzip.
- Verificato contro la Virtual Printer (Playwright, anche sulla build servita dall'agent): dati live, M115 inviato
  dalla dashboard se il report manca, capability, plugin, file local + cartella + SD, prompt host mostrato e
  risposto (`M876 S0`), notifica, lingua persistita dopo reload, **riconnessione del socket dopo il riavvio di
  OctoPrint** (punto aperto da S1 chiuso), stampa → pausa → annullamento con eventi e job store coerenti.
- Decisioni:
  - `/api/files?recursive=true` restituisce local **e** sdcard in una sola chiamata (si separa per `origin`).
  - Plugin rilevati dalle chiavi `plugins` di `/api/settings` (niente permessi admin, `/plugin/pluginmanager/plugins`
    è più lento).
  - Prompt host letti dai log live (mai da `history`, per non riaprire prompt già risposti). Risposta tramite API
    del plugin bundled Action Command Prompt **solo se** il firmware ha riportato `Cap:PROMPT_SUPPORT` (altrimenti
    il plugin scarta la risposta in silenzio), altrimenti `M876 S<n>` via `/api/printer/command`. Il plugin forza
    l'invio di M876 anche mentre Marlin è in attesa dell'utente.
  - Capability: `detected` (M115) + override `auto/on/off` nelle impostazioni; M600, M701/M702 e MBL manuale
    solo manuali. M115 inviato una volta se il report non è noto; reset su `Disconnected`.
  - Schema impostazioni v2 (v1 = default dell'agent di S1): preset PLA/PETG/TPU, 4 macro di esempio, soglie
    250/90 e massimi 275/110, screensaver 5 min, spegnimento schermo off/30 min, beep `M300 S880 P400`,
    filamento prudente (tipo `unknown`, bowden 0, carico lento 100 mm a 150 mm/min, scarico 100 mm, spurgo 20 mm,
    flag `configured` per l'avviso al primo wizard). Nomi di preset/macro = dati utente, non passano da i18n.
  - Eventi applicativi `host:prompt`, `host:promptClosed`, `host:notification`, `host:action` sul bus `events`
    (utili in S4). Messaggi `plugin` conservati per plugin in `server.pluginMessages` (DisplayLayerProgress in S4).
- Deviazioni / scoperte:
  - Bug Svelte 5 (reattività): chiavi aggiunte a un proxy `$state` profondo non viste da `in` in un `$derived`
    già calcolato → `capabilities` usa `$state.raw` con sostituzione dell'oggetto (test di regressione aggiunto).
  - Bug della Virtual Printer: i file SD con nome già 8.3 spariscono da M20 → in `init.sh` si usa
    `virtualSd/sd-cube.gcode`; aggiunta anche la cartella `uploads/examples/`.
  - I 3 PNG finiti per errore sotto `dev/e2e/C:/...` nel commit di S1 venivano dalla riscrittura MSYS di
    `-e SCREENSHOT_DIR=/tmp`: rimossi (gotcha in CLAUDE.md).
  - L'agent rispondeva con la pagina SPA anche a `/local/<sconosciuto>`: ora 404 (test aggiunto).
  - `temperatures.ts` di S1 sostituito da `core/tempHistory.ts` + store.
- Problemi aperti / note per le prossime sessioni:
  - `/local/usb` non esiste ancora (S5): lo store USB resta `unavailable` e il browser logga un 404 a ogni avvio.
  - La pagina di debug (e `App.svelte`) va sostituita dalla shell in S3; `window.__fot` espone gli store solo in dev.
  - Il servizio webcam, PSU Control e azioni personalizzate non sono nello schema impostazioni: aggiungerli con
    una migrazione v3 quando servono (S4/S8).
  - `printer.currentZ` resta `null` con la Virtual Printer (non invia la Z durante il file di prova).
- Comandi utili (S2): `docker compose -f dev/docker-compose.yml run --rm octoprint-init` (riapplica campioni/SD senza
  `down -v`); smoke test sulla build dell'agent:
  `MSYS_NO_PATHCONV=1 docker compose -f dev/docker-compose.yml run --rm -e BASE_URL=http://agent:8765 -e SCREENSHOT_DIR=/tmp playwright`.

**Sessione 3 — Design system e shell (2026-09-25, v0.3.0)**
- Fatto: token CSS (`lib/ui/tokens.css`: superfici, colori di stato ok/heating/cooling/paused/error/idle, scala
  tipografica 13-64 px, spaziature, raggi, ombre, layer z-index), font Inter variabile (solo subset latin +
  latin-ext) e icone Lucide (`@lucide/svelte/icons/<nome>`, una per import) bundlati. Componenti in `lib/ui/`:
  Button, IconButton, Card, Toggle, Slider, Stepper (pressione prolungata = ripetizione), Select (modal, niente
  `<select>` nativo), Modal, ConfirmDialog, NumPad (limiti, preset che inviano subito), OnScreenKeyboard (QWERTY
  EN/IT con àèéìòù, simboli, layout G-code, shift/caps lock, backspace con ripetizione), TextInputSheet,
  InputField, RingGauge (SVG 270°, tacca target, toni, S/M/L, stato n.d., tappabile), InfoRow, Spinner, Toast,
  PromptDialog. Servizi `dialogs.confirm/number/text()` (promise, a pila) e `toast.show()`.
- Shell 1024×600 (`src/shell/`): sidebar 88 px con 8 pulsanti 72×64 con etichetta, status bar 48 px (pill stato
  + job %, temperature compatte colorate, indicatore connessione, orologio 24 h), contenuto 936×552; schermata
  corrente nello store `nav` e nell'hash (`#/files`). Overlay "Connessione a OctoPrint…" (sopra tutto, dopo
  800 ms, con motivo: agent giù, API key mancante/rifiutata, OctoPrint giù) e "Stampante disconnessa/errore"
  (solo sulle schermate che richiedono la stampante; porta/baud da `/api/connection`, preferenze preselezionate,
  Connetti). PromptDialog collegato al prompt store; notifiche host come toast.
- Home prima versione (anelli hotend/piatto/ventola/job, layer solo con DisplayLayerProgress; tap sul riscaldatore
  → NumPad con preset → conferma sopra 250/90 → target; card lavoro con barra, tempi, pausa/riprendi/stop con
  conferma; righe di stato), schermata Sistema provvisoria (lingua, accento, versioni), placeholder per le altre.
- Kiosk `?kiosk=1`: cursore nascosto, niente menu contestuale, drag, selezione, zoom (pinch/ctrl+rotella/tasti).
- Pagine solo dev `/ui-gallery` e `/debug` (la pagina di debug di S2 spostata in `screens/dev/`), escluse dalla
  build. Smoke test riscritto: data layer su `/debug`, tutte le schermate, NumPad → conferma, prompt host con
  risposta M876, toast notifica, overlay stampante con riconnessione, kiosk, gallery e tastiera; gira anche sulla
  build servita dall'agent (senza le parti che usano `window.__fot`). 66 test vitest; bundle JS 50,2 KB gzip
  (+ CSS 5,2 KB, font 133 KB non compressi).
- Decisioni:
  - **Accento: teal** (scelta dell'utente); ambra e indaco restano come opzione: campo `accent` nelle impostazioni
    (aggiunto senza bump di schema, arriva dal merge dei default), selettore provvisorio nella schermata Sistema,
    UI definitiva in S8. Con ambra il colore "heating" si sposta verso il rosso; resta vicino al giallo della pausa.
  - Le varianti `[data-accent]` funzionano su qualsiasi elemento (usato per i campioni colore).
  - Feedback al tocco con l'attachment `pressable` (`data-pressed`), perché `:active` su touch in Chromium arriva
    in ritardo; negli stili serve `:global([data-pressed])`.
  - I preset del NumPad inviano subito il valore (un tocco solo); la conferma sopra soglia è del chiamante
    (`screens/heaterTarget.ts`, riusabile in S6).
  - Placeholder e Sistema provvisorio leggono la schermata da `nav`; le schermate non ricevono props.
- Deviazioni / scoperte:
  - L'agent in dev riportava ancora 0.1.0: la versione è nei metadati dell'immagine → dopo un bump serve
    `docker compose -f dev/docker-compose.yml build agent` (gotcha in CLAUDE.md).
  - Screenshot a volte in errore `EINVAL` sul bind mount Windows se il PNG è aperto nell'IDE: basta rilanciare.
  - Il PromptDialog è già collegato alla shell (previsto in S4): S4 deve solo verificarlo nei flussi M600/runout.
  - Il `printTime` della Virtual Printer resta 0:00 nei primi secondi di stampa (dato di OctoPrint, non della UI).
- Problemi aperti / note per le prossime sessioni:
  - Ventola: nessun dato dal socket; in S4 tracciare l'ultimo M106/M107 inviato o letto dal log.
  - La card lavoro della Home ha spazio libero sotto i tempi: in S4 ospiterà feedrate/flow/ventola e thumbnail.
  - Rete/Wi-Fi nella status bar non ancora mostrati (dati da `/local/system` in S8).
  - Stato "stampante disconnessa" non blocca Files/Terminale/Sistema (`needsPrinter` in `shell/screens.ts`).
- Comandi utili: screenshot degli accenti
  `docker compose -f dev/docker-compose.yml run --rm playwright sh -c "npm install && node accents.mjs"`;
  anteprima di un accento: `http://localhost:5173/?accent=amber`.

**Sessione 4 — Home, controllo stampa, screensaver, notifiche (2026-09-25, v0.4.0)**
- Fatto: Home completa in due viste (`screens/home/`). **In stampa**: anelli hotend/piatto/ventola/job (+ layer
  solo con DisplayLayerProgress), anteprima miniatura o webcam (pulsante nell'angolo per cambiare, tap = vista
  grande), barra, trascorso/rimanente/ETA, pulsanti Velocità (M220) e Flusso (M221) che aprono uno slider,
  anello ventola → slider (M106 S0-255 / M107), pausa e stop con conferma, riprendi. **A riposo**: anelli
  hotend/piatto/ventola + righe di stato nella stessa card, file selezionato + recenti (max 3, "Stampa" con
  conferma "piatto libero"), preset di preriscaldo (conferma sopra soglia), Raffredda, Home assi.
- Screensaver (vista grande: % gigante in stampa, altrimenti orologio + data + temperature) dopo
  `screensaver.timeoutMin`; spegnimento HDMI opzionale solo senza job (`PUT /local/display`, `wlr-randr` sul Pi,
  no-op che logga in dev); i dialog aperti vengono annullati. Il tocco di risveglio viene "mangiato" in capture
  su `window` (pointerdown + sequenza + 400 ms): verificato nello smoke test toccando un preset sotto lo screensaver.
- Notifiche: popup grande per PrintDone e PrintFailed (`reason: error`) con beep `M300` (default on); pausa e
  annullamento mostrati solo se non richiesti da questo schermo negli ultimi 60 s (M600, runout, altro client).
  Con un popup o un host prompt aperti lo screensaver non parte.
- Agent: proxy `GET /webcam/*` → `webcam_url` (default `http://127.0.0.1:8080`, prefisso tolto come l'haproxy
  di OctoPi), endpoint `/local/display`; config `webcam_url`, `display_backend` (`wlr-randr`|`none`),
  `display_output` (default `HDMI-A-1`). 19 pytest (8 nuovi).
- Dev: servizio `webcam` (MJPEG `testsrc` di ffmpeg dall'immagine OctoPrint, `dev/fake-webcam/server.py`). Lo
  smoke test carica un G-code breve con `G4`, lo stampa dalla Home e verifica slider, pausa/ripresa senza popup,
  webcam, popup di fine stampa + M300, screensaver, risveglio, schermo spento; gira anche sulla build dell'agent.
  83 test vitest; bundle JS 60,6 KB gzip (+ CSS 6,6 KB).
- Decisioni:
  - **Ventola/velocità/flusso** letti dal log del terminale (`Send: … M106/M107/M220/M221`, anche le righe del
    file e di altri client) e dai report Marlin `FR:`/`Flow:`; velocità e flusso partono da 100 % alla
    connessione, la ventola resta "—" finché non si vede un comando (niente dati inventati). Nessuna query
    M220/M221 inviata di proposito.
  - **API webcam 1.11 verificata**: `/api/settings` → `webcam.webcams[0].compat.stream` (default OctoPrint e OctoPi:
    `/webcam/?action=stream`, relativo → passa dall'agent), `flipH/flipV/rotate90`, `streamRatio`. Un URL manuale
    nelle impostazioni (`webcam.url`, schema v3) vince; UI per impostarlo in S8.
  - **DisplayLayerProgress verificato sul sorgente**: layer da messaggio plugin `DisplayLayerProgress-websocket-payload`
    (`currentLayer`/`totalLayer`, stringhe, "-" se ignoti) e una volta da `GET /plugin/DisplayLayerProgress/values`.
    Non testato dal vivo (plugin non installato nel container).
  - Payload eventi verificati nel sorgente di OctoPrint (`printer/standard.py`): `name, path, origin, size`, `time`
    per Done/Failed, `reason` "error"/"cancelled" per Failed; l'utente dell'azione non basta a distinguere lo schermo
    locale (stessa API key) → timestamp delle azioni locali (`job.local`).
  - Conferma su **pausa** e stop, non su riprendi. "Stampa di nuovo" = il file selezionato resta in cima ai recenti.
  - Schema impostazioni **v3**: `webcam.url`, `home.preview` (`thumbnail`|`webcam`, persistente).
  - Nuovo `dialogs.slider()` (Stepper + Slider + preset che applicano subito).
- Deviazioni / scoperte:
  - Le **miniature** in Home arrivano solo dal plugin Slicer Thumbnails (`thumbnail` del file): l'estrazione
    dell'agent (`/local/thumbnail`, PNG/JPG/QOI) resta in S5 come da piano → in dev la Home mostra l'icona segnaposto.
    `core/files.ts` → `thumbnailUrl()` è il punto dove aggiungere il fallback.
  - Le impostazioni dev avevano l'accento rimasto su indigo (script degli accenti di S3): riportato a teal.
  - `init.sh`/seed non modificati: il default di OctoPrint ha già lo stream `/webcam/?action=stream`.
- Problemi aperti / note per le prossime sessioni:
  - S5: implementare `/local/thumbnail` e usarlo in `thumbnailUrl()` (Home, recenti e browser file).
  - S8: UI per `webcam.url`, timeout screensaver/spegnimento, beep; la schermata Sistema provvisoria resta.
  - S10: verificare `wlr-randr` (nome output, `WAYLAND_DISPLAY` nell'unità dell'agent) e che il tocco arrivi a
    Chromium con HDMI spento (altrimenti fallback evdev nell'agent, vedi sezione 2).
  - Dopo una riconnessione della stampante la ventola torna "—" (reset voluto: il firmware può essersi riavviato).
- Comandi utili: `docker compose -f dev/docker-compose.yml stop webcam` (fallback "webcam non raggiungibile");
  `window.__fot.idle.sleep()` / `sleep('off')` in console per vedere screensaver / schermo spento;
  `window.__fot.notices.handleEvent('PrintDone', {name: 'x.gcode', time: 60})` per provare il popup.

**Modifica al piano (2026-09-25, dopo la Sessione 4)**
- Richiesta dell'utente: nello screensaver in stampa poter mostrare la **miniatura del file**, come opzione
  (default off: la vista `saver-printing` attuale gli piace così). Aggiunta al requisito "Screensaver"
  (sezione 1), implementazione in **S5** (serve `/local/thumbnail`, che arriva lì), interruttore definitivo in **S8**.
- L'utente ha fornito `3dbenchy.gcode` (PrusaSlicer 2.9.6, profilo "Tatara A8"), spostato in
  `dev/sample-gcode/3dbenchy_prusaslicer.gcode`: viene caricato in OctoPrint da `octoprint-init` come gli altri.
  Non contiene miniature (`; thumbnails =` vuoto): in PrusaSlicer vanno abilitate in Impostazioni stampante →
  Generale → Firmware → "Miniature G-code" (es. `16x16/PNG, 220x124/PNG`).

**Sessione 5 — File (2026-09-25, v0.5.0)**
- Sessione interrotta una volta (crediti) e ripresa nello stesso giorno: il lavoro era tutto nel working tree.
- Fatto (agent): `thumbnails.py` (scanner dell'header G-code PNG/JPG/QOI, si ferma al primo comando; QOI→PNG
  solo stdlib; cache su disco `data_dir/thumbnails` con `.none` per i file senza miniatura, 1000 voci, una
  estrazione alla volta), `usb.py` (`UsbManager` su `usb_roots` glob, default `/media/usb*`, anti
  path-traversal/symlink, comando di espulsione, upload multipart con Content-Length; `EventHub` + `UsbWatcher`
  polling 2 s), `files.py` (`GET /local/thumbnail`, `/local/usb`, `/local/usb/thumbnail`, `POST /local/usb/import`
  con avanzamento NDJSON annullabile, `POST /local/usb/eject`, `GET /local/events` SSE). Config nuova:
  `uploads_dir`, `usb_eject_command`, `usb_max_file_mb` (+ env `FOT_*`). 56 pytest.
- Fatto (frontend): schermata File con tab Local / SD / USB, cartelle con breadcrumb, ordinamento nome/data/
  dimensione e vista griglia/elenco persistenti (settings **v4**), ricerca in tutte le cartelle con la tastiera
  a schermo (senza accenti/maiuscole), dettaglio (miniatura grande, tempo, filamento, dimensioni, ultima stampa;
  Stampa/Seleziona/Elimina con conferma), comandi SD (init/lettura/rilascio, disabilitati in stampa), import da
  USB con scelta della cartella, conferma di sovrascrittura, dialog di avanzamento e apertura della copia locale,
  espulsione, toast di inserimento/rimozione chiavetta. `thumbnailUrl()` usa il fallback dell'agent, `Thumb.svelte`
  mostra l'icona su 404: miniature in Home, recenti, File e screensaver (opzione `screensaver.showThumbnail`,
  interruttore provvisorio in Sistema). 92 vitest; bundle JS 71,1 KB gzip (+ CSS 7,6 KB).
- Smoke test: nuova `filesScreen()` (cartelle, ordinamenti, elenco, ricerca con tastiera fisica + Enter, dettaglio
  del benchy, eliminazione, SD, USB: file scritto in `/fake-usb`, miniatura, destinazione `examples`, import,
  dialog di avanzamento simulato, espulsione, reinserimento via SSE) e screensaver in stampa con/senza miniatura.
  Verde sia su Vite sia sulla build servita dall'agent. Screenshot controllati; `docs/images/files-v0.5.0.png`.
- Decisioni:
  - Estrazione miniature leggendo direttamente gli upload di OctoPrint (sul Pi stesso utente/permessi); se la
    cartella non è leggibile, fallback sul download HTTP via OctoPrint. Vince l'immagine più grande valida.
  - Aggiornamenti USB con **SSE** dall'agent (niente WebSocket locale né polling dal browser); il polling dei
    mount resta nell'agent (2 s, costo trascurabile) finché S9 non sceglie udev/systemd-mount.
  - L'import passa sempre da `/api/files/local` (OctoPrint analizza il file); niente upload verso SD in v1.
  - In dev l'espulsione (`FOT_USB_EJECT_COMMAND=none`) nasconde la chiavetta finché cambia l'mtime della cartella.
  - `MetadataAnalysisFinished` aggiorna l'elenco (tempo/filamento compaiono appena finisce l'analisi).
- Deviazioni / scoperte:
  - Il benchy riesportato dall'utente ha una miniatura PNG 300×300: il test pytest ora ne verifica l'estrazione e
    che la scansione si fermi al primo comando; il caso "nessuna miniatura" usa un G-code generato nel test.
    La copia in OctoPrint è stata sostituita con DELETE + upload via API (analisi immediata: 45:04, 3,84 m).
  - Stima reale del benchy ~45 min (non ~1 h come indicato prima).
  - Errore di processo nella prima parte della sessione: Python dell'host usato per un'edit di testo e per leggere
    JSON. Non rifarlo (solo Docker).
- Problemi aperti / note per le prossime sessioni:
  - S9: meccanismo di mount delle chiavette (udev + `systemd-mount` in sola lettura sotto `/media/usb*`) e permessi
    per `systemd-mount --umount` dall'utente dell'agent (polkit/sudoers).
  - S8: interruttore definitivo `screensaver.showThumbnail` (oggi nella schermata Sistema provvisoria).
  - Nel log del browser, durante il test di disconnessione/riconnessione, a volte compare un 409 su
    `POST /api/printer/command`: è l'M115 di `capabilities.requestIfUnknown()` (S2) inviato quando OctoPrint non è
    ancora operativo; innocuo (viene ritentato), da rendere più robusto quando si tocca quel codice.
  - In dev `dev/fake-usb/` contiene file di prova locali ignorati da git (`Logo è prova.gcode`, `parts/…`).
- Comandi utili: nuova miniatura/analisi di un campione in OctoPrint:
  `curl -X DELETE http://127.0.0.1:8765/api/files/local/<file>` poi
  `curl -F file=@dev/sample-gcode/<file> http://127.0.0.1:8765/api/files/local`;
  `curl "http://127.0.0.1:8765/local/thumbnail?path=<file>" -o x.png` per provare l'estrazione.

**Sessione 6 — Temperature, Movimento, Filamento (2026-09-25, v0.6.0)**
- Fatto (Temperature): card per hotend e piatto (anello, Imposta → NumPad con preset e conferma sopra soglia,
  Spegni), "Spegni tutti i riscaldatori" (con conferma se c'è un lavoro), grafico **uPlot** attuale + target
  tratteggiato con finestra 5/15/30 min persistente, riga dei preset (preriscaldo disabilitato in stampa).
  Gestione preset in un modal: aggiungi/modifica (nome con tastiera a schermo, hotend, piatto, ventola opzionale),
  sposta su/giù, elimina (conferma), ripristina predefiniti (conferma); nome unico ≤ 24 caratteri, temperature
  entro i massimi.
- Fatto (Movimento): pad X/Y/Z 104 px con passo 0.1/1/10/50 persistente, home XY/Z/tutti, spegni motori (M84,
  posizione diventa sconosciuta), posizione da M114 (evento `PositionUpdate`), ventola, velocità jog X/Y e Z
  (impostazioni). Inversione assi e volume dal profilo OctoPrint: con posizione nota lo spostamento viene
  accorciato per restare nel volume e rifiutato al bordo (toast). Bloccato durante un lavoro.
- Fatto (Filamento): wizard materiale → riscaldo con attesa → inserimento → carico → spurgo ("spurga ancora" /
  "è pulito") → fatto, oppure scarico; M701/M702 se la capability è attiva, altrimenti sequenze G-code dalle
  impostazioni (bowden veloce, carico lento, scarico + bowden, spurgo; mosse ≤ 100 mm per il limite
  EXTRUDE_MAXLENGTH di Marlin); "Cambio (M600)" con la capability advanced pause, offerto anche durante la stampa.
  Pannello manuale estrudi/ritrai (lunghezza 5/10/50/100, velocità 60/150/300 mm/min) disabilitato sotto la
  temperatura minima (170 °C, impostabile). Dialog "Configura estrusore" (tipo, bowden, lunghezze, velocità,
  temperatura minima): finché non viene salvato il wizard mostra l'avviso e al primo avvio chiede se configurare
  o usare i predefiniti prudenti (una volta per sessione). Bloccato durante un lavoro.
- Impostazioni **v5**: `temperature.chartMinutes`, `move.step/xyFeedrate/zFeedrate` (10 mm, 3000, 300 mm/min),
  `filament.minTemp` (170). Nuovo componente `Segmented`. 108 vitest (15 nuovi: preset, jog, filamento, v5);
  bundle JS 109 KB gzip (uPlot ≈ 22 KB), CSS 9,5 KB. Smoke test esteso (NumPad, CRUD preset, limiti jog,
  configurazione estrusore, wizard carico/scarico, estrusione manuale, blocchi in stampa), verde su Vite e sulla
  build dell'agent. Screenshot controllati anche in italiano; `docs/images/temperature-v0.6.0.png`.
- Decisioni:
  - **Fine delle mosse**: dopo ogni sequenza del wizard `M400` + `M114`; l'evento `PositionUpdate` di OctoPrint
    (verificato nel sorgente 1.11: `on_comm_position_update`) segna la fine. Timeout: durata nominale + 30 s,
    5 min per M701/M702, nessuno per M600 (pulsante "Cambio terminato"). La barra di avanzamento è
    un'animazione CSS sulla durata nominale.
  - Estrusione con G-code propri (`M83`, `G1 E… F…`, `M82`) invece di `POST /api/printer/tool extrude`: OctoPrint
    limita la velocità a quella E del profilo (300 mm/min nel profilo di default), troppo bassa per il bowden.
  - Filamento e Movimento bloccati anche in **pausa**: `M83/M82` e i jog cambierebbero lo stato del file in
    stampa (es. estrusione relativa di PrusaSlicer). Per il cambio a metà stampa c'è M600 (firmware + prompt).
  - Posizione: aggiornamento **ottimistico** prima dell'invio del jog, una richiesta `M400` + `M114` 600 ms dopo
    l'ultimo jog, risposte più vecchie dell'ultimo jog scartate (`reportPosition()`).
  - Riscaldatori: le temperature si possono cambiare anche in stampa (come dalla Home), ma spegnere chiede conferma.
  - Colori del grafico dai token di stato (hotend = heating, piatto = cooling), non dall'accento.
- Deviazioni / scoperte:
  - **Virtual Printer**: applica subito `G90`/`G91` ma mette in coda i movimenti, quindi un jog inviato mentre il
    precedente è in corso può diventare assoluto; risponde anche a `M114` prima della fine delle mosse (da qui
    `M400`). Marlin reale è sequenziale. Nello smoke test i jog da 50 mm sono distanziati di 1,3 s (gotcha in
    CLAUDE.md). La Virtual Printer esegue le mosse E quasi istantaneamente.
  - Collisioni di nomi: `Wizard.svelte` vs `wizard.svelte.ts` (file system case-insensitive) → `flow.svelte.ts`;
    uno snippet `actions` di Card nasconde una variabile `actions` dello script.
  - Errore di processo: due comandi Bash inutili (un heredoc `python3` vuoto e un `node -e "1"`) lanciati per
    sbaglio sull'host; non hanno eseguito nulla ma non vanno rifatti.
- Problemi aperti / note per le prossime sessioni:
  - S8: UI definitiva per `filament.*` (oggi nel dialog "Configura estrusore" della schermata Filamento, riusabile),
    soglie/massimi temperature e velocità jog (oggi nei campi della schermata Movimento).
  - S7 (livellamento): riusare `printer.position`, `planJog()` e `printer.requestPosition()`; per Z sotto 0
    (offset) `planJog` oggi limita Z a ≥ 0 quando la posizione è nota.
  - S10: verificare sul Marlin reale M114 durante i jog, EXTRUDE_MAXLENGTH, velocità di carico/scarico con
    l'estrusore vero e se il firmware ha M701/M702/M600 abilitati.
  - Il bundle è cresciuto a 109 KB gzip: se servisse, uPlot può essere caricato a richiesta (import dinamico).
- Comandi utili: `window.__fot.printer.position` / `window.__fot.printer.requestPosition()` in console;
  la finestra del grafico si prova con `http://localhost:5173/#/temperature`.

**Sessione 7 — Terminale, Macro, Livellamento/Mesh (2026-09-25, v0.7.0)**
- Fatto (Terminale): schermata con tab Console / Macro. Console: log live (righe inviate in accento, errori in
  rosso, avvisi `Unknown command` in giallo, messaggi di OctoPrint attenuati), ultime 300 righe filtrate nel DOM,
  auto-scroll che si ferma se si scorre in su (pulsante "Ultime"), pausa con contatore delle righe nuove, svuota.
  Filtri in un dialog con interruttori (temperature/M105, `ok` semplici, busy/wait, stato SD/M27, posizione
  M400/M114 della dashboard), persistenti. Input: campo comando + `OnScreenKeyboard` G-code **incorporata** sotto il
  log (non il foglio a schermo intero, così il log resta visibile), Invio = invia, storico comandi della sessione
  (lista, tocco = rimette il comando nel campo), 5 comandi rapidi di sola lettura (M114, M105, M119, M503, M115).
- Fatto (Macro): griglia di pulsanti grandi (icona, colore, anteprima dei comandi, simbolo se chiede conferma);
  conferma se la macro la richiede e **sempre durante un lavoro**; commenti `;` e righe vuote non inviati. Gestione
  come i preset: aggiungi/modifica (nome e G-code multilinea con le tastiere, 12 icone, 6 colori, conferma),
  sposta, elimina (conferma), ripristina predefiniti (conferma); nome unico ≤ 24, 1-50 comandi.
- Fatto (Livellamento): tab Test carta / Mesh / Offset Z. **Test carta**: disegno del piatto con 5 punti (4 angoli a
  `leveling.inset` mm dai bordi + centro, dal profilo stampante), ogni punto = alza a `leveling.zHop`, sposta, Z0,
  poi M400+M114; "Punto successivo" in ordine, "Alza l'ugello"; richiede l'home (tracciato da ogni `G28`/`M84`
  inviato, da chiunque). **Mesh**: "Leggi" = `M420 V`, parser dei report Marlin bilinear e MBL → heatmap vista dal
  davanti (fila posteriore in alto), scala divergente attorno alla media (blu più basso, arancio più alto, minimo
  ±0,05 mm), valori in ogni cella, estremi evidenziati, min/max/escursione; `G28`+`G29`+`M420 V` con `autolevel`;
  mesh manuale guidata con `manualMesh` (`G29 S1`, Z più vicino/lontano con passi 0,025-0,5, `G29 S2`, fine su
  "Mesh probing done." → rilettura; annulla = G28); salva `M500` con `eeprom`. **Offset Z**: babystep `M290` 0,01/0,05
  con totale (anche in stampa, capability `babystepping`), offset sonda `M851` (letto all'apertura, impostato col
  NumPad, con `zProbe`), `M500`. Bloccato durante un lavoro tranne il babystep.
- Impostazioni **v6**: `terminal.filters` (default: nascosti temperature, busy, SD; visibili `ok` e posizione),
  `leveling.inset/zHop/babystep/meshStep` (30 mm, 5 mm, 0,05, 0,05); icone/colori delle macro validati.
  `defaultMacros()` estratto; operazioni generiche sulle liste in `core/lists.ts` (usate da preset e macro).
  127 vitest (19 nuovi: parser mesh con output Marlin bilinear, con suddivisione, MBL spezzato in più messaggi e
  punto non misurato; filtri terminale; macro; punti del test carta; migrazione v6); bundle JS 126,7 KB gzip.
- Smoke test esteso (terminale, macro, livellamento, blocco in stampa), verde su Vite e sulla build dell'agent;
  nuovo `ONLY=terminal,leveling` per eseguire solo alcuni passi. Screenshot controllati anche in italiano;
  `docs/images/leveling-v0.7.0.png`.
- Decisioni:
  - Macro dentro la schermata Terminale (tab), come da sezione 1 ("Terminale + Macro"): le 8 icone restano quelle.
  - G29 automatico solo con `autolevel` (`Cap:AUTOLEVEL`: ABL/UBL con sonda); lettura mesh anche con
    `levelingData`/`manualMesh`; babystep solo con `Cap:BABYSTEPPING` (disabilitato con spiegazione se manca).
  - Colori della heatmap relativi alla media (conta la planarità), valori grezzi nelle celle.
  - Home "fatto" rilevato dal log `Send: G28` (per asse) invece di uno stato interno: vale anche per macro, file G-code
    e altri client; `M84`/`M18` e la disconnessione lo azzerano.
  - Offset sonda riletto a ogni apertura del pannello: un valore dal `history` può essere vecchio.
- Deviazioni / scoperte:
  - **Capability incomplete dopo un reload**: il `history` del log può contenere solo la coda del report M115, che
    risultava "noto" ma senza `EEPROM` ecc. Ora `known` richiede la riga `FIRMWARE_NAME` (altrimenti M115 viene
    richiesto di nuovo).
  - `InputField` multilinea mostrava parte della 4ª riga nel padding (overflow tagliato al bordo del padding): ora
    margine.
  - Virtual Printer: nessun G29/M290/mesh, `M851` ignora i valori negativi (regex senza segno); `!!DEBUG:send`
    permette di simulare le risposte del firmware (usato per i report mesh e "Mesh probing done.").
  - Il test Move (S6) era instabile sulla build dell'agent (X 200 invece di 220): pausa fra i jog da 50 mm portata a
    1,8 s.
  - `Placeholder.svelte` rimosso (tutte le voci della sidebar hanno la loro schermata).
  - Errore di processo: un `python3 --version` e un paio di edit con `perl` lanciati sull'host (nessun effetto sul
    progetto); da non ripetere, usare Edit o Docker.
- Problemi aperti / note per le prossime sessioni:
  - S8: UI definitiva per le capability override (oggi solo via impostazioni salvate: il suggerimento "attiva mesh
    manuale nelle impostazioni" della schermata Mesh rimanda lì), per `terminal.filters` e `leveling.*` (oggi nelle
    rispettive schermate).
  - S10: verificare sul Marlin reale il formato di `M420 V`/`G29 S0` (in particolare i punti non misurati), la
    risposta di `M851`, `M290` con BABYSTEPPING, e se il firmware Tatara ha MESH_BED_LEVELING (→ `manualMesh` on).
  - Storico comandi del terminale solo per sessione (non persistito).
  - UBL (`G29` con Unified Bed Leveling) non gestito: il suo `M420 V` ha un altro formato.
- Comandi utili: `docker compose -f dev/docker-compose.yml run --rm -e ONLY=leveling playwright`; simulare un report
  mesh: `curl -H 'Content-Type: application/json' -d '{"commands":["!!DEBUG:send Bilinear Leveling Grid:","!!DEBUG:send 0 1","!!DEBUG:send 0 +0.100 -0.050","!!DEBUG:send 1 +0.020 +0.000","!!DEBUG:send ok"]}' http://127.0.0.1:8765/api/printer/command`
  (la heatmap compare in Livellamento → Mesh anche senza capability).

**Sessione 8 — Sistema e Impostazioni (2026-09-25, v0.8.0)**
- Fatto (agent): `system.py` (`SystemInfo`: CPU % dal delta di `/proc/stat` fra due richieste o due campioni a
  250 ms, temperatura SoC da `/sys/class/thermal`, frequenza da `cpufreq`, load, RAM da `MemAvailable`, disco con
  `statvfs` come `df`, interfacce da `/sys/class/net` con IPv4 via `SIOCGIFADDR`, rotta di default e gateway da
  `/proc/net/route`, Wi-Fi da `nmcli -t -f ACTIVE,SSID,SIGNAL,DEVICE device wifi list --rescan no` con cache 10 s,
  altrimenti qualità da `/proc/net/wireless`; niente dipendenze), `control.py` (`GET /local/system`,
  `GET/PUT /local/apikey` con verifica su `/api/version`, salvataggio in `config.json` a 600 e uso immediato,
  `POST /local/kiosk/restart`), `commands.py` (un solo `run_command()` per wlr-randr, espulsione, kiosk, nmcli).
  Config nuova: `kiosk_restart_command` (default `sudo -n systemctl restart floppyoctotouch-kiosk.service`),
  `disk_path`, `config_path`/`env_overrides` (non letti dal file). Il proxy legge la API key a ogni richiesta.
  69 pytest (13 nuovi, con `/proc` e `/sys` finti di un Pi in Wi-Fi).
- Fatto (frontend): schermata Sistema con tab **Panoramica / Impostazioni / Informazioni**. Panoramica: anelli CPU
  (tono = calore se peggiore del carico, sottotitolo temperatura · MHz), RAM, disco; rete (tipo, SSID e segnale, IP,
  gateway, host, acceso da, interfaccia), aggiornati ogni 3 s solo con la schermata aperta; comandi di sistema di
  OctoPrint (riavvio OctoPrint, riavvio/spegnimento Pi con conferme localizzate, pericolo se c'è una stampa;
  comandi custom con il loro testo di conferma), "Riavvia lo schermo"; card Alimentazione e luci (PSU Control +
  azioni personalizzate + comandi custom di OctoPrint). Impostazioni in 7 sezioni (generale, schermo,
  temperature, movimento, firmware con override auto/sì/no per ogni capability, alimentazione e luci,
  connessione con API key e URL webcam), salvataggio automatico, ripristino totale con conferma. Informazioni:
  versioni, firmware, host, repo (placeholder `github.com/FloppyO1/FloppyOctoTouch`), licenza, componenti inclusi.
  Status bar: icona rete (barre Wi-Fi / Ethernet / nessuna rete) + IP, fino a 3 azioni rapide e il pulsante PSU.
  Overlay di connessione: pulsante "Inserisci l'API key" con key assente o rifiutata. Settings **v7**
  (`customActions`, `psu.statusBar`). 138 vitest (11 nuovi); bundle JS 145,3 KB gzip (+ CSS 12,3 KB).
- Smoke test: nuovo passo `system` (metriche, reboot confermato e intercettato, comando custom reale, riavvio
  schermo = reload, CRUD azioni con status bar, errore JSON del plugin, 7 sezioni, timeout salvaschermo, override
  capability, API key sbagliata rifiutata e giusta salvata con riconnessione, reset, About, italiano, PSU Control
  simulato con `page.route`, overlay con API key). Verde su Vite e sulla build dell'agent.
  `docs/images/system-v0.8.0.png`.
- Decisioni:
  - **API key**: la sostituisce l'agent (verifica su OctoPrint prima di salvare, la key non torna mai al browser,
    solo le ultime 4 cifre); poi la pagina si ricarica per rifare login passivo e socket. Se la key arriva da
    `FOT_API_KEY` (Docker) viene usata subito ma all'avvio vince di nuovo l'ambiente: l'UI lo dice.
  - Riavvio kiosk via `sudo -n systemctl restart floppyoctotouch-kiosk.service`: **S9 deve aggiungere la regola
    sudoers** (solo quel comando, senza password) e il nome esatto della unit; senza comando la pagina si ricarica.
  - Riavvio/spegnimento non bloccati durante la stampa (serve per recuperare un sistema bloccato) ma con conferma
    rossa che avvisa della stampa persa; pulsanti neutri con icona rossa (il pericolo lo porta la conferma).
  - Pulsanti rapidi nella status bar 56 × 48 px (altezza della barra), sotto i 56 px in verticale: accettato perché
    la barra è alta 48 px; massimo 3 azioni.
  - PSU spento sempre con conferma, acceso senza. Stato da messaggio socket `psucontrol` (`isPSUOn`) +
    `GET /api/plugin/psucontrol` alla connessione (verificato sul sorgente del plugin; non installato in dev).
  - Filtri del terminale e passo babystep restano nelle loro schermate (sono contestuali); velocità jog, paper test
    ed estrusore (stesso dialog della schermata Filamento) anche nelle Impostazioni.
  - `restart_safe` (OctoPrint in safe mode) non mostrato nella panoramica: strumento di diagnosi, resta via
    OctoPrint.
- Deviazioni / scoperte:
  - Il dev server Vite legge `package.json` solo all'avvio: About mostrava ancora 0.5.0 → dopo un bump riavviare il
    servizio `frontend` (gotcha in CLAUDE.md).
  - Escape chiude tutti i modal impilati (anche il gestore sotto l'editor): nei test si usa Annulla.
  - Nel container agent non ci sono `nmcli`, `ip`, `cpufreq` né sensori termici: temperatura e frequenza CPU si
    vedono solo sul Pi. Seed OctoPrint con comandi reboot/shutdown innocui (`echo`) e un comando custom "Toggle
    lights (dev)", applicati anche al volume esistente via `/api/settings`.
  - `MacroEditor` usa ora il componente condiviso `LookPicker` (icona e colore) con le azioni.
  - Errore di processo: un comando Bash con un `cat > /dev/null` di troppo (rimasto in attesa, fermato) e un
    `python3 --version` sull'host, mai partito; da non ripetere.
- Problemi aperti / note per le prossime sessioni:
  - S9: regola sudoers per il riavvio kiosk; unità dell'agent con `WAYLAND_DISPLAY` (wlr-randr) e accesso a
    `nmcli` (su Bookworm l'utente normale può leggere lo stato senza polkit); `config.json` creato da `install.sh`
    con `api_key` (l'agent lo riscrive a 600 quando si cambia la key dallo schermo).
  - S10: verificare su Pi SSID/segnale da `nmcli`, temperatura/frequenza CPU, spegnimento e riavvio dal menu
    (OctoPi ha già `sudo shutdown`/`reboot` configurati in OctoPrint), PSU Control se l'utente lo installa.
- Comandi utili: `curl http://127.0.0.1:8765/local/system`, `curl http://127.0.0.1:8765/local/apikey`;
  `docker compose -f dev/docker-compose.yml run --rm -e ONLY=system playwright`.

**Sessione 9 — Installazione sul Raspberry (2026-09-25, v0.9.0)**
- Sessione interrotta una volta (crediti) dopo aver scritto tutti gli script (due commit WIP: `80ef7a6`, `f31e310`),
  ripresa lo stesso giorno per test, correzioni e chiusura.
- Fatto: `deploy/install.sh` idempotente + `deploy/lib/common.sh` (prompt da `/dev/tty`, stato in
  `/etc/floppyoctotouch/install.conf`), `deploy/update.sh` (checksum, confronto versioni, `--force`, rilancia
  `install.sh --update`), `deploy/uninstall.sh` (`--purge`, `--keep-display-config`), unit systemd agent + kiosk
  (`cage -s` su tty1 con sessione PAM/logind `floppyoctotouch-kiosk`, `Restart=always`, `Conflicts=getty@tty1`),
  `deploy/kiosk/kiosk.sh` + `kiosk.env`, regola udev + `deploy/usb/usb-mount.sh` (`systemd-mount --no-block` in sola
  lettura su `/media/usb-<etichetta>`), regola sudoers (solo espulsione e riavvio kiosk), blocco display in
  `config.txt` + `video=HDMI-A-1:1024x600@60` in `cmdline.txt` con backup; `scripts/build-release.sh` (servizio
  `release`), servizio `deploy-test`. Flag: `--non-interactive --api-key= --user= --octoprint-url=
  --skip-display-config --listen-lan` (+ `--update` interno).
- Test: `deploy-test` in `debian:bookworm` senza systemd PID 1 → **77 controlli verdi** (installazione, config.json
  600 e chiavi, unit con `systemd-analyze verify`, sudo con `sudo -l`, gruppi, file di boot una sola volta e ripristinati,
  agent avviato con la config installata e autorizzato sul finto OctoPrint, kiosk.sh con Chromium finto, helper USB con
  `systemd-mount` finto, seconda installazione, update con tarball danneggiato/stessa versione/`--force`, uninstall,
  installazione da clone con tarball in `release/` e checksum alterato, `--purge`). shellcheck pulito, 70 pytest,
  138 vitest. Tarball `release/floppyoctotouch-0.9.0.tar.gz` (348 KB) committato.
- Decisioni:
  - **Repo = pacchetto pronto** (decisione dell'utente): `release/` contiene solo l'ultimo tarball + `.sha256`;
    `git clone` + `sudo ./deploy/install.sh` verifica il checksum ed esegue l'installer del tarball. README con le due
    strade (clone o tarball copiato) e con update/uninstall/troubleshooting.
  - Chiavette montate su `/media/usb-<etichetta>` (l'agent mostra solo l'etichetta), `usb_roots` = `/media/usb-*`,
    espulsione con `sudo -n …/usb-mount.sh eject {path}`; solo FAT32/exFAT/NTFS (`ntfs3`)/ext*; il disco di sistema è
    ignorato (Pi avviato da SSD USB).
  - Profilo Chromium nuovo a ogni avvio in `XDG_RUNTIME_DIR` (tmpfs): niente "ripristina sessione", niente scritture
    sulla SD; le impostazioni della dashboard stanno nell'agent.
  - `--non-interactive` accetta le impostazioni del display (salvo `--skip-display-config`); gli update non toccano mai
    il display. I pacchetti installati restano dopo l'uninstall (lo script dice come toglierli).
  - Architettura diversa da arm64/armhf: solo avviso (serve per il container di test).
- Deviazioni / scoperte:
  - shellcheck: con `-x` dalla radice il `source=lib/common.sh` non veniva trovato → `source=SCRIPTDIR/lib/common.sh`.
  - Il finto OctoPrint non rispondeva su `/robots.txt` (il test aspettava all'infinito un 200): corretto.
  - Un controllo del test sui gruppi falliva per un glob con spazi sovrapposti (l'installer era giusto).
- Problemi aperti / da verificare sul Pi (S10): cage con PAM/logind su tty1 (sessione su `seat0`), nome effettivo
  `wayland-0` per `wlr-randr`, montaggio da udev con `systemd-mount` (e smontaggio all'estrazione, `BindsTo`),
  `--owner` di systemd-mount su vfat/exfat, nome del pacchetto Chromium su OctoPi 1.1.0, risoluzione con le righe
  del produttore + `video=`, tempi di avvio, flag GPU di Chromium (`FOT_CHROMIUM_FLAGS` in `kiosk.env`). Il
  riavvio/spegnimento da Sistema usa i comandi già configurati in OctoPi.
- Comandi utili: `docker compose -f dev/docker-compose.yml run --rm release` poi `… run --rm deploy-test`;
  sul Pi: `journalctl -u floppyoctotouch-agent -u floppyoctotouch-kiosk -b`, `journalctl -t floppyoctotouch-usb -b`,
  `sudo systemctl restart floppyoctotouch-kiosk`.
