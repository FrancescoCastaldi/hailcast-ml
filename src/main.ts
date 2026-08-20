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
    
    // Avvia orologio live in tempo reale (aggiornato ogni secondo)
    this.startLiveClockTicker();

    // Refresh automatico dei dati radar ogni 60 secondi (1 minuto)
    setInterval(() => {
      this.fetchLiveRadar(true);
    }, 60000);

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
      this.showToast(`Segnalazione inviata: ${report.locationName} (${report.hailSizeCm} cm)`, 'success');
    });

    // Tasti HUD mappa
    document.getElementById('btnToggleRadarLayer')?.addEventListener('click', (e) => {
      const btn = e.currentTarget as HTMLElement;
      btn.classList.toggle('active');
      const active = btn.classList.contains('active');
      this.radarMap.toggleRadar(active);
      this.showToast(active ? 'Layer Radar Attivato' : 'Layer Radar Disattivato', 'info');
    });

    document.getElementById('btnToggleVectors')?.addEventListener('click', (e) => {
      const btn = e.currentTarget as HTMLElement;
      btn.classList.toggle('active');
      const active = btn.classList.contains('active');
      this.radarMap.toggleVectors(active);
      this.showToast(active ? 'Traiettorie e Coni Visibili' : 'Traiettorie Nascoste', 'info');
    });

    document.getElementById('btnToggleSpotters')?.addEventListener('click', (e) => {
      const btn = e.currentTarget as HTMLElement;
      btn.classList.toggle('active');
      const active = btn.classList.contains('active');
      this.radarMap.toggleSpotters(active);
      this.showToast(active ? 'Segnalazioni Spotter Visibili' : 'Segnalazioni Nascoste', 'info');
    });

    document.getElementById('btnLayerBasemap')?.addEventListener('click', () => {
      const newKey = this.radarMap.cycleBasemap();
      this.alertFeed.addAlert(`Mappa base cambiata: ${newKey.toUpperCase()}`, 'info');
      this.showToast(`Mappa base: ${newKey.toUpperCase()}`, 'info');
    });

    document.getElementById('btnResetView')?.addEventListener('click', () => {
      this.radarMap.resetView();
      this.showToast('Vista centrata sull\'Italia', 'info');
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

    const closeWelcomeModal = () => {
      if (welcomeModal) {
        welcomeModal.style.display = 'none';
      }
    };

    btnDismissWelcome?.addEventListener('click', closeWelcomeModal);

    // Light dismiss per welcome modal (click sullo sfondo scuro)
    welcomeModal?.addEventListener('click', (e) => {
      if (e.target === welcomeModal) {
        closeWelcomeModal();
      }
    });

    // Gestione Navigazione Mobile e Drawer Backdrop
    const leftSidebar = document.getElementById('leftSidebar');
    const btnCloseLeftSidebar = document.getElementById('btnCloseLeftSidebar');
    const mobileDrawerBackdrop = document.getElementById('mobileDrawerBackdrop');
    const mobileNavBtns = document.querySelectorAll('.mobile-nav-btn');

    const setMobileNavActive = (btnId: string) => {
      mobileNavBtns.forEach(btn => {
        btn.classList.toggle('active', btn.id === btnId);
      });
    };

    const closeAllMobileDrawers = () => {
      leftSidebar?.classList.remove('mobile-open');
      this.telemetry.close();
      mobileDrawerBackdrop?.classList.remove('active');
      setMobileNavActive('btnNavMap');
    };

    mobileDrawerBackdrop?.addEventListener('click', () => {
      closeAllMobileDrawers();
    });

    document.getElementById('btnNavMap')?.addEventListener('click', () => {
      closeAllMobileDrawers();
    });

    document.getElementById('btnNavCells')?.addEventListener('click', () => {
      const isOpen = leftSidebar?.classList.toggle('mobile-open');
      this.telemetry.close();
      if (isOpen) {
        mobileDrawerBackdrop?.classList.add('active');
        setMobileNavActive('btnNavCells');
      } else {
        mobileDrawerBackdrop?.classList.remove('active');
        setMobileNavActive('btnNavMap');
      }
    });

    document.getElementById('btnNavSearch')?.addEventListener('click', () => {
      closeAllMobileDrawers();
      const input = document.getElementById('locationSearchInput') as HTMLInputElement;
      input?.focus();
      setMobileNavActive('btnNavSearch');
    });

    document.getElementById('btnNavTelemetry')?.addEventListener('click', () => {
      leftSidebar?.classList.remove('mobile-open');
      this.telemetry.toggle();
      const isTelOpen = document.getElementById('rightSidebar')?.classList.contains('open');
      if (isTelOpen) {
        mobileDrawerBackdrop?.classList.add('active');
        setMobileNavActive('btnNavTelemetry');
      } else {
        mobileDrawerBackdrop?.classList.remove('active');
        setMobileNavActive('btnNavMap');
      }
    });

    document.getElementById('btnNavSpotter')?.addEventListener('click', () => {
      this.spotterModal.open();
      setMobileNavActive('btnNavSpotter');
    });

    btnCloseLeftSidebar?.addEventListener('click', () => {
      closeAllMobileDrawers();
    });

    // Supporto globale al tasto Escape per chiudere modali e pannelli
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeWelcomeModal();
        closeAllMobileDrawers();
        const riskCard = document.getElementById('locationRiskCard');
        if (riskCard) riskCard.style.display = 'none';
      }
    });
  }

  public showToast(message: string, type: 'info' | 'success' | 'warning' | 'danger' = 'info'): void {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast-item toast-${type}`;
    
    const icons = {
      info: 'ℹ️',
      success: '✅',
      warning: '⚠️',
      danger: '🚨'
    };

    toast.innerHTML = `
      <span class="toast-icon">${icons[type] || 'ℹ️'}</span>
      <span class="toast-message">${message}</span>
      <button class="toast-close" aria-label="Chiudi notifica">&times;</button>
    `;

    toast.querySelector('.toast-close')?.addEventListener('click', () => {
      toast.classList.add('toast-hiding');
      setTimeout(() => toast.remove(), 250);
    });

    container.appendChild(toast);

    // Auto-remove after 4 seconds
    setTimeout(() => {
      if (toast.parentElement) {
        toast.classList.add('toast-hiding');
        setTimeout(() => toast.remove(), 250);
      }
    }, 4000);
  }

  private lastRadarScanTimeStr: string = '';

  private startLiveClockTicker(): void {
    const updateClock = () => {
      const now = new Date();
      const liveTimeStr = now.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const statusTextEl = document.getElementById('radarStatusText') as HTMLElement;
      if (statusTextEl) {
        if (this.lastRadarScanTimeStr) {
          statusTextEl.textContent = `LIVE • RADAR: ${this.lastRadarScanTimeStr} | ORA: ${liveTimeStr}`;
        } else {
          statusTextEl.textContent = `LIVE | ORA: ${liveTimeStr}`;
        }
      }
    };
    updateClock();
    setInterval(updateClock, 1000);
  }

  private async fetchLiveRadar(isBackgroundRefresh: boolean = false): Promise<void> {
    const statusTextEl = document.getElementById('radarStatusText') as HTMLElement;
    
    try {
      if (!isBackgroundRefresh && statusTextEl) {
        statusTextEl.textContent = 'CONNESSIONE RADAR...';
      }
      const radarData = await RainViewerService.fetchRadarData();
      this.rainViewerHost = radarData.host;

      this.timelineController.setFrames(radarData.radar.past, radarData.radar.nowcast);
      
      if (radarData.radar.past.length > 0) {
        const lastPast = radarData.radar.past[radarData.radar.past.length - 1];
        this.radarMap.updateRadarFrame(lastPast, radarData.host);
        const scanDate = new Date(lastPast.time * 1000);
        this.lastRadarScanTimeStr = scanDate.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
      }

      if (!isBackgroundRefresh) {
        this.alertFeed.addAlert(`Feed radar sincronizzato (Ultima scansione: ${this.lastRadarScanTimeStr || 'in corso'}).`, 'info');
      }
    } catch (err) {
      console.error('Errore radar live:', err);
      if (statusTextEl) {
        statusTextEl.textContent = 'RADAR: MODALITÀ SIMULATA';
      }
      if (!isBackgroundRefresh) {
        this.alertFeed.addAlert('Feed radar in modalità simulata.', 'warning');
      }
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
