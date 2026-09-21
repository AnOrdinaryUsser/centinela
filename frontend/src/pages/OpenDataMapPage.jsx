import { useEffect, useMemo, useState } from 'react'
import { MapContainer, TileLayer, WMSTileLayer, GeoJSON, Marker, Popup, ScaleControl } from 'react-leaflet'
import MarkerClusterGroup from 'react-leaflet-cluster'
import L from 'leaflet'
import CIcon from '@coreui/icons-react'
import {
  cilGlobeAlt,
  cilWarning,
  cilInfo,
  cilBook,
  cilLayers,
  cilX,
  cilChevronBottom,
  cilChevronTop,
  cilRecycle,
  cilTrash,
  cilDrop,
  cilLeaf,
  cilTruck,
  cilStorage,
  cilBuilding,
  cilCarAlt,
  cilTv,
  cilCog,
  cilLocationPin,
  cilOptions,
} from '@coreui/icons'
import {
  getDatasetLayers,
  getWasteFacilitiesGeo,
  getHydrographyGeo,
  getProtectedAreasGeo,
  getPublicDetections,
  getLandCoverMeta,
  getLandCoverGeo,
} from '../services/api.js'
import { useI18n } from '../i18n/I18nContext.jsx'

const CYL_CENTER = [41.65, -4.73]
const CYL_INITIAL_ZOOM = 8
const MAP_MAX_ZOOM = 19
const PNOA_WMS_URL = import.meta.env.VITE_PNOA_WMS_URL || 'https://www.ign.es/wms-inspire/pnoa-ma'

// Same public "legal / illegal" color language as MapPage's own detection
// markers (see SEVERITY_COLORS there), so a detection looks the same
// whether seen on your own analysis run or on this cross-user map.
const STATUS_COLORS = {
  legal_probable: '#3ddc84',
  illegal_probable: '#f9b115',
  illegal_critical: '#ff5d6c',
}

// Colored by the top-level "canal" from the real JCyL taxonomy (see
// etl/scripts/load_waste_facilities.py) - the finer sub-classification
// (Punto Limpio, Planta de Transferencia, Vertedero...) is offered as
// filter checkboxes instead of extra colors, which would make the legend
// unreadable at ~20 distinct subtypes.
const FACILITY_CANAL_COLORS = {
  'Canal Industrial': '#a855f7',
  'Canal Doméstico': '#4c8dff',
}
const FACILITY_FALLBACK_COLOR = '#8a93a2'

// Small per-subtype pictogram for the facility legend/filter list, in the
// spirit of the JCyL viewer's own legend (a distinct icon per waste-facility
// subtype) - built from CoreUI's free icon set rather than tracing their
// artwork. Matched by keyword against the real subtype text (see
// etl/scripts/load_waste_facilities.py) so it keeps working even if the
// exact wording has a trailing canal suffix, an extra parenthetical, etc.
// Ordered most-specific-first; the first match wins.
function normalizeText(text) {
  return (text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
}

const SUBTYPE_ICON_RULES = [
  [/peligros/, cilWarning],
  [/raee/, cilTv],
  [/vfu|automovil/, cilCarAlt],
  [/yeso/, cilLayers],
  [/vidrio/, cilStorage],
  [/edaru|edari|depuradora|potable|etap/, cilDrop],
  [/lodos|compost|digestion anaerobia|biometaniza/, cilLeaf],
  [/transferencia/, cilTruck],
  [/almacenamiento/, cilStorage],
  [/punto limpio|envases/, cilRecycle],
  [/sede social|recogidas/, cilBuilding],
  [/aportacion/, cilLocationPin],
  [/i\+d|investigacion/, cilCog],
  [/movil/, cilTruck],
  [/reutilizacion|valorizacion/, cilRecycle],
  [/rcd/, cilRecycle],
  [/vertedero/, cilTrash],
  [/residuos domesticos/, cilTrash],
]

function subtypeIcon(label) {
  const normalized = normalizeText(label)
  const rule = SUBTYPE_ICON_RULES.find(([pattern]) => pattern.test(normalized))
  return rule ? rule[1] : cilOptions
}

const WATER_TYPE_COLORS = {
  EMBALSE: '#1f6fd6',
  LAGO: '#3aa0ff',
  RIO: '#6fd0ff',
}
const WATER_TYPE_FALLBACK_COLOR = '#3aa0ff'

// A single fixed color is enough here, no per-type breakdown needed - but
// it must NOT be green: the basemap underneath (OSM/topo) already renders
// forest/farmland in shades of green, so a green boundary line all but
// disappears on top of it (confirmed by Sergio's own screenshot - the
// polygons were essentially invisible even though they were loading and
// drawing correctly). Magenta/pink has no other user on this map (see the
// palette note above FACILITY_CANAL_COLORS/WATER_TYPE_COLORS/STATUS_COLORS
// - purple, blue and amber/red are all already spoken for), so it reads
// clearly against green terrain, blue water and purple/blue facility dots
// alike.
const PROTECTED_AREA_COLOR = '#ff3fa4'

// The real cover_type values (whatever column load_land_cover.py actually
// matched - USO/USO_SUELO/LEYENDA/etc, see that script's
// COVER_TYPE_COLUMN_CANDIDATES) aren't known ahead of time, so unlike the
// facility canals or water types above there's no fixed color map to write
// by hand. Instead this hashes each distinct value seen in the response
// into one of a small fixed palette, deterministically (same string always
// gets the same color within a session), and the legend is built from
// whatever values actually came back for the selected municipality.
// Sentinel value for the municipality <select> - a real municipality name
// could theoretically collide with a plain string like "all", so this uses
// a value no real JCyL municipality name can ever equal.
const LAND_COVER_ALL_MUNICIPALITIES = '__ALL_MUNICIPALITIES__'

const LAND_COVER_PALETTE = ['#5cb85c', '#e0a13a', '#b06fd6', '#4c8dff', '#e0607a', '#3ac7b0', '#c2c24a', '#8a93a2']
function landCoverColor(coverType) {
  if (!coverType) return LAND_COVER_PALETTE[LAND_COVER_PALETTE.length - 1]
  let hash = 0
  for (let i = 0; i < coverType.length; i += 1) hash = (hash * 31 + coverType.charCodeAt(i)) >>> 0
  return LAND_COVER_PALETTE[hash % LAND_COVER_PALETTE.length]
}

// No API-key-gated tile host here on purpose (see the panelSubtitle copy
// in the UI and the reply this shipped with) - CARTO's raster basemaps
// now require an account/API key for some styles, which is what produced
// the "API KEY REQUIRED" watermark tiles. OSM's standard tile server is
// free/keyless and is the same one MapPage.jsx already uses for its own
// "osm" basemap option, so this stays consistent with the rest of the app.
const BASEMAPS = {
  osm: {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap contributors',
    maxNativeZoom: 19,
  },
  topo: {
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap contributors, SRTM | &copy; OpenTopoMap (CC-BY-SA)',
    maxNativeZoom: 17,
  },
}

function hydrographyStyle(feature) {
  const color = WATER_TYPE_COLORS[feature?.properties?.waterType] ?? WATER_TYPE_FALLBACK_COLOR
  return { color, weight: 1.2, fillColor: color, fillOpacity: 0.4 }
}

function protectedAreaStyle() {
  return { color: PROTECTED_AREA_COLOR, weight: 2, fillColor: PROTECTED_AREA_COLOR, fillOpacity: 0.18, dashArray: '4' }
}

// Small colored-dot divIcon (rather than a plain CircleMarker) so these
// markers can go inside a MarkerClusterGroup - Leaflet's clustering plugin
// only clusters L.Marker instances, not vector layers like CircleMarker.
function dotIcon(color, size = 14) {
  return L.divIcon({
    className: 'opendata-dot-icon',
    html: `<span style="display:block;width:${size}px;height:${size}px;border-radius:50%;background:${color};border:2px solid rgba(255,255,255,0.85);box-shadow:0 0 0 1px rgba(0,0,0,0.25)"></span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  })
}

// Same colored bubble as dotIcon, but with the facility's actual subtype
// pictogram drawn INSIDE it (in white, via currentColor - CoreUI icon path
// data uses fill="var(--ci-primary-color, currentcolor)") rather than just
// a plain dot. The legend/filter list and the popups already showed the
// icon (via <CIcon>, a React component); the markers themselves never did
// - they were always just flat colored dots, which is what Sergio's
// screenshot was actually pointing out ("no se ven las burbujas moradas
// con los iconos" - the icons were never there to see). A CoreUI icon
// array is `[viewBox, svgInnerMarkup]` (see @coreui/icons-react's own
// CIcon source), so building the equivalent raw <svg> HTML string here -
// rather than trying to render a React component into a Leaflet divIcon,
// which only takes a plain HTML string - is the correct, supported way to
// reuse the exact same icon set inside a Leaflet marker.
function facilityIcon(color, icon, size = 24) {
  const [viewBox, svgMarkup] = icon
  const glyphSize = Math.round(size * 0.56)
  return L.divIcon({
    className: 'opendata-dot-icon',
    html: `<span style="display:flex;align-items:center;justify-content:center;width:${size}px;height:${size}px;border-radius:50%;background:${color};border:2px solid rgba(255,255,255,0.9);box-shadow:0 0 0 1px rgba(0,0,0,0.3);color:#fff;">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewBox}" width="${glyphSize}" height="${glyphSize}" style="display:block;">${svgMarkup}</svg>
    </span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  })
}

function clusterIcon(color) {
  return (cluster) =>
    L.divIcon({
      className: 'opendata-cluster-icon',
      html: `<span style="background:${color}">${cluster.getChildCount()}</span>`,
      iconSize: [36, 36],
    })
}

// "Mapa de datos abiertos": a second, dedicated interactive map (separate
// from the analysis MapPage) whose whole point is transparency - showing,
// with real toggleable layers, every open-data source this platform
// actually queries (see backend/src/services/spatialService.js), plus a
// cross-user view of every dumpsite the community has detected. Datasets
// that are loaded but have no usable geometry yet (protected areas without
// boundary polygons, the still-empty land-cover table) are listed
// honestly as disabled rows instead of being silently hidden or faked.
export default function OpenDataMapPage() {
  const { t } = useI18n()

  const [layerMeta, setLayerMeta] = useState([])
  const [metaError, setMetaError] = useState(null)

  const [facilitiesOn, setFacilitiesOn] = useState(true)
  const [hydrographyOn, setHydrographyOn] = useState(false)
  const [protectedAreasOn, setProtectedAreasOn] = useState(false)
  const [detectionsOn, setDetectionsOn] = useState(true)
  const [landCoverOn, setLandCoverOn] = useState(false)

  const [facilities, setFacilities] = useState(null)
  const [hydrography, setHydrography] = useState(null)
  const [protectedAreas, setProtectedAreas] = useState(null)
  const [detections, setDetections] = useState(null)
  const [landCoverMeta, setLandCoverMeta] = useState(null) // [{province, totalCount, municipalities:[{municipality,count}]}]
  const [selectedProvince, setSelectedProvince] = useState('')
  const [selectedMunicipality, setSelectedMunicipality] = useState('')
  const [landCover, setLandCover] = useState(null)
  const [activeCoverTypes, setActiveCoverTypes] = useState(null) // null = "all" until land cover loads
  const [coverTypesExpanded, setCoverTypesExpanded] = useState(false)

  const [loadingLayer, setLoadingLayer] = useState({ facilities: false, hydrography: false, protectedAreas: false, detections: false, landCover: false })
  const [layerError, setLayerError] = useState({ facilities: null, hydrography: null, protectedAreas: null, detections: null, landCover: null })

  const [minConfidence, setMinConfidence] = useState(0.75)
  const [activeSubtypes, setActiveSubtypes] = useState(null) // null = "all" until facilities load
  const [subtypesExpanded, setSubtypesExpanded] = useState(false)
  const [basemap, setBasemap] = useState('osm')
  const [showSources, setShowSources] = useState(false)
  // Collapses the whole "Mapa de datos abiertos" legend down to just its
  // header bar - on a phone the panel's full content (every layer row,
  // subtype filters, the land-cover selectors...) can run taller than the
  // screen itself and permanently covers the map underneath it, and even
  // on desktop it's often more panel than someone actively adjusting
  // layers needs to see at once. Defaults open (unchanged from before)
  // since it's just as usable as a toggle on desktop as it is on mobile.
  const [legendCollapsed, setLegendCollapsed] = useState(false)

  useEffect(() => {
    getDatasetLayers()
      .then(setLayerMeta)
      .catch(() => setMetaError(t('opendata.metaError')))
  }, [t])

  // Fetch each geometry layer lazily, only the first time it's switched on
  // - hydrography in particular is thousands of polygons, no reason to pay
  // for it if the visitor never asks to see it.
  useEffect(() => {
    if (!facilitiesOn || facilities) return
    setLoadingLayer((prev) => ({ ...prev, facilities: true }))
    getWasteFacilitiesGeo()
      .then((data) => {
        setFacilities(data)
        setActiveSubtypes(new Set(data.features.map((f) => subtypeKey(f.properties))))
      })
      .catch(() => setLayerError((prev) => ({ ...prev, facilities: t('opendata.layerError') })))
      .finally(() => setLoadingLayer((prev) => ({ ...prev, facilities: false })))
  }, [facilitiesOn, facilities, t])

  useEffect(() => {
    if (!hydrographyOn || hydrography) return
    setLoadingLayer((prev) => ({ ...prev, hydrography: true }))
    getHydrographyGeo()
      .then((data) => setHydrography(data))
      .catch(() => setLayerError((prev) => ({ ...prev, hydrography: t('opendata.layerError') })))
      .finally(() => setLoadingLayer((prev) => ({ ...prev, hydrography: false })))
  }, [hydrographyOn, hydrography, t])

  useEffect(() => {
    if (!protectedAreasOn || protectedAreas) return
    setLoadingLayer((prev) => ({ ...prev, protectedAreas: true }))
    getProtectedAreasGeo()
      .then((data) => setProtectedAreas(data))
      .catch(() => setLayerError((prev) => ({ ...prev, protectedAreas: t('opendata.layerError') })))
      .finally(() => setLoadingLayer((prev) => ({ ...prev, protectedAreas: false })))
  }, [protectedAreasOn, protectedAreas, t])

  // Detections depend on the confidence slider, so - unlike the two static
  // open-data layers above - this one legitimately re-fetches whenever
  // that changes (debounced a touch so dragging the slider doesn't fire a
  // request per pixel).
  useEffect(() => {
    if (!detectionsOn) return undefined
    setLoadingLayer((prev) => ({ ...prev, detections: true }))
    const timeout = window.setTimeout(() => {
      getPublicDetections(minConfidence)
        .then((data) => {
          setDetections(data)
          setLayerError((prev) => ({ ...prev, detections: null }))
        })
        .catch(() => setLayerError((prev) => ({ ...prev, detections: t('opendata.layerError') })))
        .finally(() => setLoadingLayer((prev) => ({ ...prev, detections: false })))
    }, 350)
    return () => window.clearTimeout(timeout)
  }, [detectionsOn, minConfidence, t])

  // Land-cover meta (which province/municipality combos are actually
  // loaded, per getLandCoverMeta above) fetched lazily too, once the layer
  // is switched on - same lazy-load philosophy as facilities/hydrography.
  useEffect(() => {
    if (!landCoverOn || landCoverMeta) return
    getLandCoverMeta()
      .then((data) => setLandCoverMeta(data))
      .catch(() => setLayerError((prev) => ({ ...prev, landCover: t('opendata.layerError') })))
  }, [landCoverOn, landCoverMeta, t])

  // The actual polygons only get fetched once a province is picked - and
  // either a specific municipality, or the explicit "todos los municipios"
  // sentinel (LAND_COVER_ALL_MUNICIPALITIES), which asks getLandCoverGeo
  // for the whole province at once (the backend simplifies more in that
  // case - see its own comment). Picking a new province resets both the
  // municipality selection and any previously loaded polygons/filter below.
  useEffect(() => {
    if (!landCoverOn || !selectedProvince || !selectedMunicipality) return
    const municipalityParam = selectedMunicipality === LAND_COVER_ALL_MUNICIPALITIES ? undefined : selectedMunicipality
    setLoadingLayer((prev) => ({ ...prev, landCover: true }))
    getLandCoverGeo(selectedProvince, municipalityParam)
      .then((data) => {
        setLandCover(data)
        setActiveCoverTypes(null)
        setLayerError((prev) => ({ ...prev, landCover: null }))
      })
      .catch(() => setLayerError((prev) => ({ ...prev, landCover: t('opendata.layerError') })))
      .finally(() => setLoadingLayer((prev) => ({ ...prev, landCover: false })))
  }, [landCoverOn, selectedProvince, selectedMunicipality, t])

  const landCoverTypesPresent = useMemo(() => {
    if (!landCover) return []
    return Array.from(new Set(landCover.features.map((f) => f.properties.coverType).filter(Boolean))).sort()
  }, [landCover])

  // "seleccionar cuales quiero ver" - same on/off-per-value filter pattern
  // as the facility subtype filter above, just keyed by cover_type instead.
  // activeCoverTypes stays null (meaning "show everything") until the user
  // actually unchecks something, so switching layers/municipalities never
  // starts out with things hidden.
  const visibleLandCoverFeatures = useMemo(() => {
    if (!landCover) return []
    if (!activeCoverTypes) return landCover.features
    return landCover.features.filter((f) => activeCoverTypes.has(f.properties.coverType))
  }, [landCover, activeCoverTypes])

  function toggleCoverType(coverType) {
    setActiveCoverTypes((prev) => {
      const base = prev ?? new Set(landCoverTypesPresent)
      const next = new Set(base)
      if (next.has(coverType)) next.delete(coverType)
      else next.add(coverType)
      return next
    })
  }

  const municipalityOptions = useMemo(() => {
    if (!landCoverMeta || !selectedProvince) return []
    return landCoverMeta.find((p) => p.province === selectedProvince)?.municipalities ?? []
  }, [landCoverMeta, selectedProvince])

  const geometryLayerIds = useMemo(() => new Set(['waste_facilities', 'hydrography', 'land_cover', 'protected_areas']), [])
  const otherLayers = layerMeta.filter((layer) => !geometryLayerIds.has(layer.id))
  const facilitiesMeta = layerMeta.find((layer) => layer.id === 'waste_facilities')
  const hydrographyMeta = layerMeta.find((layer) => layer.id === 'hydrography')
  const protectedAreasMeta = layerMeta.find((layer) => layer.id === 'protected_areas')

  // Groups facilities by canal (Industrial / Domestico), each with its
  // list of real subtypes + counts, for the sub-classification legend -
  // "como en la web de CyL": the same taxonomy the source data carries.
  const subtypeGroups = useMemo(() => {
    if (!facilities) return []
    const byCanal = new Map()
    facilities.features.forEach((feature) => {
      const canal = feature.properties.facilityType || t('opendata.facilityGeneric')
      const subtype = feature.properties.facilitySubtype || t('opendata.subtypeUnclassified')
      if (!byCanal.has(canal)) byCanal.set(canal, new Map())
      const subtypes = byCanal.get(canal)
      const key = subtypeKey(feature.properties)
      subtypes.set(key, { subtype, count: (subtypes.get(key)?.count ?? 0) + 1 })
    })
    return Array.from(byCanal.entries()).map(([canal, subtypes]) => ({
      canal,
      color: FACILITY_CANAL_COLORS[canal] ?? FACILITY_FALLBACK_COLOR,
      subtypes: Array.from(subtypes.entries())
        .map(([key, value]) => ({ key, ...value }))
        .sort((a, b) => b.count - a.count),
    }))
  }, [facilities, t])

  const visibleFacilities = useMemo(() => {
    if (!facilities) return []
    if (!activeSubtypes) return facilities.features
    return facilities.features.filter((f) => activeSubtypes.has(subtypeKey(f.properties)))
  }, [facilities, activeSubtypes])

  function toggleSubtype(key) {
    setActiveSubtypes((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  return (
    <div className="map-shell">
      <MapContainer
        center={CYL_CENTER}
        zoom={CYL_INITIAL_ZOOM}
        maxZoom={MAP_MAX_ZOOM}
        className="map-container"
        preferCanvas
      >
        {basemap === 'satellite' ? (
          <WMSTileLayer
            url={PNOA_WMS_URL}
            layers="OI.OrthoimageCoverage"
            format="image/jpeg"
            transparent={false}
            attribution="PNOA / IGN, CC BY 4.0 scne.es"
            maxZoom={MAP_MAX_ZOOM}
          />
        ) : (
          <TileLayer
            url={BASEMAPS[basemap].url}
            attribution={BASEMAPS[basemap].attribution}
            maxNativeZoom={BASEMAPS[basemap].maxNativeZoom}
            maxZoom={MAP_MAX_ZOOM}
          />
        )}

        <ScaleControl position="bottomleft" imperial={false} />

        {hydrographyOn && hydrography && (
          <GeoJSON
            key={`hydro-${hydrography.features.length}`}
            data={hydrography}
            style={hydrographyStyle}
            onEachFeature={(feature, layer) => {
              const props = feature.properties ?? {}
              const label = props.name || t('opendata.waterBodyGeneric')
              const typeLabel = t(`opendata.waterType.${props.waterType}`) ?? props.waterType
              layer.bindPopup(`<strong>${label}</strong><br />${typeLabel}`)
            }}
          />
        )}

        {protectedAreasOn && protectedAreas && (
          <GeoJSON
            key={`protected-${protectedAreas.features.length}`}
            data={protectedAreas}
            style={protectedAreaStyle}
            onEachFeature={(feature, layer) => {
              const props = feature.properties ?? {}
              const category = props.protectionCategory ? `<br />${props.protectionCategory}` : ''
              const area = props.declaredAreaHectares ? `<br />${Math.round(props.declaredAreaHectares).toLocaleString('es-ES')} ha` : ''
              layer.bindPopup(`<strong>${props.name || t('opendata.protectedAreaGeneric')}</strong>${category}${area}`)
            }}
          />
        )}

        {landCoverOn && landCover && visibleLandCoverFeatures.length > 0 && (
          <GeoJSON
            key={`landcover-${selectedProvince}-${selectedMunicipality}-${visibleLandCoverFeatures.length}`}
            data={{ type: 'FeatureCollection', features: visibleLandCoverFeatures }}
            style={(feature) => {
              const color = landCoverColor(feature?.properties?.coverType)
              return { color, weight: 0.5, fillColor: color, fillOpacity: 0.45 }
            }}
            onEachFeature={(feature, layer) => {
              const coverType = feature.properties?.coverType || t('opendata.landCoverUnclassified')
              layer.bindPopup(`<strong>${coverType}</strong>`)
            }}
          />
        )}

        {facilitiesOn && facilities && (
          <MarkerClusterGroup
            key={`facilities-${visibleFacilities.length}`}
            chunkedLoading
            maxClusterRadius={50}
            iconCreateFunction={clusterIcon('#4c8dff')}
          >
            {visibleFacilities.map((feature) => (
              <Marker
                key={`facility-${feature.properties.id}`}
                position={[feature.geometry.coordinates[1], feature.geometry.coordinates[0]]}
                icon={facilityIcon(
                  FACILITY_CANAL_COLORS[feature.properties.facilityType] ?? FACILITY_FALLBACK_COLOR,
                  subtypeIcon(feature.properties.facilitySubtype),
                )}
              >
                <Popup>
                  <strong>{feature.properties.name}</strong>
                  <br />
                  <span className="opendata-popup-subtype">
                    <span
                      className="opendata-subtype-icon"
                      style={{ background: FACILITY_CANAL_COLORS[feature.properties.facilityType] ?? FACILITY_FALLBACK_COLOR }}
                    >
                      <CIcon icon={subtypeIcon(feature.properties.facilitySubtype)} size="sm" />
                    </span>
                    {feature.properties.facilitySubtype || feature.properties.facilityType || t('opendata.facilityGeneric')}
                  </span>
                  {feature.properties.facilityType && feature.properties.facilitySubtype && (
                    <>
                      <br />
                      <span className="text-medium-emphasis">{feature.properties.facilityType}</span>
                    </>
                  )}
                  {(feature.properties.municipality || feature.properties.province) && (
                    <>
                      <br />
                      {[feature.properties.municipality, feature.properties.province].filter(Boolean).join(', ')}
                    </>
                  )}
                  {feature.properties.detailUrl && (
                    <>
                      <br />
                      <a href={feature.properties.detailUrl} target="_blank" rel="noreferrer">
                        {t('opendata.viewDetail')}
                      </a>
                    </>
                  )}
                </Popup>
              </Marker>
            ))}
          </MarkerClusterGroup>
        )}

        {detectionsOn && detections && (
          <MarkerClusterGroup
            key={`detections-${detections.features.length}`}
            chunkedLoading
            maxClusterRadius={40}
            iconCreateFunction={clusterIcon('#f9b115')}
          >
            {detections.features.map((feature) => (
              <Marker
                key={`detection-${feature.properties.id}`}
                position={[feature.geometry.coordinates[1], feature.geometry.coordinates[0]]}
                icon={dotIcon(STATUS_COLORS[feature.properties.classificationStatus] ?? '#f9b115', 16)}
              >
                <Popup>
                  <strong>{Math.round(feature.properties.confidence * 100)}%</strong>
                  <br />
                  {feature.properties.landCoverType ?? t('detections.noCoverage')}
                </Popup>
              </Marker>
            ))}
          </MarkerClusterGroup>
        )}
      </MapContainer>

      <div className="opendata-toolbar">
        <div className="map-layers-control opendata-basemap-control">
          <BasemapSwitcher basemap={basemap} onChange={setBasemap} t={t} />
        </div>
        <button type="button" className="glass-panel opendata-sources-btn" onClick={() => setShowSources(true)}>
          <CIcon icon={cilBook} size="sm" className="me-1" />
          {t('opendata.sourcesButton')}
        </button>
      </div>

      {showSources && (
        <div className="opendata-sources-overlay" onClick={() => setShowSources(false)}>
          <div className="glass-panel opendata-sources-modal" onClick={(e) => e.stopPropagation()}>
            <div className="opendata-sources-modal-header">
              <h3>{t('opendata.sourcesTitle')}</h3>
              <button type="button" className="opendata-icon-btn" onClick={() => setShowSources(false)} aria-label={t('opendata.close')}>
                <CIcon icon={cilX} size="sm" />
              </button>
            </div>
            <p className="opendata-sources-intro">{t('opendata.sourcesIntro')}</p>
            {layerMeta.map((layer) => (
              <div key={layer.id} className="opendata-source-entry">
                <strong>{layer.name}</strong>
                <span className="opendata-source-meta">
                  {layer.source} &middot; {layer.format}
                </span>
                {layer.url && (
                  <a href={layer.url} target="_blank" rel="noreferrer">
                    {layer.url}
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className={`glass-panel opendata-panel${legendCollapsed ? ' collapsed' : ''}`}>
        <div className="opendata-panel-header">
          <CIcon icon={cilGlobeAlt} size="lg" />
          <div>
            <h3>{t('opendata.panelTitle')}</h3>
            <p>{t('opendata.panelSubtitle')}</p>
          </div>
          <button
            type="button"
            className="opendata-panel-collapse-toggle"
            onClick={() => setLegendCollapsed((prev) => !prev)}
            aria-expanded={!legendCollapsed}
            aria-label={legendCollapsed ? t('opendata.legendExpand') : t('opendata.legendCollapse')}
            title={legendCollapsed ? t('opendata.legendExpand') : t('opendata.legendCollapse')}
          >
            <CIcon icon={legendCollapsed ? cilChevronBottom : cilChevronTop} size="lg" />
          </button>
        </div>

        {!legendCollapsed && (
          <>
            {metaError && <p className="text-danger small">{metaError}</p>}

            <div className="opendata-panel-section">
              <label className="opendata-layer-row">
                <input type="checkbox" checked={facilitiesOn} onChange={(e) => setFacilitiesOn(e.target.checked)} />
            <span className="opendata-legend-dot" style={{ background: '#4c8dff' }} />
            <span className="opendata-layer-label">
              {t('opendata.layerFacilities')}
              <small>{facilitiesMeta ? `${facilitiesMeta.recordCount} · ${t('opendata.point')}` : ''}</small>
            </span>
          </label>
          {loadingLayer.facilities && <p className="opendata-hint">{t('opendata.loading')}</p>}
          {layerError.facilities && <p className="opendata-hint text-danger">{layerError.facilities}</p>}

          {facilitiesOn && subtypeGroups.length > 0 && (
            <div className="opendata-subtypes">
              <button
                type="button"
                className="opendata-subtypes-toggle"
                onClick={() => setSubtypesExpanded((prev) => !prev)}
              >
                {subtypesExpanded ? t('opendata.subtypesHide') : t('opendata.subtypesShow')}
              </button>
              {subtypesExpanded && (
                <div className="opendata-subtypes-list">
                  {subtypeGroups.map((group) => (
                    <div key={group.canal} className="opendata-subtype-group">
                      <div className="opendata-subtype-group-title">
                        <span className="opendata-legend-dot" style={{ background: group.color }} />
                        {group.canal}
                      </div>
                      {group.subtypes.map((sub) => (
                        <label key={sub.key} className="opendata-subtype-row">
                          <input
                            type="checkbox"
                            checked={activeSubtypes?.has(sub.key) ?? true}
                            onChange={() => toggleSubtype(sub.key)}
                          />
                          <span className="opendata-subtype-icon" style={{ background: group.color }}>
                            <CIcon icon={subtypeIcon(sub.subtype)} size="sm" />
                          </span>
                          <span>{sub.subtype}</span>
                          <small>{sub.count}</small>
                        </label>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <label className="opendata-layer-row">
            <input type="checkbox" checked={hydrographyOn} onChange={(e) => setHydrographyOn(e.target.checked)} />
            <span className="opendata-legend-dot" style={{ background: '#3aa0ff' }} />
            <span className="opendata-layer-label">
              {t('opendata.layerHydrography')}
              <small>{hydrographyMeta ? `${hydrographyMeta.recordCount} · ${t('opendata.polygon')}` : ''}</small>
            </span>
          </label>
          {loadingLayer.hydrography && <p className="opendata-hint">{t('opendata.loading')}</p>}
          {layerError.hydrography && <p className="opendata-hint text-danger">{layerError.hydrography}</p>}

          <label className="opendata-layer-row">
            <input type="checkbox" checked={protectedAreasOn} onChange={(e) => setProtectedAreasOn(e.target.checked)} />
            <span className="opendata-legend-dot" style={{ background: PROTECTED_AREA_COLOR }} />
            <span className="opendata-layer-label">
              {t('opendata.layerProtectedAreas')}
              <small>
                {protectedAreasMeta
                  ? `${protectedAreas?.features.length ?? '…'} / ${protectedAreasMeta.recordCount} · ${t('opendata.polygon')}`
                  : ''}
              </small>
            </span>
          </label>
          {protectedAreasMeta?.note && <p className="opendata-hint">{protectedAreasMeta.note}</p>}
          {loadingLayer.protectedAreas && <p className="opendata-hint">{t('opendata.loading')}</p>}
          {layerError.protectedAreas && <p className="opendata-hint text-danger">{layerError.protectedAreas}</p>}
        </div>

        <div className="opendata-panel-section">
          <label className="opendata-layer-row">
            <input type="checkbox" checked={detectionsOn} onChange={(e) => setDetectionsOn(e.target.checked)} />
            <span className="opendata-legend-dot" style={{ background: '#f9b115' }} />
            <span className="opendata-layer-label">
              {t('opendata.layerDetections')}
              <small>{detections ? `${detections.features.length} · ${t('opendata.point')}` : ''}</small>
            </span>
          </label>
          {detectionsOn && (
            <div className="opendata-slider-row">
              <span>{t('opendata.confidenceLabel', { value: Math.round(minConfidence * 100) })}</span>
              <input
                type="range"
                min={0.75}
                max={1}
                step={0.01}
                value={minConfidence}
                onChange={(e) => setMinConfidence(Number(e.target.value))}
              />
            </div>
          )}
          {loadingLayer.detections && <p className="opendata-hint">{t('opendata.loading')}</p>}
          {layerError.detections && <p className="opendata-hint text-danger">{layerError.detections}</p>}
        </div>

        <div className="opendata-panel-section">
          <label className="opendata-layer-row">
            <input
              type="checkbox"
              checked={landCoverOn}
              onChange={(e) => setLandCoverOn(e.target.checked)}
            />
            <span className="opendata-legend-dot" style={{ background: '#5cb85c' }} />
            <span className="opendata-layer-label">
              {t('opendata.layerLandCover')}
              <small>{landCoverMeta ? t('opendata.landCoverProvinceCount', { count: landCoverMeta.length }) : ''}</small>
            </span>
          </label>

          {landCoverOn && landCoverMeta && landCoverMeta.length === 0 && (
            <p className="opendata-hint">{t('opendata.landCoverNoneLoaded')}</p>
          )}

          {landCoverOn && landCoverMeta && landCoverMeta.length > 0 && (
            <div className="opendata-landcover-selectors">
              <select
                className="opendata-select"
                value={selectedProvince}
                onChange={(e) => {
                  setSelectedProvince(e.target.value)
                  setSelectedMunicipality('')
                  setLandCover(null)
                }}
              >
                <option value="">{t('opendata.selectProvince')}</option>
                {landCoverMeta.map((p) => (
                  <option key={p.province} value={p.province}>
                    {p.province} ({p.totalCount})
                  </option>
                ))}
              </select>

              {selectedProvince && (
                <select
                  className="opendata-select"
                  value={selectedMunicipality}
                  onChange={(e) => setSelectedMunicipality(e.target.value)}
                >
                  <option value="">{t('opendata.selectMunicipality')}</option>
                  <option value={LAND_COVER_ALL_MUNICIPALITIES}>{t('opendata.allMunicipalities')}</option>
                  {municipalityOptions.map((m) => (
                    <option key={m.municipality} value={m.municipality}>
                      {m.municipality} ({m.count})
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          {loadingLayer.landCover && <p className="opendata-hint">{t('opendata.loading')}</p>}
          {layerError.landCover && <p className="opendata-hint text-danger">{layerError.landCover}</p>}

          {landCoverOn && landCoverTypesPresent.length > 0 && (
            <div className="opendata-subtypes">
              <button
                type="button"
                className="opendata-subtypes-toggle"
                onClick={() => setCoverTypesExpanded((prev) => !prev)}
              >
                {coverTypesExpanded ? t('opendata.landCoverFilterHide') : t('opendata.landCoverFilterShow')}
              </button>
              {coverTypesExpanded && (
                <div className="opendata-landcover-legend">
                  {landCoverTypesPresent.map((coverType) => (
                    <label key={coverType} className="opendata-landcover-legend-item opendata-subtype-row">
                      <input
                        type="checkbox"
                        checked={activeCoverTypes?.has(coverType) ?? true}
                        onChange={() => toggleCoverType(coverType)}
                      />
                      <span className="opendata-legend-dot" style={{ background: landCoverColor(coverType) }} />
                      {coverType}
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {otherLayers.length > 0 && (
          <div className="opendata-panel-section">
            <p className="opendata-panel-section-title">{t('opendata.otherDatasetsTitle')}</p>
            {otherLayers.map((layer) => (
              <div key={layer.id} className="opendata-layer-row opendata-layer-disabled">
                <CIcon icon={layer.status === 'pending' ? cilInfo : cilWarning} size="sm" />
                <span className="opendata-layer-label">
                  {layer.name}
                  <small>{layer.note || t('opendata.noGeometryYet')}</small>
                </span>
              </div>
            ))}
          </div>
        )}
          </>
        )}
      </div>
    </div>
  )
}

// Stable identity for a (facility_type, facility_subtype) pair, used as
// both the Set key for the subtype filter and the React key for its row.
function subtypeKey(properties) {
  return `${properties.facilityType ?? ''}|||${properties.facilitySubtype ?? ''}`
}

function BasemapSwitcher({ basemap, onChange, t }) {
  const [open, setOpen] = useState(false)
  const options = [
    { id: 'osm', label: t('layers.osm') },
    { id: 'topo', label: t('layers.topo') },
    { id: 'satellite', label: t('layers.pnoa') },
  ]
  return (
    <>
      {open && (
        <div className="glass-panel map-layers-popover">
          {options.map((option) => (
            <button
              key={option.id}
              type="button"
              className={`map-layers-option${basemap === option.id ? ' active' : ''}`}
              onClick={() => {
                onChange(option.id)
                setOpen(false)
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
      <button type="button" className={`glass-panel map-layers-button${open ? ' active' : ''}`} onClick={() => setOpen((v) => !v)}>
        <CIcon icon={cilLayers} size="sm" className="me-1" />
        {t('layers.button')}
      </button>
    </>
  )
}
