import { RainViewerService } from './services/rainviewer';
import { OpenMeteoService } from './services/openmeteo';
import { SpotterFeedService } from './services/spotter-feed';
import { StormTracker } from './ml/storm-tracker';
import { HailPredictorML } from './ml/hail-ml-model';
import { Coordinates, StormCell, RainViewerFrame, SpotterReport } from './types/meteorology';

import { RadarMapComponent } from './components/RadarMap';
import { TimelineControllerComponent } from './components/TimelineController';
import { AlertFeedComponent } from './components/AlertFeed';
import { ConvectiveTelemetryComponent } from './components/ConvectiveTelemetry';
import { LocationSearchComponent } from './components/LocationSearch';
import { SpotterModalComponent } from './components/SpotterModal';

class HailCastApp {
  private radarMap!: RadarMapComponent;
  private timelineController!: TimelineControllerComponent;
  private alertFeed!: AlertFeedComponent;
  private telemetry!: ConvectiveTelemetryComponent;
  private locationSearch!: LocationSearchComponent;
  private spotterModal!: SpotterModalComponent;

  private currentStormCells: StormCell[] = [];
  private currentSpotterReports: SpotterReport[] = [];
  private rainViewerHost: string = 'https://tilecache.rainviewer.com';

  constructor() {
    this.init();
  }

  private async init(): Promise<void> {
    console.log('⚡ Inizializzazione HailCast-ML...');

    // 1. Inizializza i componenti grafici
    this.radarMap = new RadarMapComponent('radarMap');
    this.timelineController = new TimelineControllerComponent();
    this.alertFeed = new AlertFeedComponent();
    this.telemetry = new ConvectiveTelemetryComponent();
    this.locationSearch = new LocationSearchComponent();
    this.spotterModal = new SpotterModalComponent();

    // 2. Registra gli eventi
    this.bindEvents();

    // 3. Carica i dati delle segnalazioni iniziali
    this.currentSpotterReports = SpotterFeedService.getReports();
    this.radarMap.renderSpotterReports(this.currentSpotterReports);

    // 4. Carica le celle temporalesche simulate/reali
    this.loadConvectiveStorms();

    // 5. Connettiti a RainViewer API per i frame radar in tempo reale
    await this.fetchLiveRadar();
    
    // Avvio automatico della timeline (il tempo avanza da solo)
    this.timelineController.play();
    
    // Refresh automatico dei dati radar ogni 5 minuti (300000 ms)
    setInterval(() => {
      console.log('🔄 Aggiornamento automatico dei dati radar...');
      this.fetchLiveRadar();
    }, 300000);

    // 6. Esegui la prima valutazione di telemetria sulla prima cella attiva
    if (this.currentStormCells.length > 0) {
      const firstCell = this.currentStormCells[0];
      const pred = HailPredictorML.predict(firstCell.maxDbz, firstCell.sounding);
      this.telemetry.updateTelemetry(firstCell.sounding, pred, firstCell.maxDbz);
    }
  }

  private bindEvents(): void {
    // Click sulla mappa per ispezione rischio
    this.radarMap.setMapClickHandler(async (coords: Coordinates) => {
      await this.handleLocationInspection(coords, `Punto Mappa (${coords.lat.toFixed(3)}, ${coords.lng.toFixed(3)})`);
    });

    // Click su una cella temporalesca
    this.radarMap.setCellClickHandler((cell: StormCell) => {
      this.inspectStormCell(cell);
    });

    // Selezione cella dalla sidebar
    this.alertFeed.setOnCellSelect((cell: StormCell) => {
      this.inspectStormCell(cell);
    });

    // Selezione località dalla barra di ricerca
    this.locationSearch.setOnLocationSelected(async (coords: Coordinates, name: string) => {
      await this.handleLocationInspection(coords, name);
    });

    // Cambio frame radar dalla timeline
    this.timelineController.setOnFrameChange((frame: RainViewerFrame) => {
      this.radarMap.updateRadarFrame(frame, this.rainViewerHost);
    });

    // Invio nuova segnalazione spotter
    this.spotterModal.setOnReportSubmitted((report: SpotterReport) => {
      this.currentSpotterReports = SpotterFeedService.getReports();
      this.radarMap.renderSpotterReports(this.currentSpotterReports);
      this.alertFeed.addAlert(
        `Nuova segnalazione grandine da ${report.locationName}: chicchi di ${report.hailSizeCm} cm!`,
        report.hailSizeCm > 3.0 ? 'danger' : 'warning'
      );
    });

    // Tasti HUD mappa
    document.getElementById('btnToggleRadarLayer')?.addEventListener('click', (e) => {
      const btn = e.currentTarget as HTMLElement;
      btn.classList.toggle('active');
      this.radarMap.toggleRadar(btn.classList.contains('active'));
    });

    document.getElementById('btnToggleVectors')?.addEventListener('click', (e) => {
      const btn = e.currentTarget as HTMLElement;
      btn.classList.toggle('active');
      this.radarMap.toggleVectors(btn.classList.contains('active'));
    });

    document.getElementById('btnToggleSpotters')?.addEventListener('click', (e) => {
      const btn = e.currentTarget as HTMLElement;
      btn.classList.toggle('active');
      this.radarMap.toggleSpotters(btn.classList.contains('active'));
    });

    document.getElementById('btnLayerBasemap')?.addEventListener('click', () => {
      const newKey = this.radarMap.cycleBasemap();
      this.alertFeed.addAlert(`Mappa base cambiata: ${newKey.toUpperCase()}`, 'info');
    });

    document.getElementById('btnResetView')?.addEventListener('click', () => {
      this.radarMap.resetView();
    });

    // Pulsante Simulazione Supercella
    document.getElementById('btnSimulateSupercell')?.addEventListener('click', () => {
      this.runSupercellSimulation();
    });

    // Gestione Welcome Modal (Made by Francesco Castaldi)
    const welcomeModal = document.getElementById('welcomeModal');
    const btnDismissWelcome = document.getElementById('btnDismissWelcome');
    
    // Mostra il welcome popup all'avvio
    if (welcomeModal) {
      welcomeModal.style.display = 'flex';
    }

    btnDismissWelcome?.addEventListener('click', () => {
      if (welcomeModal) {
        welcomeModal.style.display = 'none';
      }
    });

    // Gestione Navigazione Mobile
    const leftSidebar = document.getElementById('leftSidebar');
    const btnCloseLeftSidebar = document.getElementById('btnCloseLeftSidebar');
    const mobileNavBtns = document.querySelectorAll('.mobile-nav-btn');

    const setMobileNavActive = (btnId: string) => {
      mobileNavBtns.forEach(btn => {
        btn.classList.toggle('active', btn.id === btnId);
      });
    };

    document.getElementById('btnNavMap')?.addEventListener('click', () => {
      leftSidebar?.classList.remove('mobile-open');
      this.telemetry.close();
      setMobileNavActive('btnNavMap');
    });

    document.getElementById('btnNavCells')?.addEventListener('click', () => {
      leftSidebar?.classList.toggle('mobile-open');
      this.telemetry.close();
      setMobileNavActive('btnNavCells');
    });

    document.getElementById('btnNavSearch')?.addEventListener('click', () => {
      leftSidebar?.classList.remove('mobile-open');
      this.telemetry.close();
      const input = document.getElementById('locationSearchInput') as HTMLInputElement;
      input?.focus();
      setMobileNavActive('btnNavSearch');
    });

    document.getElementById('btnNavTelemetry')?.addEventListener('click', () => {
      leftSidebar?.classList.remove('mobile-open');
      this.telemetry.toggle();
      setMobileNavActive('btnNavTelemetry');
    });

    document.getElementById('btnNavSpotter')?.addEventListener('click', () => {
      this.spotterModal.open();
      setMobileNavActive('btnNavSpotter');
    });

    btnCloseLeftSidebar?.addEventListener('click', () => {
      leftSidebar?.classList.remove('mobile-open');
      setMobileNavActive('btnNavMap');
    });
  }

  private async fetchLiveRadar(): Promise<void> {
    const statusTextEl = document.getElementById('radarStatusText') as HTMLElement;
    
    try {
      statusTextEl.textContent = 'CONNESSIONE RAINVIEWER...';
      const radarData = await RainViewerService.fetchRadarData();
      this.rainViewerHost = radarData.host;

      this.timelineController.setFrames(radarData.radar.past, radarData.radar.nowcast);
      
      if (radarData.radar.past.length > 0) {
        const lastPast = radarData.radar.past[radarData.radar.past.length - 1];
        this.radarMap.updateRadarFrame(lastPast, radarData.host);
      }

      statusTextEl.textContent = 'RADAR FEED: LIVE / CONNESSO';
      this.alertFeed.addAlert('Feed radar meteorologico sincronizzato con successo.', 'info');
    } catch (err) {
      console.error('Errore radar live:', err);
      statusTextEl.textContent = 'RADAR FEED: OFFLINE (SIMULATO)';
      this.alertFeed.addAlert('Feed radar in modalità simulata.', 'warning');
    }
  }

  private loadConvectiveStorms(): void {
    this.currentStormCells = SpotterFeedService.getSimulatedSupercells();
    this.radarMap.renderStormCells(this.currentStormCells);
    this.alertFeed.renderStormCells(this.currentStormCells);

    for (const cell of this.currentStormCells) {
      if (cell.severity === 'destructive' || cell.severity === 'severe') {
        this.alertFeed.addAlert(
          `ALLERTA GRANDINE: ${cell.name} (${cell.maxDbz} dBZ) - Rischio MESH ${cell.meshDiameterCm} cm verso ${Math.round(cell.velocity.directionDeg)}°`,
          'danger'
        );
      }
    }
  }

  private inspectStormCell(cell: StormCell): void {
    this.radarMap.flyTo(cell.centroid, 10);
    const pred = HailPredictorML.predict(cell.maxDbz, cell.sounding);
    this.telemetry.updateTelemetry(cell.sounding, pred, cell.maxDbz);
    this.telemetry.open();

    this.alertFeed.addAlert(`Ispezione ${cell.name}: ${cell.maxDbz} dBZ, MESH ${cell.meshDiameterCm} cm.`, 'info');
  }

  private async handleLocationInspection(coords: Coordinates, name: string): Promise<void> {
    this.radarMap.highlightLocation(coords, name);
    
    // Valuta il rischio con lo storm tracker
    const assessment = StormTracker.assessLocationRisk(name, coords, this.currentStormCells);
    this.locationSearch.showRiskCard(assessment);

    // Recupera anche il radiosondaggio atmosferico locale da Open-Meteo
    const sounding = await OpenMeteoService.fetchConvectiveSounding(coords);
    const maxLocalDbz = assessment.estimatedDiameterCm > 0 ? 58 : 32;
    const pred = HailPredictorML.predict(maxLocalDbz, sounding);
    this.telemetry.updateTelemetry(sounding, pred, maxLocalDbz);

    if (assessment.estimatedArrivalMinutes && assessment.estimatedArrivalMinutes <= 45) {
      this.alertFeed.addAlert(
        `⚠️ ATTENZIONE: Cella temporalesca in arrivo su ${name} in ~${assessment.estimatedArrivalMinutes} min!`,
        'danger'
      );
    }
  }

  private runSupercellSimulation(): void {
    this.alertFeed.addAlert('▶ Avviata simulazione supercella convettiva padana (Evento Estremo 65 dBZ).', 'danger');
    this.loadConvectiveStorms();
    this.radarMap.flyTo({ lat: 45.4, lng: 10.8 }, 9);
    this.timelineController.play();
  }
}

// Avvio applicazione al caricamento del DOM
document.addEventListener('DOMContentLoaded', () => {
  new HailCastApp();
});
