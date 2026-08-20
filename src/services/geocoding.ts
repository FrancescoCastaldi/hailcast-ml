import { Coordinates } from '../types/meteorology';

export interface GeocodingResult {
  name: string;
  coords: Coordinates;
  type: string;
}

const PRESET_CITIES: GeocodingResult[] = [
  { name: 'Milano, Lombardia', coords: { lat: 45.4642, lng: 9.1900 }, type: 'city' },
  { name: 'Verona, Veneto', coords: { lat: 45.4384, lng: 10.9916 }, type: 'city' },
  { name: 'Bologna, Emilia-Romagna', coords: { lat: 44.4949, lng: 11.3426 }, type: 'city' },
  { name: 'Padova, Veneto', coords: { lat: 45.4064, lng: 11.8768 }, type: 'city' },
  { name: 'Torino, Piemonte', coords: { lat: 45.0703, lng: 7.6869 }, type: 'city' },
  { name: 'Brescia, Lombardia', coords: { lat: 45.5416, lng: 10.2118 }, type: 'city' },
  { name: 'Vicenza, Veneto', coords: { lat: 45.5455, lng: 11.5354 }, type: 'city' },
  { name: 'Treviso, Veneto', coords: { lat: 45.6669, lng: 12.2430 }, type: 'city' },
  { name: 'Udine, Friuli-Venezia Giulia', coords: { lat: 46.0711, lng: 13.2346 }, type: 'city' },
  { name: 'Pordenone, Friuli-Venezia Giulia', coords: { lat: 45.9569, lng: 12.6605 }, type: 'city' },
  { name: 'Mantova, Lombardia', coords: { lat: 45.1564, lng: 10.7914 }, type: 'city' },
  { name: 'Modena, Emilia-Romagna', coords: { lat: 44.6471, lng: 10.9252 }, type: 'city' },
  { name: 'Reggio Emilia, Emilia-Romagna', coords: { lat: 44.6983, lng: 10.6312 }, type: 'city' },
  { name: 'Parma, Emilia-Romagna', coords: { lat: 44.8015, lng: 10.3279 }, type: 'city' },
  { name: 'Piacenza, Emilia-Romagna', coords: { lat: 45.0526, lng: 9.6929 }, type: 'city' },
  { name: 'Roma, Lazio', coords: { lat: 41.9028, lng: 12.4964 }, type: 'city' },
  { name: 'Firenze, Toscana', coords: { lat: 43.7696, lng: 11.2558 }, type: 'city' },
  { name: 'Napoli, Campania', coords: { lat: 40.8518, lng: 14.2681 }, type: 'city' }
];

export class GeocodingService {
  private static cache = new Map<string, GeocodingResult[]>();

  public static async search(query: string): Promise<GeocodingResult[]> {
    const q = query.trim().toLowerCase();
    if (!q || q.length < 2) return [];

    // 1. Ricerca rapida nei preset
    const localMatches = PRESET_CITIES.filter(c =>
      c.name.toLowerCase().includes(q)
    );

    if (this.cache.has(q)) {
      return this.cache.get(q)!;
    }

    try {
      // 2. Query ad OpenStreetMap Nominatim
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
        query
      )}&limit=5&addressdetails=1`;
      
      const response = await fetch(url, {
        headers: {
          'Accept-Language': 'it,en;q=0.8',
        }
      });

      if (!response.ok) {
        return localMatches;
      }

      const data = await response.json();
      const results: GeocodingResult[] = data.map((item: any) => ({
        name: item.display_name,
        coords: {
          lat: parseFloat(item.lat),
          lng: parseFloat(item.lon)
        },
        type: item.type || 'location'
      }));

      // Combina senza duplicati
      const combined = [...localMatches];
      for (const r of results) {
        if (!combined.some(c => Math.abs(c.coords.lat - r.coords.lat) < 0.05 && Math.abs(c.coords.lng - r.coords.lng) < 0.05)) {
          combined.push(r);
        }
      }

      this.cache.set(q, combined);
      return combined;
    } catch {
      return localMatches;
    }
  }
}
