# Terre Unione · patch tile remote v3

Questa è una patch completa: comprende anche gli aggiornamenti WebGIS, homepage, archivi e wiki delle versioni precedenti.

## Installazione drag & drop

1. Fare una copia di sicurezza dell'applicazione.
2. Estrarre lo ZIP.
3. Copiare **il contenuto** della cartella estratta nella root di `terre_unione_app`.
4. Confermare l'unione delle cartelle e la sovrascrittura dei file esistenti.
5. Ricaricare il sito ignorando la cache (`Ctrl/Cmd + Shift + R`).

## Funzionamento delle tile

Per ogni carta georeferenziata il WebGIS usa la `sigla` contenuta in `maps.csv` come nome della cartella remota.

Esempio per `sigla = GM_10`:

```text
https://erasmdif.github.io/terre_unione_reosurces/GM_10/leaflet.html
https://erasmdif.github.io/terre_unione_reosurces/GM_10/{z}/{x}/{y}.png
```

Il flusso è automatico:

1. verifica l'esistenza di `GM_10/leaflet.html`;
2. legge da quel file bounds, zoom minimo/massimo e convenzione delle tile;
3. carica la piramide PNG remota in Leaflet;
4. se la cartella non esiste, non è raggiungibile o le tile restituiscono errori, carica il GeoTIFF locale da `images/maps/georeferenced/`.

Non occorre aggiungere colonne a `maps.csv` né creare un manifest separato. È però necessario che il nome della cartella remota coincida esattamente con la `sigla` della carta.

## Convenzione

Le tile prodotte da `geotiff_tile_builder.py` sono XYZ perché il comando usa `gdal2tiles --xyz`. Il loader legge comunque l'impostazione da `leaflet.html` e usa XYZ come valore predefinito.

## Diagnostica

Aprendo gli strumenti sviluppatore del browser (`F12`) vengono mostrati messaggi come:

```text
[tiles] GM_10: overlay remoto attivo (XYZ, zoom 12–19).
[tiles] GM_10: tile non disponibili; ripiego sul GeoTIFF locale.
```

## Nota

Il repository e l'URL GitHub Pages sono configurati in `static/js/webgis/app.js`, nell'oggetto `REMOTE_TILES`.
