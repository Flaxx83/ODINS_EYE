import { createLocalAiLayer } from '../layers/local-ai/index.js';
import { createAirQualityLayer } from '../layers/air-quality/index.js';
import { resolveCatalogSources } from './sourceComposition.js';
import { createLiveuamapLayer } from '../layers/liveuamap/index.js';
import { createGdacsLayer } from '../layers/gdacs/index.js';
import { createSmhiLayer } from '../layers/smhi/index.js';
import { createSmhiObservations, createSmhiForecast, createSmhiRadar } from '../layers/smhi/weather.js';
import { createMcfLayers } from '../layers/mcf/index.js';
import { createKrisNews, createVmaLayer } from '../layers/kris/index.js';
import { createSlLayer } from '../layers/sl/index.js';
import { createStopsLayer } from '../layers/sl/stops.js';
import { createVasttrafikLayer } from '../layers/vasttrafik/index.js';
import { createTopographyLayers } from '../layers/topography/index.js';
import { createPoliceLayer } from '../layers/polisen/index.js';
import { createWeatherClock } from '../layers/weather/clock.js';
import { createWeatherLayer } from '../layers/weather/index.js';
import { createCyclonesLayer } from '../layers/cyclones/index.js';
import { createWindLayer } from '../layers/wind/index.js';
import { createLayerCatalog } from './catalog.js';
import { LAYER_STATE_REGISTRY } from '../data/layerState.js';
import { createMilitaryRegistry } from '../layers/aircraft/classification.js';
import { createApplicationFlights } from './layers/flights.js';
import { createApplicationMilitary } from './layers/militaryFlights.js';
import { createApplicationVessels } from './layers/aisLiveVessels.js';
import { createApplicationCctv } from './layers/cctv.js';
import { createApplicationRadio } from './layers/radio.js';
import { createApplicationTraffic } from './layers/traffic.js';
import { createApplicationBikeshare } from './layers/bikeshare.js';
import { createApplicationDirections } from './layers/directions.js';
import { createApplicationRecentImagery } from './layers/recentImagery.js';
import { createApplicationTransit } from './layers/transit.js';
import { createApplicationInstallations } from './layers/militaryInstallations.js';
import { createApplicationSatellites } from './layers/satellites.js';
import { createApplicationLaunches } from './layers/rocketLaunches.js';
import { createApplicationAlpr } from './layers/alprCameras.js';
import { createApplicationLocalAdsb } from './layers/localAdsb.js';
import { createApplicationAwareness } from './layers/militaryAwareness.js';
import { createApplicationFirms } from './layers/firms.js';
import { createApplicationEarthquakes } from './layers/earthquakes.js';
import { createApplicationFirePerimeters } from './layers/perimeters.js';
import { createApplicationCables } from './layers/submarineCables.js';
import { createApplicationStreetLevel } from './layers/streetLevel.js';
import { createInfrastructureLayers } from '../data/infrastructure.js';
import { localGeoJsonServices } from './localGeojsonServices.js';
import { createBhoteKoshiEventLayer } from '../data/bhoteKoshiEvent.js';
import { createBhoteKoshiLocatorLayer } from '../data/bhoteKoshiLocator.js';

/**
 * Hardware-local layers are registered like any other but never enter share
 * links or stored layer state: another browser cannot have this receiver.
 */
export const LOCAL_ONLY_LAYER_METADATA = Object.freeze([
  Object.freeze({ id: 'liveuamap', disposition: 'local-only' }),
  Object.freeze({ id: 'gdacs', disposition: 'local-only' }),
  Object.freeze({ id: 'smhi', disposition: 'local-only' }),
  Object.freeze({ id: 'sl-live', disposition: 'local-only' }),
  Object.freeze({ id:'vasttrafik',disposition:'local-only' }),
  Object.freeze({id:'local-ai',disposition:'local-only'}),
  Object.freeze({id:'air-quality',disposition:'local-only'}),
  Object.freeze({ id:'polisen',disposition:'local-only' }),
  ...['administrativindelning','kommunikation','hydrografi'].map(theme=>Object.freeze({id:'lm-'+theme,disposition:'local-only'})),
  ...['sweden-stops','sweden-transit'].map(id=>Object.freeze({id,disposition:'local-only'})),
  ...['kris-news','kris-vma'].map(id => Object.freeze({ id, disposition: 'local-only' })),
  ...['smhi-observations','smhi-forecast','smhi-radar'].map(id => Object.freeze({ id, disposition: 'local-only' })),
  ...['shelters','stations','flood','fire'].map(id => Object.freeze({ id: `mcf-${id}`, disposition: 'local-only' })),
  Object.freeze({ id: 'local-adsb', disposition: 'local-only' }),
]);

/** Serialization metadata for every layer the application catalog constructs. */
export const APPLICATION_LAYER_METADATA = Object.freeze([
  ...LAYER_STATE_REGISTRY,
  ...LOCAL_ONLY_LAYER_METADATA,
]);

/** Construct the current catalog without choosing any source provider.
 * Scene engines remain page-owned; layers and classification have this app's lifetime.
 * The manager owns layer destruction, while abort releases classification even if startup fails.
 */
export function createApplicationCatalog({
  surface,
  sources,
  signal,
  metadata = APPLICATION_LAYER_METADATA,
  vesselOptions,
  resolveAsset,
  nepalBoundaryResolver,
  streetLevelProviders,
}) {
  if (!signal?.addEventListener)
    throw new TypeError('An application lifetime signal is required');
  signal.throwIfAborted();
  if (!surface?.groundFloor || !surface?.terrain)
    throw new TypeError('Application surface services are required');

  const sourceComposition = resolveCatalogSources(sources);
  sources = sourceComposition.sources;
  const militaryRegistry = createMilitaryRegistry();
  const weatherClock = createWeatherClock();
  const dispose = () => {
    signal.removeEventListener('abort', dispose);
    militaryRegistry.dispose();
    weatherClock.destroy();
  };
  signal.addEventListener('abort', dispose, { once: true });
  try {
    if (sourceComposition.isConfigured('military'))
      militaryRegistry.configureSource(sources.military, { signal });
    const flights = createApplicationFlights({
      surface,
      source: sources.flights,
      militaryRegistry,
      resolveAsset,
    });
    const military = createApplicationMilitary({
      surface,
      source: sources.military,
      militaryRegistry,
      resolveAsset,
    });
    const vessels = createApplicationVessels({
      source: sources.vessels,
      options: vesselOptions,
    });
    const installations = createApplicationInstallations({
      surface,
      source: sources.installations,
    });
    const satellites = createApplicationSatellites({
      source: sources.satellites,
    });
    const catalog = createLayerCatalog(
      [
        createLiveuamapLayer(),
        createGdacsLayer(),
        createSmhiLayer(),
        createSlLayer(),
        createVasttrafikLayer(),
        createLocalAiLayer(), createAirQualityLayer(), createPoliceLayer(), ...createTopographyLayers(),
        createStopsLayer(),
        createSlLayer({id:'sweden-transit',name:'Sverige · Regiontrafik',operator:'otraf',regions:[['otraf','Östgötatrafiken'],['ul','UL · Uppsala'],['varm','Värmlandstrafik'],['skane','Skånetrafiken'],['jlt','Jönköpings länstrafik']]}),
        createKrisNews(),
        createVmaLayer(),
        createSmhiObservations(),
        createSmhiForecast(),
        createSmhiRadar(),
        ...createMcfLayers(),
        createBhoteKoshiEventLayer(),
        createBhoteKoshiLocatorLayer({
          boundaryResolver: nepalBoundaryResolver,
        }),
        flights,
        military,
        createApplicationLocalAdsb({
          surface,
          enrichment: sources.flights,
          displayParams: () => flights.getParams(),
          ...(resolveAsset ? { resolveAsset } : {}),
        }),
        createApplicationEarthquakes({ source: sources.earthquakes }),
        createApplicationFirePerimeters({
          source: sources['fire-perimeters'],
        }),
        createApplicationAlpr({ surface, source: sources.alpr }),
        createApplicationStreetLevel({
          surface,
          sources: { mapillary: sources.mapillary },
          providers: streetLevelProviders,
        }),
        satellites,
        createApplicationLaunches({ source: sources.launches, satellites }),
        createApplicationTraffic({ source: sources.traffic, surface }),
        createApplicationCctv({ surface, source: sources.cctv }),
        createApplicationRadio({ surface, source: sources.radio }),
        createApplicationTransit({ surface, source: sources.transit }),
        createApplicationBikeshare({ source: sources.bikeshare }),
        createApplicationDirections({ source: sources.directions }),
        createApplicationRecentImagery({ source: sources['recent-imagery'] }),
        vessels,
        installations,
        createApplicationAwareness({
          flights,
          military,
          vessels,
          installations,
        }),
        createWindLayer({ feed: sources.wind, clock: weatherClock }),
        createWeatherLayer({
          feed: sources.weather,
          id: 'weather-radar',
          clock: weatherClock,
        }),
        createWeatherLayer({
          feed: sources.weather,
          id: 'weather-satellite',
          clock: weatherClock,
        }),
        createWeatherLayer({
          feed: sources.weather,
          id: 'weather-lightning',
          clock: weatherClock,
        }),
        createCyclonesLayer({ feed: sources.cyclones }),
        ...createInfrastructureLayers(localGeoJsonServices),
        createApplicationCables({ source: sources.cables }),
        createApplicationFirms({
          surface,
          id: 'local-firms',
          name: 'FIRMS Active Fires',
          icon: '▲',
          source: 'NASA FIRMS · LIVE',
          feed: sources.firms,
        }),
      ],
      metadata,
    );
    return Object.freeze({
      ...catalog,
      getSourceAvailability: sourceComposition.createAvailabilityLookup(
        catalog.layers,
      ),
      militaryRegistry,
      surface,
      weatherClock,
    });
  } catch (error) {
    dispose();
    throw error;
  }
}



