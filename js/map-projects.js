/* ============================================================
   INTERACTIVE MAP — PROJECT MANIFEST
   (additive file · js/script.js is untouched)

   This is the ONLY file you edit to add your own work.
   Each entry below = one interactive layer on the map.

   HOW TO ADD A PROJECT — 3 steps
   ─────────────────────────────
   1) Convert your shapefile to GeoJSON:
        QGIS  : right-click the layer ▸ Export ▸ Save Features As…
                Format = GeoJSON, CRS = EPSG:4326 (WGS 84),
                save it into the  geojson/  folder of this site.
        (or)  ogr2ogr -f GeoJSON -t_srs EPSG:4326 geojson/my-project.geojson mylayer.shp
   2) Copy one template block below, give it a unique id,
      fill in title + desc (English AND French), category, year,
      and set  file: 'geojson/your-file.geojson'.
   3) Save, refresh the page — done.

   FIELDS
   ──────
   id       : unique short key (no spaces)
   title    : { en, fr }  shown in the list, filters & popups
   desc     : { en, fr }  1–2 sentences shown in list & popups
   category : free label used for filters/legend/colors
              (e.g. 'LiDAR', 'Fiber Optic', 'Digitization',
               'Photogrammetry', 'Spatial Analysis', 'Cartography')
   year     : display year
   file     : path to the GeoJSON — keep it RELATIVE
              ('geojson/x.geojson' ✔  '/geojson/x.geojson' ✘)
   color    : optional hex color override for this layer
   visible  : set false to temporarily hide a project

   TIPS
   ────
   • Large shapefiles? Simplify first (QGIS ▸ Vector ▸ Geometry
     Tools ▸ Simplify) and keep each file under ~5 MB — the map
     stays fast for visitors.
   • Confidential geometry? Generalize / clip before publishing.
   • Full guide: MAP-GUIDE.md
   ============================================================ */

window.MAP_PROJECTS = [

  /* ---------- TEMPLATE (copy me) ----------
  {
    id: 'my-project',
    title: {
      en: 'Project title (English)',
      fr: 'Titre du projet (français)'
    },
    desc: {
      en: 'One or two sentences: what it is, what you delivered.',
      fr: 'Une ou deux phrases : contenu et livrables.'
    },
    category: 'Cartography',
    year: '2025',
    file: 'geojson/my-project.geojson',
    color: '#1654F0',       // optional — remove to auto-assign
    visible: true
  },
  ------------------------------------------- */
  {
    id: 'Skarn-Favorabl-Geology',
    title: {
      en: 'Skarn Favorable Geology',
      fr: 'Skarn Favorable Geology'
    },
    desc: {
      en: 'lorum ipsum.',
      fr: 'lorum ipsum.'
    },
    category: 'Geology',
    year: '2025',
    file: 'geojson/Skarn Favorable Geology.json',
    color: '#de04f6',       // optional — remove to auto-assign
    visible: true
  },

  {
    id: 'lidar-survey-blocks',
    title: {
      en: 'LiDAR Classification — Survey Blocks',
      fr: 'Classification LiDAR — Blocs de relevé'
    },
    desc: {
      en: 'leaflet does not support 3D but i will find a way.',
      fr: 'Leaflet with L.imageOverlay or a COG tile plugin (but not today xD).'
    },
    category: 'LiDAR',
    year: '2025',
    file: 'geojson/lidar-survey-blocks.geojson',
    color: '#1654F0',
    visible: true
  },

  {
    id: 'fiber-network',
    title: {
      en: 'Fiber Optic Network — Routes',
      fr: 'Réseau Fibre Optique — Tronçons'
    },
    desc: {
      en: 'Test subject N°1.',
      fr: 'same massage in french.'
    },
    category: 'Fiber Optic',
    year: '2024',
    file: 'geojson/fiber-network.geojson',
    color: '#19C9EB',
    visible: true
  },

  {
    id: 'urban-digitization',
    title: {
      en: 'Urban Digitization — Parcels',
      fr: 'Numérisation Urbaine — Parcelles'
    },
    desc: {
      en: 'remeber to get data from Old PC .',
      fr: 'Rappel!.'
    },
    category: 'Digitization',
    year: '2024',
    file: 'geojson/urban-digitization.geojson',
    color: '#8B7CF6',
    visible: true
  }

];
