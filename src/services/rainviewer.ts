import { RainViewerApiResponse, RainViewerFrame } from '../types/meteorology';

/**
 * Service per l'interazione con l'API radar open-source di RainViewer
 */
export class RainViewerService {
  private static API_URL = 'https://api.rainviewer.com/public/weather-maps.json';
  private static cachedData: RainViewerApiResponse | null = null;
  private static lastFetchTime: number = 0;
  private static CACHE_TTL_MS = 60 * 1000; // 1 minuto di cache

  /**
   * Recupera i metadati dei frame radar (passati e nowcast) da RainViewer
   */
  public static async fetchRadarData(): Promise<RainViewerApiResponse> {
    const now = Date.now();
    if (this.cachedData && (now - this.lastFetchTime) < this.CACHE_TTL_MS) {
      return this.cachedData;
    }

    try {
      const response = await fetch(this.API_URL);
      if (!response.ok) {
        throw new Error(`RainViewer API error: ${response.statusText}`);
      }
      const data: RainViewerApiResponse = await response.json();
      this.cachedData = data;
      this.lastFetchTime = now;
      return data;
    } catch (error) {
      console.warn('Impossibile contattare RainViewer API, utilizzo fallback simulato:', error);
      return this.getFallbackData();
    }
  }

  /**
   * Genera il template URL per il layer tile Leaflet
   * @param frame Frame radar contenente il timestamp
   * @param colorScheme 1: Original, 2: Universal Blue, 4: Meteored, 6: Rainbow (consigliato per dBZ)
   * @param smooth 1: Smussato, 0: Grezzo
   */
  public static getTileUrlTemplate(
    frame: RainViewerFrame,
    host: string = 'https://tilecache.rainviewer.com',
    colorScheme: number = 6,
    smooth: number = 1
  ): string {
    return `${host}/v2/radar/${frame.time}/256/{z}/{x}/{y}/${colorScheme}/${smooth}_1.png`;
  }

  /**
   * Dati di fallback nel caso in cui la rete esterna sia momentaneamente offline
   */
  private static getFallbackData(): RainViewerApiResponse {
    const nowSec = Math.floor(Date.now() / 1000);
    const pastFrames: RainViewerFrame[] = [];
    for (let i = 10; i >= 0; i--) {
      pastFrames.push({
        time: nowSec - (i * 600),
        path: `/v2/radar/${nowSec - (i * 600)}`
      });
    }

    const nowcastFrames: RainViewerFrame[] = [];
    for (let i = 1; i <= 6; i++) {
      nowcastFrames.push({
        time: nowSec + (i * 600),
        path: `/v2/radar/nowcast/${nowSec + (i * 600)}`
      });
    }

    return {
      version: '2.0',
      generated: nowSec,
      host: 'https://tilecache.rainviewer.com',
      radar: {
        past: pastFrames,
        nowcast: nowcastFrames
      }
    };
  }
}
