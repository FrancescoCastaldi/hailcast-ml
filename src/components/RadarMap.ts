import L from 'leaflet';
import { Coordinates, RainViewerFrame, SpotterReport, StormCell } from '../types/meteorology';
import { RainViewerService } from '../services/rainviewer';

export class RadarMapComponent {
  private map!: L.Map;
  private baseLayers: { [key: string]: L.TileLayer } = {};
  private currentBaseLayerKey: string = 'dark';
  private radarLayer: L.TileLayer | null = null;
  private stormCellsLayerGroup: L.LayerGroup = L.layerGroup();
  private trajectoriesLayerGroup: L.LayerGroup = L.layerGroup();
  private spottersLayerGroup: L.LayerGroup = L.layerGroup();
  private markerLayerGroup: L.LayerGroup = L.layerGroup();

  private showRadar: boolean = true;
  private showVectors: boolean = true;
  private showSpotters: boolean = true;

  private onMapClickCallback?: (coords: Coordinates) => void;
  private onCellClickCallback?: (cell: StormCell) => void;

  constructor(elementId: string) {
    this.initMap(elementId);
  }

  private initMap(elementId: string): void {
    // Coordinate centrate sul Nord/Centro Italia (zona ad altissima frequenza temporalesca)
    const initialCenter: [number, number] = [45.2, 10.8];
    const initialZoom = 8;

    this.map = L.map(elementId, {
      center: initialCenter,
      zoom: initialZoom,
      zoomControl: false,
      attributionControl: true
    });

    // Aggiungi controlli zoom in basso a destra
    L.control.zoom({ position: 'bottomright' }).addTo(this.map);

    // Definisci le mappe base open-source
    this.baseLayers = {
      dark: L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://carto.com/">CARTO</a>, &copy; <a href="https://openstreetmap.org">OSM</a>',
        subdomains: 'abcd',
        maxZoom: 19
      }),
      satellite: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: '&copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
        maxZoom: 18
      }),
      street: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19
      }),
      topo: L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://opentopomap.org">OpenTopoMap</a>, &copy; <a href="https://openstreetmap.org">OSM</a>',
        maxZoom: 17
      })
    };

    // Imposta layer dark predefinito
    this.baseLayers.dark.addTo(this.map);

    // Aggiungi layer groups
    this.stormCellsLayerGroup.addTo(this.map);
    this.trajectoriesLayerGroup.addTo(this.map);
    this.spottersLayerGroup.addTo(this.map);
    this.markerLayerGroup.addTo(this.map);

    // Listener click sulla mappa
    this.map.on('click', (e: L.LeafletMouseEvent) => {
      if (this.onMapClickCallback) {
        this.onMapClickCallback({ lat: e.latlng.lat, lng: e.latlng.lng });
      }
    });
  }

  public setMapClickHandler(callback: (coords: Coordinates) => void): void {
    this.onMapClickCallback = callback;
  }

  public setCellClickHandler(callback: (cell: StormCell) => void): void {
    this.onCellClickCallback = callback;
  }

  /**
   * Aggiorna il layer radar visualizzato in base al frame selezionato
   */
  public updateRadarFrame(frame: RainViewerFrame, host: string = 'https://tilecache.rainviewer.com'): void {
    if (!this.showRadar) return;

    const tileUrl = RainViewerService.getTileUrlTemplate(frame, host, 6, 1);
    
    if (this.radarLayer) {
      this.map.removeLayer(this.radarLayer);
    }

    this.radarLayer = L.tileLayer(tileUrl, {
      opacity: 0.72,
      minZoom: 1,
      maxNativeZoom: 6,
      maxZoom: 19,
      zIndex: 200,
      tileSize: 256
    });

    this.radarLayer.addTo(this.map);
  }

  /**
   * Disegna le celle temporalesche, i nuclei convettivi e i popup telemetrici
   */
  public renderStormCells(cells: StormCell[]): void {
    this.stormCellsLayerGroup.clearLayers();
    this.trajectoriesLayerGroup.clearLayers();

    for (const cell of cells) {
      // 1. Poligono nucleo riflettente
      const latLngs = cell.polygon.map(c => [c.lat, c.lng] as [number, number]);
      const color = this.getDbzColor(cell.maxDbz);
      
      const polygon = L.polygon(latLngs, {
        color: color,
        weight: 2.5,
        fillColor: color,
        fillOpacity: 0.38,
        dashArray: cell.trend === 'intensifying' ? '4, 4' : undefined
      });

      polygon.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        if (this.onCellClickCallback) {
          this.onCellClickCallback(cell);
        }
      });

      const sizeNickname = this.getSizeNickname(cell.meshDiameterCm);

      polygon.bindTooltip(`
        <div class="cell-tooltip">
          <div class="tooltip-title-row">
            <span class="tooltip-icon">❄️</span>
            <strong>${cell.name}</strong>
          </div>
          <div class="tooltip-hail-highlight severity-${cell.severity}">
            <div class="hail-highlight-label">STIMA GRANDINE:</div>
            <div class="hail-highlight-val"><strong>${cell.meshDiameterCm} cm</strong> <span>(${sizeNickname})</span></div>
          </div>
          <div class="tooltip-info-grid">
            <div>Probabilità: <b>${cell.pohPercentage}%</b></div>
            <div>Intensità: <b>${cell.maxDbz} dBZ</b></div>
            <div>Avanzamento: <b>${cell.velocity.speedKmh} km/h</b></div>
            <div>Direzione: <b>${Math.round(cell.velocity.directionDeg)}°</b></div>
          </div>
        </div>
      `, { sticky: true, className: 'custom-map-tooltip' });

      this.stormCellsLayerGroup.addLayer(polygon);

      // 2. Marker centrale con indicatore chiaro di GRANDINE (Icona + Diametro + Oggetto)
      const centerIcon = L.divIcon({
        className: 'storm-center-icon',
        html: `
          <div class="hail-map-badge severity-${cell.severity}" title="Grandine: ${cell.meshDiameterCm} cm (${sizeNickname})">
            <div class="badge-top-row">
              <span class="badge-hail-icon">❄️</span>
              <span class="badge-hail-size">${cell.meshDiameterCm > 0 ? cell.meshDiameterCm + ' cm' : 'Pioggia'}</span>
            </div>
            <div class="badge-bottom-row">
              <span class="badge-obj-name">${sizeNickname}</span>
              <span class="badge-dbz-pill">${cell.maxDbz} dBZ</span>
            </div>
          </div>
        `,
        iconSize: [110, 44],
        iconAnchor: [55, 22]
      });

      const centerMarker = L.marker([cell.centroid.lat, cell.centroid.lng], { icon: centerIcon });
      centerMarker.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        if (this.onCellClickCallback) {
          this.onCellClickCallback(cell);
        }
      });
      this.stormCellsLayerGroup.addLayer(centerMarker);

      // 3. Vettori di traiettoria e coni di nowcasting
      if (this.showVectors) {
        this.renderTrajectoryAndCones(cell);
      }
    }
  }

  private getSizeNickname(diamCm: number): string {
    if (diamCm < 1.0) return 'Granella';
    if (diamCm < 2.2) return 'Moneta 1€';
    if (diamCm < 3.5) return 'Noce';
    if (diamCm < 5.2) return 'Pallina Golf';
    if (diamCm < 7.0) return 'Uovo';
    return 'Tennis / Gigante';
  }

  /**
   * Disegna le proiezioni coniche a 15, 30, 45, 60 minuti
   */
  private renderTrajectoryAndCones(cell: StormCell): void {
    const startPoint: [number, number] = [cell.centroid.lat, cell.centroid.lng];

    // Coni di probabilità d'impatto a ventaglio
    for (const cone of cell.nowcastCones) {
      const coneLatLngs = cone.polygon.map(c => [c.lat, c.lng] as [number, number]);
      const opacity = Math.max(0.08, 0.28 - (cone.minutesAhead * 0.003));

      const conePoly = L.polygon(coneLatLngs, {
        color: '#ff3366',
        weight: 1,
        fillColor: '#ff3366',
        fillOpacity: opacity,
        dashArray: '3, 6'
      });

      this.trajectoriesLayerGroup.addLayer(conePoly);

      // Marker con tempo stimato sul centroide futuro
      const timeIcon = L.divIcon({
        className: 'nowcast-time-icon',
        html: `<div class="time-pill">+${cone.minutesAhead}m</div>`,
        iconSize: [34, 18],
        iconAnchor: [17, 9]
      });

      const timeMarker = L.marker([cone.projectedCentroid.lat, cone.projectedCentroid.lng], { icon: timeIcon });
      this.trajectoriesLayerGroup.addLayer(timeMarker);
    }

    // Linea principale del vettore di avanzamento (60 min)
    const end60 = cell.nowcastCones[cell.nowcastCones.length - 1]?.projectedCentroid;
    if (end60) {
      const vectorLine = L.polyline([startPoint, [end60.lat, end60.lng]], {
        color: '#ff9900',
        weight: 3,
        dashArray: '6, 6'
      });
      this.trajectoriesLayerGroup.addLayer(vectorLine);
    }
  }

  /**
   * Disegna i marker delle segnalazioni spotter a terra
   */
  public renderSpotterReports(reports: SpotterReport[]): void {
    this.spottersLayerGroup.clearLayers();
    if (!this.showSpotters) return;

    for (const rep of reports) {
      const icon = L.divIcon({
        className: 'spotter-report-icon',
        html: `
          <div class="spotter-pin" title="Segnalazione Grandine: ${rep.hailSizeCm} cm">
            <span class="spotter-emoji">❄️</span>
            <span class="spotter-size">${rep.hailSizeCm}cm</span>
          </div>
        `,
        iconSize: [34, 34],
        iconAnchor: [17, 17]
      });

      const marker = L.marker([rep.coords.lat, rep.coords.lng], { icon });
      marker.bindPopup(`
        <div class="spotter-popup">
          <div class="popup-title">📍 ${rep.locationName}</div>
          <div class="popup-time">🕒 Segnalato alle ore ${rep.timestamp}</div>
          <div class="popup-detail">
            <strong>Diametro Grandine:</strong> <span class="hail-highlight">${rep.hailSizeCm} cm</span>
          </div>
          <div class="popup-detail">
            <strong>Danni:</strong> ${rep.damageLevel}
          </div>
          <div class="popup-notes">"${rep.notes}"</div>
        </div>
      `);

      this.spottersLayerGroup.addLayer(marker);
    }
  }

  /**
   * Posiziona un marker evidenziatore sulla località cercata o cliccata
   */
  public highlightLocation(coords: Coordinates, name: string): void {
    this.markerLayerGroup.clearLayers();

    const targetIcon = L.divIcon({
      className: 'search-target-icon',
      html: `
        <div class="target-pulse-wrapper">
          <div class="target-pulse"></div>
          <div class="target-center"></div>
        </div>
      `,
      iconSize: [32, 32],
      iconAnchor: [16, 16]
    });

    const marker = L.marker([coords.lat, coords.lng], { icon: targetIcon });
    marker.bindPopup(`<strong>${name}</strong><br/>Lat: ${coords.lat.toFixed(4)}, Lng: ${coords.lng.toFixed(4)}`);
    this.markerLayerGroup.addLayer(marker);
    this.map.panTo([coords.lat, coords.lng], { animate: true, duration: 0.8 });
  }

  public toggleRadar(show: boolean): void {
    this.showRadar = show;
    if (this.radarLayer) {
      if (show) {
        this.radarLayer.addTo(this.map);
      } else {
        this.map.removeLayer(this.radarLayer);
      }
    }
  }

  public toggleVectors(show: boolean): void {
    this.showVectors = show;
    if (show) {
      this.trajectoriesLayerGroup.addTo(this.map);
    } else {
      this.map.removeLayer(this.trajectoriesLayerGroup);
    }
  }

  public toggleSpotters(show: boolean): void {
    this.showSpotters = show;
    if (show) {
      this.spottersLayerGroup.addTo(this.map);
    } else {
      this.map.removeLayer(this.spottersLayerGroup);
    }
  }

  public cycleBasemap(): string {
    const keys = Object.keys(this.baseLayers);
    const currentIndex = keys.indexOf(this.currentBaseLayerKey);
    const nextIndex = (currentIndex + 1) % keys.length;
    const nextKey = keys[nextIndex];

    this.map.removeLayer(this.baseLayers[this.currentBaseLayerKey]);
    this.baseLayers[nextKey].addTo(this.map);
    this.currentBaseLayerKey = nextKey;
    return nextKey;
  }

  public resetView(): void {
    this.map.setView([45.2, 10.8], 8, { animate: true });
  }

  public flyTo(coords: Coordinates, zoom: number = 10): void {
    this.map.flyTo([coords.lat, coords.lng], zoom, { animate: true, duration: 1.2 });
  }

  private getDbzColor(dbz: number): string {
    if (dbz >= 65) return '#d600d6'; // Viola intenso / Grandine estrema
    if (dbz >= 60) return '#ff0000'; // Rosso acceso / Grandine severa
    if (dbz >= 55) return '#ff6600'; // Arancio / Grandine probabile
    if (dbz >= 50) return '#ffcc00'; // Giallo
    if (dbz >= 40) return '#00cc00'; // Verde
    return '#0099ff';                // Blu / Pioggia leggera
  }
}
