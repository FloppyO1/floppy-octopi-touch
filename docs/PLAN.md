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
   (eccezione: Sessione 10 → `1.0.0` / `v1.0.0`). Marcare la riga come `[x]` con la data, aggiungere le note
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
- **Screensaver**: dopo X minuti di inattività mostra una **vista minimale a caratteri grandi** (progresso se in stampa, altrimenti orologio + temperature). Tocco = ritorno.
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
- Ricerca file con tastiera a schermo. Chiusura sessione (sezione 3), poi FERMATI.
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
- Impostazioni: lingua, timeout screensaver, spegnimento schermo (on/off + minuti), beep fine stampa, soglie/massimi
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

### Sessione 10 — Test sul Raspberry reale e rifinitura
```
Leggi docs/PLAN.md e CLAUDE.md. Esegui la Sessione 10 (io ho il Raspberry davanti e ti riporto l'esito):
- Guidami nell'installazione sul Pi e nella checklist hardware: boot → kiosk automatico, touch preciso, risoluzione
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
- [ ] Sessione 5 — File
- [ ] Sessione 6 — Temperature, Movimento, Filamento
- [ ] Sessione 7 — Terminale, Macro, Livellamento/Mesh
- [ ] Sessione 8 — Sistema e Impostazioni
- [ ] Sessione 9 — Installazione sul Raspberry
- [ ] Sessione 10 — Test reale e rifinitura

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
