import L from 'leaflet';
import { Coordinates, RainViewerFrame, SpotterReport, StormCell, HailGenesisForecast } from '../types/meteorology';
import { RainViewerService } from '../services/rainviewer';
import { ProtezioneCivileService, DPC_RADAR_NETWORK } from '../services/protezione-civile';
import { WeatherFXOverlay } from './WeatherFXOverlay';

export class RadarMapComponent {
  private map!: L.Map;
  private baseLayers: { [key: string]: L.TileLayer } = {};
  private currentBaseLayerKey: string = 'dark';
  private radarLayer: L.TileLayer | null = null;
  private stormCellsLayerGroup: L.LayerGroup = L.layerGroup();
  private trajectoriesLayerGroup: L.LayerGroup = L.layerGroup();
  private spottersLayerGroup: L.LayerGroup = L.layerGroup();
  private markerLayerGroup: L.LayerGroup = L.layerGroup();
  private dpcStationsLayerGroup: L.LayerGroup = L.layerGroup();
  private genesisLayerGroup: L.LayerGroup = L.layerGroup();
  private historyTrailsLayerGroup: L.LayerGroup = L.layerGroup();

  private showRadar: boolean = true;
  private showVectors: boolean = true;
  private showSpotters: boolean = true;
  private radarSource: 'rainviewer' | 'dpc-vmi' | 'dpc-sri' = 'rainviewer';
  private radarColorScheme: number = 6; // 6: Rainbow NEXRAD HD
  private dualPolMode: 'reflectivity' | 'zdr' | 'correlation_coefficient' = 'reflectivity';
  private appMode: 'hail' | 'storm' = 'hail';
  private cachedCells: StormCell[] = [];
  private lastRainViewerFrame?: RainViewerFrame;
  private lastHost?: string;

  private currentOffsetMinutes: number = 0;
  private currentVelocity?: { speedKmh: number; directionDeg: number };

  private onMapClickCallback?: (coords: Coordinates) => void;
  private onCellClickCallback?: (cell: StormCell) => void;
  private onGenesisClickCallback?: (forecast: HailGenesisForecast) => void;

  constructor(elementId: string) {
    this.initMap(elementId);
  }

  public setDualPolMode(mode: 'reflectivity' | 'zdr' | 'correlation_coefficient'): void {
    this.dualPolMode = mode;
    if (this.cachedCells.length > 0) {
      this.renderStormCells(this.cachedCells);
    }
  }

  public setRadarColorScheme(scheme: number): void {
    this.radarColorScheme = scheme;
    if (this.lastRainViewerFrame) {
      this.updateRadarFrame(this.lastRainViewerFrame, this.lastHost, this.currentOffsetMinutes, this.currentVelocity);
    }
  }

  public setAppMode(mode: 'hail' | 'storm'): void {
    this.appMode = mode;
    if (this.cachedCells.length > 0) {
      this.renderStormCells(this.cachedCells);
    }
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

    // Crea pane dedicato per il radar con z-index e proprietà CSS per traslazione fluida
    const radarPane = this.map.createPane('radarPane');
    radarPane.style.zIndex = '250';
    radarPane.style.pointerEvents = 'none';
    radarPane.style.transition = 'transform 0.15s ease-out';

    // Aggiungi layer groups
    this.stormCellsLayerGroup.addTo(this.map);
    this.trajectoriesLayerGroup.addTo(this.map);
    this.genesisLayerGroup.addTo(this.map);
    this.spottersLayerGroup.addTo(this.map);
    this.markerLayerGroup.addTo(this.map);
    this.dpcStationsLayerGroup.addTo(this.map);
    this.initDpcStations();

    // Listener click sulla mappa
    this.map.on('click', (e: L.LeafletMouseEvent) => {
      if (this.onMapClickCallback) {
        this.onMapClickCallback({ lat: e.latlng.lat, lng: e.latlng.lng });
      }
    });

    // Riapplica la traslazione del radar durante pan e zoom
    this.map.on('move', () => this.applyRadarDisplacement());
    this.map.on('zoomend', () => this.applyRadarDisplacement());
  }

  public setMapClickHandler(callback: (coords: Coordinates) => void): void {
    this.onMapClickCallback = callback;
  }

  public setCellClickHandler(callback: (cell: StormCell) => void): void {
    this.onCellClickCallback = callback;
  }

  public setGenesisClickHandler(callback: (forecast: HailGenesisForecast) => void): void {
    this.onGenesisClickCallback = callback;
  }

  /**
   * Imposta la sorgente radar (RainViewer o Protezione Civile DPC VMI/SRI)
   */
  public setRadarSource(source: 'rainviewer' | 'dpc-vmi' | 'dpc-sri'): void {
    this.radarSource = source;
    if (this.lastRainViewerFrame) {
      this.updateRadarFrame(this.lastRainViewerFrame, this.lastHost, this.currentOffsetMinutes, this.currentVelocity);
    }
  }

  /**
   * Aggiorna il layer radar visualizzato in base al frame selezionato e alla propagazione
   */
  public updateRadarFrame(
    frame: RainViewerFrame,
    host: string = 'https://tilecache.rainviewer.com',
    offsetMinutes: number = 0,
    velocity?: { speedKmh: number; directionDeg: number }
  ): void {
    this.lastRainViewerFrame = frame;
    this.lastHost = host;
    this.currentOffsetMinutes = offsetMinutes;
    if (velocity) this.currentVelocity = velocity;
    if (!this.showRadar) return;

    if (this.radarLayer) {
      this.map.removeLayer(this.radarLayer);
    }

    if (this.radarSource === 'dpc-vmi' || this.radarSource === 'dpc-sri') {
      const layerName = this.radarSource === 'dpc-vmi' ? ProtezioneCivileService.LAYERS.VMI : ProtezioneCivileService.LAYERS.SRI;
      const tileUrl = ProtezioneCivileService.getTileUrlTemplate(layerName);
      this.radarLayer = L.tileLayer(tileUrl, {
        pane: 'radarPane',
        opacity: 0.88,
        minZoom: 1,
        maxNativeZoom: 12,
        maxZoom: 19,
        tileSize: 256,
        attribution: '&copy; Dipartimento Protezione Civile (DPC) &mdash; Mosaico Nazionale'
      });
    } else {
      const tileUrl = RainViewerService.getTileUrlTemplate(frame, host, this.radarColorScheme, 1);
      this.radarLayer = L.tileLayer(tileUrl, {
        pane: 'radarPane',
        opacity: 0.86,
        minZoom: 1,
        maxNativeZoom: 6,
        maxZoom: 19,
        tileSize: 256
      });
    }

    this.radarLayer.addTo(this.map);
    this.applyRadarDisplacement();
  }

  /**
   * Applica lo spostamento dinamico del radar coerentemente con il vento convettivo
   */
  private applyRadarDisplacement(): void {
    const pane = this.map.getPane('radarPane');
    if (!pane) return;

    if (this.currentOffsetMinutes === 0) {
      pane.style.transform = '';
      return;
    }

    const speedKmh = this.currentVelocity?.speedKmh || 48;
    const dirDeg = this.currentVelocity?.directionDeg || 76;
    const dirRad = (dirDeg * Math.PI) / 180;
    
    const distanceKm = speedKmh * (this.currentOffsetMinutes / 60);
    const dLat = (distanceKm * Math.cos(dirRad)) / 111.32;
    const dLng = (distanceKm * Math.sin(dirRad)) / (111.32 * Math.cos((45.2 * Math.PI) / 180));

    const center = this.map.getCenter();
    const p1 = this.map.latLngToLayerPoint(center);
    const p2 = this.map.latLngToLayerPoint([center.lat + dLat, center.lng + dLng]);

    const dx = Math.round(p2.x - p1.x);
    const dy = Math.round(p2.y - p1.y);

    pane.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
  }

  /**
   * Disegna le celle temporalesche, i nuclei convettivi e i popup telemetrici
   */
  public renderStormCells(cells: StormCell[]): void {
    this.cachedCells = cells;
    this.stormCellsLayerGroup.clearLayers();
    this.trajectoriesLayerGroup.clearLayers();

    const activeCells = cells.filter(c => !c.isDissipated);

    for (const cell of activeCells) {
      // 1. Poligono nucleo riflettente o polarimetrico
      const latLngs = cell.polygon.map(c => [c.lat, c.lng] as [number, number]);
      
      // Calcolo polarimetrico Dual-Pol se non precalcolato
      const isGiantHail = cell.meshDiameterCm >= 4.0 || cell.maxDbz >= 62;
      const isHail = cell.meshDiameterCm >= 2.0;
      const zdrVal = cell.dualPol?.zdrDb !== undefined ? cell.dualPol.zdrDb : (isGiantHail ? 0.1 : isHail ? 0.6 : (cell.maxDbz > 50 ? 2.8 : 1.2));
      const ccVal = cell.dualPol?.cc !== undefined ? cell.dualPol.cc : (isGiantHail ? 0.86 : isHail ? 0.91 : 0.98);

      let color = this.getDbzColor(cell.maxDbz);
      let metricLabel = `${cell.maxDbz} dBZ`;

      if (this.appMode === 'storm') {
        // Modalità Perturbazioni: palette ciano/blu/smeraldo idrometeore
        color = cell.maxDbz >= 48 ? '#2563eb' : (cell.maxDbz >= 42 ? '#0284c7' : '#06b6d4');
      } else {
        if (this.dualPolMode === 'zdr') {
          color = this.getZdrColor(zdrVal);
          metricLabel = `ZDR ${zdrVal.toFixed(1)} dB (${zdrVal < 1.0 ? 'Grandine Sferica' : 'Gocce Piatte'})`;
        } else if (this.dualPolMode === 'correlation_coefficient') {
          color = this.getCcColor(ccVal);
          metricLabel = `CC ${ccVal.toFixed(2)} (${ccVal < 0.92 ? 'Fase Mista / Grandine' : 'Pioggia Uniforme'})`;
        }
      }
      
      const polygon = L.polygon(latLngs, {
        color: this.appMode === 'storm' ? '#38bdf8' : color,
        weight: this.appMode === 'storm' ? 3 : 2.5,
        fillColor: color,
        fillOpacity: this.appMode === 'storm' ? 0.35 : 0.42,
        dashArray: cell.trend === 'intensifying' ? '4, 4' : undefined
      });

      const rainMmH = cell.rainIntensityMmH || Math.round(18 + (cell.maxDbz - 38) * 3);
      const sizeNickname = this.getSizeNickname(cell.meshDiameterCm);

      polygon.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        const fxType = this.appMode === 'storm' ? 'rain' : (cell.meshDiameterCm >= 1.0 ? 'hail' : (cell.maxDbz >= 48 ? 'rain' : 'wind'));
        WeatherFXOverlay.getInstance().show({
          type: fxType,
          title: cell.name,
          intensity: this.appMode === 'storm' 
            ? `Intensità: ${rainMmH} mm/h • Vento ${Math.round(cell.velocity.speedKmh * 1.3)} km/h`
            : (cell.meshDiameterCm >= 1.0 
                ? `Chicchi MESH: ${cell.meshDiameterCm} cm (${sizeNickname})` 
                : `Riflettività ${cell.maxDbz} dBZ • Pioggia violenta`),
          detail: `Avanzamento a ${cell.velocity.speedKmh} km/h verso ${Math.round(cell.velocity.directionDeg)}° • In rotta: ${cell.impactedTowns?.slice(0, 3).join(', ') || 'aree limitrofe'}`,
          loop: fxType === 'hail'
        });

        if (this.onCellClickCallback) {
          this.onCellClickCallback(cell);
        }
      });

      if (this.appMode === 'storm') {
        polygon.bindTooltip(`
          <div class="cell-tooltip">
            <div class="tooltip-title-row">
              <span class="tooltip-icon">🌧️</span>
              <strong>${cell.name}</strong>
            </div>
            <div class="tooltip-hail-highlight severity-moderate" style="background: rgba(2, 132, 199, 0.2); border-left-color: #0284c7;">
              <div class="hail-highlight-label">PRECIPITAZIONE ATTESA:</div>
              <div class="hail-highlight-val"><strong style="color: #38bdf8;">${rainMmH} mm/h</strong> <span>(${cell.maxDbz >= 46 ? 'Forte / Nubifragio' : 'Moderata'})</span></div>
            </div>
            <div class="tooltip-info-grid">
              <div>Riflettività: <b>${cell.maxDbz} dBZ</b></div>
              <div>Raffica Vento: <b>~${Math.round(cell.velocity.speedKmh * 1.35)} km/h</b></div>
              <div>Avanzamento: <b>${cell.velocity.speedKmh} km/h</b></div>
              <div>Direzione: <b>${Math.round(cell.velocity.directionDeg)}°</b></div>
            </div>
            ${cell.impactedTowns && cell.impactedTowns.length > 0 ? `
              <div class="tooltip-towns-row">
                <span class="towns-icon">📍</span>
                <span><b>Comuni in rotta:</b> ${cell.impactedTowns.join(', ')}</span>
              </div>
            ` : ''}
          </div>
        `, { sticky: true, className: 'custom-map-tooltip' });
      } else {
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
              <div>Modalità: <b>${this.dualPolMode.toUpperCase()}</b></div>
              <div>Dato Polarimetrico: <b>${metricLabel}</b></div>
              <div>Riflettività: <b>${cell.maxDbz} dBZ</b></div>
              <div>Probabilità POH: <b>${cell.pohPercentage}%</b></div>
              <div>Avanzamento: <b>${cell.velocity.speedKmh} km/h</b></div>
              <div>Direzione: <b>${Math.round(cell.velocity.directionDeg)}°</b></div>
            </div>
            ${cell.impactedTowns && cell.impactedTowns.length > 0 ? `
              <div class="tooltip-towns-row">
                <span class="towns-icon">📍</span>
                <span><b>In rotta:</b> ${cell.impactedTowns.join(', ')}</span>
              </div>
            ` : ''}
          </div>
        `, { sticky: true, className: 'custom-map-tooltip' });
      }

      this.stormCellsLayerGroup.addLayer(polygon);

      // 2. Marker centrale con indicatore dinamico
      const stage = cell.formationStage || (cell.isNew ? 'new_initiation' : 'established');
      const isNew = stage === 'new_initiation';
      let stageBadgeHtml = '';
      if (stage === 'new_initiation') {
        stageBadgeHtml = '<div class="new-genesis-tag">⚡ NUOVO SVILUPPO</div>';
      } else if (stage === 'rapid_intensification') {
        stageBadgeHtml = '<div class="new-genesis-tag" style="background: linear-gradient(90deg, #ff0055, #ff7700); color: #fff;">🚀 IN CRESCITA</div>';
      } else if (stage === 'dissipating') {
        stageBadgeHtml = '<div class="new-genesis-tag" style="background: #475569; color: #cbd5e1;">🌫️ DISSOLVIMENTO</div>';
      }

      let centerIcon: L.DivIcon;

      if (this.appMode === 'storm') {
        centerIcon = L.divIcon({
          className: 'storm-center-icon mode-perturbation-marker',
          html: `
            <div class="perturbation-map-badge" title="Pioggia: ${rainMmH} mm/h (${cell.maxDbz} dBZ)">
              <div class="badge-top-row">
                <span class="badge-rain-icon">🌧️</span>
                <span class="badge-rain-val">${rainMmH} mm/h</span>
              </div>
              <div class="badge-bottom-row">
                <span class="badge-rain-status">${cell.maxDbz >= 46 ? 'Nubifragio' : 'Pioggia'}</span>
                <span class="badge-dbz-pill">${cell.maxDbz} dBZ</span>
              </div>
            </div>
          `,
          iconSize: [116, 44],
          iconAnchor: [58, 22]
        });
      } else {
        centerIcon = L.divIcon({
          className: `storm-center-icon ${isNew ? 'new-trajectory-marker' : ''}`,
          html: `
            <div class="hail-map-badge severity-${cell.severity} ${isNew ? 'pulse-new-genesis' : ''}" title="Grandine: ${cell.meshDiameterCm} cm (${sizeNickname})">
              ${stageBadgeHtml}
              <div class="badge-top-row">
                <span class="badge-hail-icon">${isNew ? '⚡' : '❄️'}</span>
                <span class="badge-hail-size">${cell.meshDiameterCm > 0 ? cell.meshDiameterCm + ' cm' : 'Pioggia'}</span>
              </div>
              <div class="badge-bottom-row">
                <span class="badge-obj-name">${sizeNickname}</span>
                <span class="badge-dbz-pill">${cell.maxDbz} dBZ</span>
              </div>
            </div>
          `,
          iconSize: [stage !== 'established' ? 124 : 110, stage !== 'established' ? 56 : 44],
          iconAnchor: [stage !== 'established' ? 62 : 55, stage !== 'established' ? 28 : 22]
        });
      }

      const centerMarker = L.marker([cell.centroid.lat, cell.centroid.lng], { icon: centerIcon });
      centerMarker.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        const fxType = this.appMode === 'storm' ? 'rain' : (cell.meshDiameterCm >= 1.0 ? 'hail' : (cell.maxDbz >= 48 ? 'rain' : 'wind'));
        WeatherFXOverlay.getInstance().show({
          type: fxType,
          title: cell.name,
          intensity: this.appMode === 'storm'
            ? `Precipitazione: ${rainMmH} mm/h (${cell.maxDbz} dBZ)`
            : (cell.meshDiameterCm >= 1.0 
                ? `Grandine stimata: ${cell.meshDiameterCm} cm (${sizeNickname})` 
                : `Nubifragio radar ${cell.maxDbz} dBZ`),
          detail: `Avanzamento a ${cell.velocity.speedKmh} km/h verso ${Math.round(cell.velocity.directionDeg)}° • In rotta: ${cell.impactedTowns?.slice(0, 3).join(', ') || 'aree limitrofe'}`,
          loop: fxType === 'hail'
        });

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

  /**
   * Centra e adatta dinamicamente la visuale della mappa sulle celle o perturbazioni attive
   */
  public fitToActiveCells(cells: StormCell[]): void {
    if (!this.map || !cells || cells.length === 0) return;
    try {
      const latLngs: [number, number][] = [];
      for (const cell of cells) {
        latLngs.push([cell.centroid.lat, cell.centroid.lng]);
        if (cell.polygon && cell.polygon.length > 0) {
          for (const p of cell.polygon) {
            latLngs.push([p.lat, p.lng]);
          }
        }
      }
      if (latLngs.length > 0) {
        const bounds = L.latLngBounds(latLngs);
        this.map.flyToBounds(bounds, {
          padding: [60, 60],
          maxZoom: 8.5,
          duration: 1.2
        });
      }
    } catch (e) {
      console.warn('fitToActiveCells error:', e);
    }
  }

  /**
   * Renderizza i trail storici delle celle sulla mappa come polyline animate
   */
  public renderHistoryTrails(trails: Map<string, { coords: Coordinates[]; name: string; severity: string }>): void {
    this.historyTrailsLayerGroup.clearLayers();

    const severityColors: Record<string, string> = {
      destructive: '#ff00d4',
      severe: '#ff0033',
      moderate: '#ff6d00',
      minor: '#00b0ff',
      none: '#3d5afe'
    };

    trails.forEach((trail, _cellId) => {
      if (trail.coords.length < 2) return;

      const latLngs: [number, number][] = trail.coords.map(c => [c.lat, c.lng]);
      const color = severityColors[trail.severity] || '#00e676';

      // Trail line (linea tratteggiata sottile)
      const trailLine = L.polyline(latLngs, {
        color: color,
        weight: 2.5,
        opacity: 0.6,
        dashArray: '6, 4',
        className: 'history-trail-line'
      });

      // Dot al punto iniziale (storico più vecchio)
      const startDot = L.circleMarker(latLngs[0], {
        radius: 3,
        color: color,
        fillColor: color,
        fillOpacity: 0.5,
        weight: 1
      });

      // Dot al punto finale (posizione attuale)
      const endDot = L.circleMarker(latLngs[latLngs.length - 1], {
        radius: 5,
        color: color,
        fillColor: color,
        fillOpacity: 0.9,
        weight: 2
      });

      trailLine.bindTooltip(`📍 Trail: ${trail.name}`, { sticky: true, className: 'trail-tooltip' });

      this.historyTrailsLayerGroup.addLayer(trailLine);
      this.historyTrailsLayerGroup.addLayer(startDot);
      this.historyTrailsLayerGroup.addLayer(endDot);
    });

    if (!this.map.hasLayer(this.historyTrailsLayerGroup)) {
      this.historyTrailsLayerGroup.addTo(this.map);
    }
  }

  /**
   * Rimuove tutti i trail storici dalla mappa
   */
  public clearHistoryTrails(): void {
    this.historyTrailsLayerGroup.clearLayers();
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
   * Disegna le proiezioni coniche a 15, 30, 45, 60 minuti e le frecce dinamiche di moto
   */
  private renderTrajectoryAndCones(cell: StormCell): void {
    const startPoint: [number, number] = [cell.centroid.lat, cell.centroid.lng];
    const heading = Math.round(cell.velocity.directionDeg);

    // Coni di probabilità d'impatto a ventaglio
    for (const cone of cell.nowcastCones) {
      const coneLatLngs = cone.polygon.map(c => [c.lat, c.lng] as [number, number]);
      const opacity = Math.max(0.08, 0.28 - (cone.minutesAhead * 0.003));
      const coneColor = this.appMode === 'storm' ? '#0284c7' : '#ff3366';

      const conePoly = L.polygon(coneLatLngs, {
        color: coneColor,
        weight: 1.5,
        fillColor: coneColor,
        fillOpacity: opacity,
        dashArray: '4, 6',
        className: this.appMode === 'storm' ? 'nowcast-cone-poly-storm' : 'nowcast-cone-poly'
      });

      conePoly.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        WeatherFXOverlay.getInstance().show({
          type: this.appMode === 'storm' ? 'rain' : 'wind',
          title: `Previsione Traiettoria +${cone.minutesAhead} min`,
          intensity: this.appMode === 'storm'
            ? `Avanzamento fronte piovoso verso i settori sottovento`
            : `Raffiche di Vento/Downburst fino a ${Math.round(cell.velocity.speedKmh * 1.5)} km/h`,
          detail: `Arrivo previsto verso i comuni: ${cell.impactedTowns?.slice(0, 3).join(', ') || 'settore in rotta'}`
        });
      });

      this.trajectoriesLayerGroup.addLayer(conePoly);

      // Marker con tempo stimato e freccia direzionale
      const timeIcon = L.divIcon({
        className: 'nowcast-time-icon',
        html: `
          <div class="nowcast-time-badge ${this.appMode === 'storm' ? 'time-badge-storm' : ''}">
            <span class="time-pill">+${cone.minutesAhead}m</span>
          </div>
        `,
        iconSize: [38, 20],
        iconAnchor: [19, 10]
      });

      const timeMarker = L.marker([cone.projectedCentroid.lat, cone.projectedCentroid.lng], { icon: timeIcon });
      timeMarker.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        WeatherFXOverlay.getInstance().show({
          type: this.appMode === 'storm' ? 'rain' : 'wind',
          title: `Impatto Previsto +${cone.minutesAhead}m`,
          intensity: this.appMode === 'storm'
            ? `Pioggia stimata: ${cell.rainIntensityMmH || 35} mm/h`
            : `Rischio Vento & Grandine ${cell.meshDiameterCm} cm`,
          detail: `Comuni interessati dal fronte: ${cell.impactedTowns?.slice(0, 3).join(', ') || 'in rotta'}`
        });
      });
      this.trajectoriesLayerGroup.addLayer(timeMarker);
    }

    // Frecce dinamiche che anticipano il verso della perturbazione lungo il percorso
    const waypoints = [
      cell.centroid,
      ...cell.nowcastCones.map(c => c.projectedCentroid)
    ];

    const arrowFill = this.appMode === 'storm' ? '#00f0ff' : '#ffbb00';

    for (let i = 0; i < waypoints.length - 1; i++) {
      const p1 = waypoints[i];
      const p2 = waypoints[i + 1];
      const midLat = (p1.lat + p2.lat) / 2;
      const midLng = (p1.lng + p2.lng) / 2;

      const arrowIcon = L.divIcon({
        className: 'dynamic-motion-arrow-icon',
        html: `
          <div class="motion-arrow-wrapper ${this.appMode === 'storm' ? 'motion-arrow-storm' : ''}" style="transform: rotate(${heading}deg);">
            <div class="motion-arrow-pulse"></div>
            <svg class="motion-arrow-svg" viewBox="0 0 24 24" width="24" height="24">
              <path d="M12 2L20 15L12 11.5L4 15L12 2Z" fill="${arrowFill}" stroke="#ffffff" stroke-width="1.5" />
            </svg>
          </div>
        `,
        iconSize: [24, 24],
        iconAnchor: [12, 12]
      });

      const arrowMarker = L.marker([midLat, midLng], { icon: arrowIcon });
      arrowMarker.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        WeatherFXOverlay.getInstance().show({
          type: 'wind',
          title: 'Vettore di Spostamento',
          intensity: `Velocità propagazione: ${cell.velocity.speedKmh} km/h`,
          detail: `Direzione di avanzamento: ${Math.round(cell.velocity.directionDeg)}° NNE`
        });
      });
      this.trajectoriesLayerGroup.addLayer(arrowMarker);
    }

    // Linea principale del vettore di avanzamento (60 min) con animazione tratteggiata
    const end60 = cell.nowcastCones[cell.nowcastCones.length - 1]?.projectedCentroid;
    if (end60) {
      const isNew = !!cell.isNew;
      const lineColor = this.appMode === 'storm' ? '#00f0ff' : (isNew ? '#00f0ff' : '#ffaa00');
      const vectorLine = L.polyline([startPoint, [end60.lat, end60.lng]], {
        color: lineColor,
        weight: isNew || this.appMode === 'storm' ? 4 : 3,
        dashArray: isNew || this.appMode === 'storm' ? '6, 6' : '8, 8',
        className: this.appMode === 'storm' ? 'animated-storm-trajectory-line' : (isNew ? 'animated-new-trajectory-line' : 'animated-trajectory-line')
      });
      vectorLine.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        WeatherFXOverlay.getInstance().show({
          type: this.appMode === 'storm' ? 'rain' : 'wind',
          title: `Traiettoria Fronte 60 Min`,
          intensity: `Avanzamento a ${cell.velocity.speedKmh} km/h`,
          detail: `Comuni lungo la rotta: ${cell.impactedTowns?.join(', ') || 'territorio in avanzamento'}`
        });
      });
      this.trajectoriesLayerGroup.addLayer(vectorLine);
    }
  }

  private getPhenomenonEmoji(phenomenon?: string): string {
    switch (phenomenon) {
      case 'downburst': return '💨';
      case 'lightning': return '⚡';
      case 'torrential_rain': return '🌧️';
      case 'tornado': return '🌪️';
      default: return '❄️';
    }
  }

  private getPhenomenonLabel(phenomenon?: string): string {
    switch (phenomenon) {
      case 'downburst': return 'Downburst & Raffiche Forti';
      case 'lightning': return 'Fulmini & Attività Elettrica';
      case 'torrential_rain': return 'Nubifragio Torrenziale';
      case 'tornado': return 'Tromba d\'Aria / Tornado';
      default: return 'Grandinata Severa';
    }
  }

  /**
   * Disegna i marker delle segnalazioni spotter a terra con emoticon associate
   */
  public renderSpotterReports(reports: SpotterReport[]): void {
    this.spottersLayerGroup.clearLayers();
    if (!this.showSpotters) return;

    for (const rep of reports) {
      const emoji = this.getPhenomenonEmoji(rep.phenomenon);
      const phenomLabel = this.getPhenomenonLabel(rep.phenomenon);
      const windKmh = rep.windSpeedKmh ? `${rep.windSpeedKmh} km/h` : '65 km/h';

      const icon = L.divIcon({
        className: 'spotter-report-icon',
        html: `
          <div class="spotter-pin" title="${phenomLabel}: ${rep.hailSizeCm} cm | Raffiche: ${windKmh}">
            <span class="spotter-emoji">${emoji}</span>
            <span class="spotter-size">${rep.hailSizeCm > 0 ? rep.hailSizeCm + 'cm' : windKmh}</span>
          </div>
        `,
        iconSize: [38, 38],
        iconAnchor: [19, 19]
      });

      const marker = L.marker([rep.coords.lat, rep.coords.lng], { icon });
      marker.on('click', () => {
        const fxType = rep.phenomenon === 'downburst' ? 'wind' : (rep.phenomenon === 'lightning' ? 'lightning' : (rep.phenomenon === 'torrential_rain' ? 'rain' : 'hail'));
        WeatherFXOverlay.getInstance().show({
          type: fxType,
          title: `Segnalazione: ${rep.locationName}`,
          intensity: rep.hailSizeCm > 0 ? `Grandine ${rep.hailSizeCm} cm` : `Raffiche ${windKmh}`,
          detail: rep.notes,
          loop: fxType === 'hail'
        });
      });
      marker.bindPopup(`
        <div class="spotter-popup">
          <div class="popup-title">${emoji} ${rep.locationName}</div>
          <div class="popup-time">🕒 Segnalato alle ore ${rep.timestamp}</div>
          <div class="popup-detail">
            <strong>Fenomeno:</strong> <span>${phenomLabel}</span>
          </div>
          <div class="popup-detail">
            <strong>Grandine Rilevata:</strong> <span class="hail-highlight">${rep.hailSizeCm} cm</span>
          </div>
          <div class="popup-detail">
            <strong>Raffiche di Vento:</strong> <span>💨 ~${windKmh}</span>
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

  public toggleGenesis(show: boolean): void {
    if (show) {
      this.genesisLayerGroup.addTo(this.map);
    } else {
      this.map.removeLayer(this.genesisLayerGroup);
    }
  }

  /**
   * Renderizza i vettori di innesco con frecce animate SVG "Previsione in Direzione"
   */
  public renderGenesisForecasts(forecasts: HailGenesisForecast[]): void {
    this.genesisLayerGroup.clearLayers();

    // Visualizza solo gli inneschi imminenti o in sviluppo (non ancora concretizzati come cella)
    const activeForecasts = forecasts.filter(f => f.maturationStage !== 'concretized');

    for (const f of activeForecasts) {
      // 1. Nodo di innesco pulsante all'origine
      const genesisIcon = L.divIcon({
        className: 'genesis-node-icon',
        html: `
          <div class="genesis-pulse-wrapper" title="${f.name}: innesco grandine previsto tra ${f.etaMinutes} min">
            <div class="genesis-pulse-ring"></div>
            <div class="genesis-core-node">
              <span class="genesis-symbol">⚡</span>
            </div>
          </div>
        `,
        iconSize: [36, 36],
        iconAnchor: [18, 18]
      });

      const originMarker = L.marker([f.originCoords.lat, f.originCoords.lng], { icon: genesisIcon });

      // 2. Linea di traiettoria con freccia direzionale animata SVG
      const pathLine = L.polyline([
        [f.originCoords.lat, f.originCoords.lng],
        [f.targetCoords.lat, f.targetCoords.lng]
      ], {
        color: '#f59e0b',
        weight: 3,
        dashArray: '6, 10',
        lineCap: 'round',
        opacity: 0.85
      });

      // 3. Freccia direzionale orientata verso il bersaglio
      const arrowHeadingDeg = f.directionDeg;
      const arrowIcon = L.divIcon({
        className: 'genesis-arrow-icon',
        html: `
          <div class="genesis-arrow-container" style="transform: rotate(${arrowHeadingDeg - 90}deg);">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M5 12H19M19 12L12 5M19 12L12 19" stroke="#f59e0b" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>
        `,
        iconSize: [28, 28],
        iconAnchor: [14, 14]
      });

      const arrowMarker = L.marker([f.targetCoords.lat, f.targetCoords.lng], { icon: arrowIcon });

      // 4. Etichetta "Previsione in Direzione"
      const labelMidLat = (f.originCoords.lat + f.targetCoords.lat) / 2;
      const labelMidLng = (f.originCoords.lng + f.targetCoords.lng) / 2;
      
      const labelIcon = L.divIcon({
        className: 'genesis-floating-label',
        html: `
          <div class="genesis-label-badge">
            <span class="badge-tag">⚡ ~${f.etaMinutes}m</span>
            <span class="badge-hail-prob risk-${f.hailRiskLevel}">❄️ ${f.hailConversionProbability}% Grandine</span>
            <span class="badge-dest">&rarr; ${f.directionCardinal}</span>
          </div>
        `,
        iconSize: [210, 24],
        iconAnchor: [105, 12]
      });

      const labelMarker = L.marker([labelMidLat, labelMidLng], { icon: labelIcon });

      const popupContent = `
        <div class="genesis-popup-card">
          <div class="genesis-popup-head">
            <span class="genesis-badge">⚡ PREVISIONE IN DIREZIONE</span>
            <span class="genesis-confidence">${f.triggerConfidenceScore}% Confidenza</span>
          </div>
          <h4 class="genesis-popup-title">${f.name}</h4>

          <div class="genesis-hail-prob-box">
            <div class="hail-prob-header">
              <span>❄️ Probabilità Grandine Vera:</span>
              <span class="hail-prob-badge risk-${f.hailRiskLevel}">${f.hailConversionProbability}% (${f.hailRiskLevel.toUpperCase()})</span>
            </div>
            <div class="hail-prob-bar-track">
              <div class="hail-prob-bar-fill risk-${f.hailRiskLevel}" style="width: ${f.hailConversionProbability}%"></div>
            </div>
          </div>

          <div class="genesis-popup-body">
            <div class="genesis-row"><strong>⏳ Innesco Stimato:</strong> tra ${f.etaMinutes} minuti</div>
            <div class="genesis-row"><strong>🧭 Vettore Spostamento:</strong> ${f.directionCardinal} (${f.directionDeg}°) a ${f.speedKmh} km/h</div>
            <div class="genesis-row"><strong>❄️ Diametro Chicco Atteso:</strong> ~${f.expectedMeshDiameterCm} cm (${f.expectedDbz} dBZ)</div>
            <div class="genesis-row"><strong>🎯 Comuni a Rischio:</strong> ${f.targetTowns.slice(0, 4).join(', ')}</div>
            <div class="genesis-cross-sources">
              <span class="cross-title">Fonti Dati Incrociate:</span>
              <div class="cross-badges-list">
                ${f.crossSources.map(s => `<span class="cross-badge-item" title="${s.indicator}: ${s.value}">${s.badge}</span>`).join('')}
              </div>
            </div>
          </div>
        </div>
      `;

      originMarker.bindPopup(popupContent);
      arrowMarker.bindPopup(popupContent);
      pathLine.bindPopup(popupContent);

      originMarker.on('click', () => {
        if (this.onGenesisClickCallback) this.onGenesisClickCallback(f);
      });

      this.genesisLayerGroup.addLayer(pathLine);
      this.genesisLayerGroup.addLayer(arrowMarker);
      this.genesisLayerGroup.addLayer(labelMarker);
      this.genesisLayerGroup.addLayer(originMarker);
    }
  }

  public toggleDpcStations(show: boolean): void {
    if (show) {
      this.dpcStationsLayerGroup.addTo(this.map);
    } else {
      this.map.removeLayer(this.dpcStationsLayerGroup);
    }
  }

  /**
   * Inizializza i marker e i fasci di copertura delle stazioni della Rete Radar Nazionale DPC
   */
  private initDpcStations(): void {
    this.dpcStationsLayerGroup.clearLayers();

    for (const station of DPC_RADAR_NETWORK) {
      // Icona stilizzata per il radar meteorologico
      const radarIcon = L.divIcon({
        className: 'dpc-radar-station-icon',
        html: `
          <div class="radar-station-node" title="${station.name} (${station.operator})">
            <span class="station-dish">📡</span>
          </div>
        `,
        iconSize: [28, 28],
        iconAnchor: [14, 14]
      });

      const marker = L.marker([station.lat, station.lng], { icon: radarIcon });

      // Cerchio raggio operativo (250 km)
      const rangeCircle = L.circle([station.lat, station.lng], {
        radius: station.rangeKm * 1000,
        color: '#06b6d4',
        weight: 1,
        opacity: 0.35,
        fillColor: '#06b6d4',
        fillOpacity: 0.03,
        dashArray: '4, 8'
      });

      marker.bindPopup(`
        <div class="dpc-radar-popup">
          <div class="dpc-popup-header">
            <strong>📡 ${station.name}</strong>
            <span class="badge badge-accent">${station.band}</span>
          </div>
          <div class="dpc-popup-body">
            <div><strong>Ente/Operatore:</strong> ${station.operator} (${station.region})</div>
            <div><strong>Altitudine:</strong> ${station.altitudeM} m s.l.m.</div>
            <div><strong>Polarimetria:</strong> ${station.polarization}</div>
            <div><strong>Raggio Operativo:</strong> ${station.rangeKm} km</div>
            <div><strong>Stato:</strong> <span style="color: #22c55e;">● Operativo</span></div>
          </div>
        </div>
      `);

      this.dpcStationsLayerGroup.addLayer(rangeCircle);
      this.dpcStationsLayerGroup.addLayer(marker);
    }

    // Disattivo per default per mantenere la mappa pulita
    this.map.removeLayer(this.dpcStationsLayerGroup);
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
    if (dbz >= 65) return '#ff00d4'; // Fucsia/Magenta Neon Elettrico (>65 dBZ - Grandine Gigante Estrema)
    if (dbz >= 60) return '#ff0033'; // Rosso Fuoco Acceso (60-65 dBZ - Grandine Severa)
    if (dbz >= 55) return '#ff6d00'; // Arancio Fiamma Vivo (55-60 dBZ - Grandine Probabile)
    if (dbz >= 50) return '#ffd600'; // Giallo Elettrico (50-55 dBZ - Rovesci Violenti/Grandine Piccola)
    if (dbz >= 42) return '#00e676'; // Verde Smeraldo Brillante (42-50 dBZ - Pioggia Forte)
    if (dbz >= 32) return '#00b0ff'; // Ciano Cielo Fluorescente (32-42 dBZ - Pioggia Moderata)
    return '#3d5afe';                // Blu Cobalto (<32 dBZ - Pioggia Debole)
  }

  private getZdrColor(zdr: number): string {
    if (zdr <= 0.2) return '#00f0ff'; // Ciano Glaciale Brillante: grandine sferica/tumbling
    if (zdr <= 1.0) return '#3b82f6'; // Blu Elettrico: grandine mista a gocce
    if (zdr <= 2.2) return '#00e676'; // Verde Neon: pioggia moderata
    if (zdr <= 3.2) return '#ffd600'; // Giallo Elettrico: pioggia forte
    return '#ff0055';                 // Magenta Acceso: gocce grandi appiattite
  }

  private getCcColor(cc: number): string {
    if (cc < 0.86) return '#ff00d4';  // Fucsia/Magenta Neon: fase mista complessa (grandine gigante)
    if (cc < 0.92) return '#a855f7';  // Viola Elettrico: grandine mista a pioggia
    if (cc < 0.97) return '#00f0ff';  // Ciano: pioggia eterogenea
    return '#00e676';                 // Smeraldo: idrometeore uniformi (pioggia pura)
  }
}
