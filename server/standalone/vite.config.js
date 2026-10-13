import { roadWeatherPlugin } from '../providers/trafikverket/road-weather.js';
import { poiPlugin } from '../providers/pois.js';
import { reachabilityPlugin } from '../providers/reachability.js';
import { roadEventsPlugin } from '../providers/trafikverket/road-events.js';
import { localVoicePlugin } from '../providers/local-voice.js';
import { localAiPlugin } from '../providers/local-ai.js';
import { addressSearchPlugin } from '../providers/address-search.js';
import { airQualityPlugin } from '../providers/air-quality.js';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import { resolveAllowedHosts } from '../../build/allowedHosts.js';
import { createBrowserViteConfig } from '../../build/vite.js';
import { localProviderPlugins } from '../providers/local.js';
import { localMcpPlugin } from '../mcp/plugin.js';
import { apiNotFoundPlugin } from './api-not-found.js';
import { standaloneVoiceTools } from './voiceTools.js';
import { liveuamapPlugin } from '../providers/liveuamap.js';
import { gdacsPlugin } from '../providers/gdacs.js';
import { smhiPlugin } from '../providers/smhi.js';
import { smhiWeatherPlugin } from '../providers/smhi-weather.js';
import { mcfPlugin } from '../providers/mcf.js';
import { krisPlugin } from '../providers/kris.js';
import { slPlugin } from '../providers/sl.js';
import { timetablePlugin } from '../providers/timetables.js';
import { vasttrafikPlugin } from '../providers/vasttrafik.js';
import { topographyPlugin } from '../providers/topography.js';
import { policePlugin } from '../providers/polisen.js';

const root = fileURLToPath(new URL('../../', import.meta.url));

/** Load this checkout's configuration and attach its local provider middleware. */
export default defineConfig(({ command, mode }) => {
  const loaded = loadEnv(mode, root, '');
  for (const [key, value] of Object.entries(loaded)) {
    if (process.env[key] === undefined) process.env[key] = value;
  }
  return createBrowserViteConfig({
    plugins: [
      liveuamapPlugin(),
      gdacsPlugin(),
      smhiPlugin(),
      smhiWeatherPlugin(),
      mcfPlugin(),
      krisPlugin(),
      slPlugin(),
      ...['ul', 'otraf', 'varm', 'skane', 'jlt'].map((operator) =>
        slPlugin({ operator, route: `/api/regional/${operator}` }),
      ),
      timetablePlugin(),
      vasttrafikPlugin(),
      localVoicePlugin(),
      localAiPlugin(),
      addressSearchPlugin(),
      roadEventsPlugin(),
      roadWeatherPlugin(),
      poiPlugin(),
      reachabilityPlugin(),
      airQualityPlugin(),
      policePlugin(),
      topographyPlugin(),
      ...localProviderPlugins({ realtime: { tools: standaloneVoiceTools() } }),
      localMcpPlugin(),
      apiNotFoundPlugin(),
    ],
    googleApiKey: process.env.GOOGLE_MAPS_API_KEY,
    cesiumToken: process.env.CESIUM_ION_TOKEN,
    mapillaryToken: process.env.MAPILLARY_CLIENT_TOKEN,
    host: process.env.HOST,
    port: process.env.PORT,
    allowedHosts: resolveAllowedHosts(process.env.GEV_ALLOWED_HOSTS),
    command,
  });
});
