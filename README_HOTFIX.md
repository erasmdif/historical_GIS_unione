# Hotfix tile remote v3.1

Applicare dopo la patch v3 copiando il contenuto di questa cartella nella root di `terre_unione_app` e confermando la sovrascrittura.

## Correzioni

- Corretto il percorso GitHub Pages: le piramidi si trovano nella sottocartella aggiuntiva `terre_unione_reosurces/`.
- Evitato il fallback prematuro causato dai normali 404 delle tile vuote ai margini della carta.
- Il fallback sul GeoTIFF locale ora avviene solo se, dopo una breve attesa, non è stata caricata alcuna tile valida.

Percorso effettivo verificato:

```text
https://erasmdif.github.io/terre_unione_reosurces/terre_unione_reosurces/GM_10/leaflet.html
https://erasmdif.github.io/terre_unione_reosurces/terre_unione_reosurces/GM_10/{z}/{x}/{y}.png
```

Il pacchetto modifica soltanto:

```text
static/js/webgis/app.js
```
