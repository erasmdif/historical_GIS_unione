# Atlante Storico Digitale — struttura applicativa e dati

Questo progetto è stato riorganizzato per separare in modo più netto il codice dell’applicazione, i dati tabellari/spaziali e gli asset iconografici. La struttura aggiornata assume che l’app sia servita dalla radice del progetto; per comodità `index.html` alla radice reindirizza alla nuova homepage in `static/html/homepage/index.html`.

## Struttura del progetto

```text
/
├── index.html                         # redirect di servizio verso la homepage
├── README.md
├── data/                              # dati del database statico
│   ├── maps.csv
│   ├── places.geojson
│   ├── maps_places.csv
│   ├── people.csv
│   └── people_places.csv
├── images/                            # asset visuali non di codice
│   ├── icons/                         # icone dei luoghi / marker
│   ├── other_images/                  # immagini statiche per home, archivi, credits, placeholder
│   └── maps/
│       ├── georeferenced/             # raster georeferenziati, di norma .tif/.tiff GeoTIFF
│       ├── preview/                   # anteprime leggere, di norma .webp
│       └── full_width/                # immagini ad alta risoluzione per viewer, di norma .jpg/.jpeg
└── static/                            # tutto il codice front-end
    ├── css/
    │   ├── common/
    │   ├── homepage/
    │   ├── webgis/
    │   ├── gallery/
    │   └── tag_viewer/
    ├── html/
    │   ├── homepage/
    │   ├── webgis/
    │   ├── gallery/
    │   └── tag_viewer/
    └── js/
        ├── common/
        ├── homepage/
        ├── webgis/
        ├── gallery/
        └── tag_viewer/
```

## Convenzioni sui percorsi delle immagini di mappa

Il nuovo `maps.csv` non duplica più i percorsi delle immagini. L’app li ricava dalla `sigla` della mappa:

- preview: `images/maps/preview/<sigla>.webp`
- viewer ad alta risoluzione: `images/maps/full_width/<sigla>.jpg`
- raster georeferenziato: `images/maps/georeferenced/<sigla>.tif`

Esempio: per `sigla = VG_68`, l’app cerca `images/maps/preview/VG_68.webp`, `images/maps/full_width/VG_68.jpg` e `images/maps/georeferenced/VG_68.tif`.

## Architettura dei dati

### `maps.csv`

Contiene la descrizione sintetica delle mappe e costituisce il catalogo principale dei documenti cartografici.

Campi principali:

- `id`: identificativo univoco della mappa. È la chiave usata dalle relazioni N:M.
- `name`: titolo esteso o descrittivo della mappa, quando disponibile.
- `sigla`: codice breve e stabile della mappa. È usato anche per ricavare i percorsi delle immagini.
- `archivio`: fondo, archivio o nucleo documentario di appartenenza.
- `descrizione`: descrizione storico-documentaria della mappa.
- `georeferenced`: booleano; indica se esiste un raster georeferenziato utilizzabile nel WebGIS.
- `cartiglio`: trascrizione o descrizione del cartiglio/nota esplicativa della mappa.
- `anno`: anno o riferimento cronologico normalizzato, quando noto.
- `json`: campo opzionale per conservare i tag interni all’immagine, cioè coordinate normalizzate nel viewer (`x` e `y` comprese tra 0 e 1), nome del tag, id del luogo collegato e note. Se vuoto, il viewer mostra comunque i luoghi associati tramite `maps_places.csv`, ma non può disporre i pin sull’immagine.

### `places.geojson`

È il dataset spaziale centrale del progetto. Si tratta di una `FeatureCollection` mista: può contenere geometrie puntiformi, poligonali/multipoligonali oppure geometrie assenti.

Campi principali:

- `fid`: identificativo univoco del luogo. È la chiave usata nelle relazioni N:M.
- `name`: nome normalizzato del luogo storico o amministrativo.
- `mappa`: campo legacy/descrittivo che conserva il rimando testuale alla mappa o alle mappe in cui il toponimo compare. La relazione applicativa è però gestita da `maps_places.csv`.
- `parent_id`: riferimento gerarchico a un altro luogo. Se child e parent sono entrambi poligonali, il child rappresenta una attestazione cartografica specifica di un luogo storico più generale. Se il child è poligonale e il parent è puntiforme, il child è collocato entro il comune o l’area rappresentata dal parent.
- `descrizione`: descrizione storica estesa del luogo.
- `identificazione_attuale`: indicazioni sulla localizzazione contemporanea o sulla sopravvivenza del toponimo.
- `wikipedia` / `wikidata`: riferimenti esterni, quando disponibili.
- `dimension`: classe dimensionale usata per il rendering dei marker puntiformi.
- `note Marcello`: campo legacy interno; va conservato nei dati ma non esposto nell’interfaccia pubblica.
- `interpreted`: booleano; per i luoghi puntiformi indica che il posizionamento è interpretativo e non fondato su un aggancio storico-topografico forte.
- `as`: forma attestata o variante cartografica del nome, quando presente.
- `province` / `region`: riferimenti amministrativi moderni, usati soprattutto per i luoghi puntiformi. I luoghi figli possono ereditarli tramite `parent_id`.
- `historical_province`: area o appartenenza storico-politica del luogo.

### `maps_places.csv`

Tabella N:M tra mappe e luoghi.

- `id_map`: riferimento a `maps.csv.id`.
- `id_place`: riferimento a `places.geojson.properties.fid`.

Permette di associare una mappa a uno o più luoghi senza duplicare informazioni dentro `maps.csv` o `places.geojson`.

### `people.csv`

Contiene soggetti storici — persone, famiglie o enti — collegati ai luoghi/possedimenti.

Campi principali:

- `id`: identificativo univoco del soggetto.
- `name`: nome normalizzato del soggetto.
- `tipo_soggetto`: classificazione del soggetto (`persona singola`, `famiglia`, `ente`, ecc.).
- `varianti`: alias, varianti grafiche o forme alternative attestate.
- `descrizione`: breve profilo storico-biografico.

Il modello concettuale prevede la possibilità di collegare individui specifici a famiglie tramite parenting interno; nello schema minimo attualmente fornito questa informazione non è però presente come campo autonomo.

### `people_places.csv`

Tabella N:M tra soggetti e luoghi.

- `id_place`: riferimento a `places.geojson.properties.fid`.
- `id_people`: riferimento a `people.csv.id`.

La relazione è spesso 1:1, ma viene modellata come N:M per gestire possedimenti condivisi, famiglie con più beni o luoghi collegati a più soggetti nel tempo.

## Logica applicativa aggiornata

- Il WebGIS legge `places.geojson`: i punti alimentano il layer dei marker, mentre poligoni e multipoligoni alimentano il layer areale.
- La dashboard laterale legge `maps.csv` e `maps_places.csv`; il filtro per mappa viene costruito a partire dalla relazione N:M e non più da una tabella legacy `map_topo.csv`.
- Il dettaglio mappa legge prima la scheda da `maps.csv`, poi recupera i luoghi associati da `maps_places.csv`. Se `maps.csv.json` contiene coordinate interne all’immagine, vengono renderizzati anche i pin nel viewer; altrimenti vengono mostrate le schede dei luoghi senza posizionamento sull’immagine.
- I soggetti storici di `people.csv` e `people_places.csv` sono integrati nel viewer come informazione contestuale dei luoghi collegati.
- I campi legacy o interni, come `note Marcello`, vengono mantenuti nel database ma non sono esposti nelle schede pubbliche.

## Note di migrazione

La vecchia struttura usava `toponimi.geojson`, `map_topo.csv`, `map_details.geojson` e una cartella separata `data/maps_data/` per i tag sulle immagini. La nuova struttura sostituisce questi riferimenti con `places.geojson`, `maps_places.csv` e il campo `json` di `maps.csv`. Il codice è stato aggiornato per leggere i nuovi file e per ricavare i percorsi immagine dalla `sigla` della mappa.

## Avvio locale e URL principali

Avviare dalla root del progetto:

```bash
python3 -m http.server 8000
```

Poi aprire la homepage da `http://localhost:8000/`.

Per compatibilità con la vecchia struttura sono disponibili anche alcuni alias nella root:

- `http://localhost:8000/webgis.html` → `static/html/webgis/webgis.html`
- `http://localhost:8000/archivi.html` → `static/html/gallery/archivi.html`
- `http://localhost:8000/archivio.html` → `static/html/gallery/archivio.html`
- `http://localhost:8000/dettaglio.html` → `static/html/tag_viewer/dettaglio.html`

Nota: `0.0.0.0` è utile come indirizzo di binding del server, ma nel browser è preferibile usare `localhost` oppure `127.0.0.1`.
