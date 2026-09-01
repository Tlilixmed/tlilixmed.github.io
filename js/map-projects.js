/* ============================================================
   INTERACTIVE MAP — PROJECT MANIFEST  (v2 · grouped projects)
   ------------------------------------------------------------
   This is the ONLY file you edit to add your own work.
   js/map.js renders everything automatically from this manifest.

   WHAT CHANGED IN v2
   ──────────────────
   A project is now a GROUP that can contain SEVERAL GeoJSON
   files (sub-layers). On the map, in the legend and in the
   project list, the group appears as ONE item named after the
   project — e.g. "Tungsten Open Ground" — with expandable
   per-layer visibility toggles.

   Two shapes of entry are accepted (they can be mixed freely):

   1) GROUPED PROJECT (new) — has a  layers: [...]  array
   2) SIMPLE LAYER (legacy v1) — has a top-level  file: '...'
      → automatically wrapped as a single-layer group,
        so your old manifest entries keep working unchanged.

   ────────────────────────────────────────────────────────────
   HOW TO ADD A PROJECT — 4 steps
   ────────────────────────────────────────────────────────────
   1) Convert your shapefiles to GeoJSON (one per sub-layer):
        QGIS  : right-click the layer ▸ Export ▸ Save Features As…
                Format = GeoJSON, CRS = EPSG:4326 (WGS 84),
                save into  geojson/<project-name>/  of this site.
        (or)  ogr2ogr -f GeoJSON -t_srs EPSG:4326 out.geojson in.shp

   2) Copy the GROUPED PROJECT template below, give the group a
      unique id, fill in title + desc (English AND French),
      category, year and the group base  color  (sub-layers are
      auto-shaded from it — or give each layer its own  color).

   3) List every GeoJSON file as a  layers[]  entry with a
      bilingual label:  { file: 'geojson/…', label: {en, fr} }

   4) Save, refresh the page — done. Full guide: MAP-GUIDE-v2.md

   ────────────────────────────────────────────────────────────
   GROUP FIELDS
   ────────────────────────────────────────────────────────────
   id        unique short key (no spaces)
   title     { en, fr }   shown in list, filters, legend & popups
   desc      { en, fr }   1–2 sentences shown in list & popups
   category  free label used for filters/legend/colors
             (e.g. 'Mineral Exploration', 'LiDAR', 'Fiber Optic',
              'Digitization', 'Cartography')
   year      display year
   color     base hex — sub-layers get readable shades of it
   visible   group visible at load (default true)
   collapsed legend starts folded (default true)
   layers    [ { file, label:{en,fr}, color?, visible?, weight?,
               fillOpacity?, dash?, radius?, minZoom?, maxZoom?,
               fields?: ['KEY_A','KEY_B', …] } ]
               · fields — optional ordered/filtered attribute list
                 shown first in popups & the attribute panel

   ────────────────────────────────────────────────────────────
   TIPS
   ────────────────────────────────────────────────────────────
   • Large shapefiles? Simplify first (QGIS ▸ Vector ▸ Geometry
     Tools ▸ Simplify) and keep each file under ~5 MB.
   • Confidential geometry? Generalize / clip before publishing.
   • Attribute names appear humanized automatically
     ('max_WO3_pct' → 'Max wo3 pct'); use  fields  to curate.
   ============================================================ */

window.MAP_PROJECTS = [

  /* ---------- GROUPED PROJECT TEMPLATE (copy me) ----------
  {
    id: 'my-project',
    title: { en: 'Project title (EN)', fr: 'Titre du projet (FR)' },
    desc: {
      en: 'One or two sentences: what it is, what you delivered.',
      fr: 'Une ou deux phrases : contenu et livrables.'
    },
    category: 'Cartography',
    year: '2025',
    color: '#F0B429',
    visible: true,
    collapsed: true,
    layers: [
      {
        file: 'geojson/my-project/outline.geojson',
        label: { en: 'Boundary', fr: 'Limite' }
      },
      {
        file: 'geojson/my-project/sites.geojson',
        label: { en: 'Sites', fr: 'Sites' },
        color: '#8a5a00',          // optional shade override
        visible: true,
        fields: ['site_id', 'type', 'grade']   // curated attribute order
      }
    ]
  },
  ----------------------------------------------------------- */

  {
    id: 'Something-open-ground',
    title: { en: 'Something Open Ground', fr: 'Ciel Ouvert — quelque chose' },
    desc: {
      en: 'Mineral exploration project.',
      fr: "Projet d'exploration minière."
    },
    category: 'Mineral Exploration',
    year: '2025',
    color: '#F0B429',
    visible: true,
    collapsed: true,
    layers: [
      {
        file: 'geojson/Something-open-ground/Faults.json',
        label: { en: 'License Boundary', fr: 'Périmètre Minier' },
        weight: 2.5,
        dash: '8 5',
        fillOpacity: 0.05,
      
      },
      {
        file: 'geojson/Something-open-ground/Something Favorable Geology.json',
        label: { en: 'Favorable Geology', fr: 'Géologie Favorable' },
        
      },
      {
        file: 'geojson/Something-open-ground/Ocurrences.json',
        label: { en: 'Ocurrences', fr: "Ocurrences" },
        dash: '4 3',
      
      },
    ]
  },

  /* ---------- legacy single-file entries (v1 shape, still fine) ---------- */

  {
    id: 'lidar-survey-blocks',
    title: { en: 'LiDAR Classification — Survey Blocks', fr: 'Classification LiDAR — Blocs de relevé' },
    desc: {
      en: 'Leaflet does not support LAS but i will find a way.',
      fr: "potree.js or raster tiles might be the way!."
    },
    category: 'LiDAR',
    year: '2025',
    file: 'geojson/lidar-survey-blocks.geojson',
    color: '#f01616',
    visible: true
  },

  {
    id: 'fiber-network',
    title: { en: 'Fiber Optic Network — Routes', fr: 'Réseau Fibre Optique — Tronçons' },
    desc: {
      en: 'Test Subject N²',
      fr: 'Check old Pc for data.'
    },
    category: 'Fiber Optic',
    year: '2024',
    file: 'geojson/fiber-network.geojson',
    color: '#19C9EB',
    visible: true
  },

  {
    id: 'urban-digitization',
    title: { en: 'Urban Digitization — Parcels', fr: 'Numérisation Urbaine — Parcelles' },
    desc: {
      en: 'Check Drive or Dropbox for data.',
      fr: 'Same message in french.'
    },
    category: 'Digitization',
    year: '2024',
    file: 'geojson/urban-digitization.geojson',
    color: '#8B7CF6',
    visible: true
  }

];
