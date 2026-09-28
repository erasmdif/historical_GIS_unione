# Nuova sezione Archivi

La pagina pubblica è raggiungibile da `archivi.html` e usa il parametro `view` per le sottosezioni:

- `archivi.html` — landing introduttiva;
- `archivi.html?view=asmo` — Archivio di Stato di Modena;
- `archivi.html?view=unione` — presentazione dell'Archivio Terre Unione Castelli;
- `archivi.html?view=<comune>` — pagine degli otto archivi comunali (`castelnuovo`, `castelvetro`, `guiglia`, `marano`, `savignano`, `spilamberto`, `vignola`, `zocca`).

## Popolamento automatico delle mappe

Le schede leggono `data/maps.csv`. Una carta appare nella pagina comunale quando il campo `archivio` contiene il nome del comune, senza distinzione tra maiuscole, minuscole, spazi o accenti. Esempi validi:

```csv
archivio
Archivio storico comunale di Zocca
Archivio di Spilamberto
Comune di Savignano sul Panaro - Archivio storico
```

ASMo riconosce le diciture contenenti `Archivio di Stato di Modena` e quelle che iniziano con `ASMo`.

I campi già gestiti dalle schede sono `id`, `name`, `sigla`, `archivio`, `descrizione`, `georeferenced`, `cartiglio`, `anno` e `json`. Anteprime e immagini ad alta risoluzione continuano a seguire le convenzioni esistenti in `images/maps/preview/` e `images/maps/full_width/`.

## Mappa dell'Unione

La mappa viene generata nel browser da `data/storico.geojson`:

- la feature con `id = 24` definisce il perimetro generale;
- le feature con `parent_id = 24` definiscono gli otto comuni cliccabili.

Marano sul Panaro è incluso perché presente sia nell'attuale Unione sia nel GeoJSON, anche se non era elencato nel primo riepilogo della richiesta.

## Compatibilità

I precedenti URL della galleria con `view=asmo`, `view=vignola` e `view=castelnuovo` reindirizzano alle nuove pagine. Il lettore specialistico del quaderno Galliani resta disponibile dalla scheda di Castelnuovo.
