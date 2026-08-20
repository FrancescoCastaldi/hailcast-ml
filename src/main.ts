import { RainViewerService } from './services/rainviewer';
import { OpenMeteoService } from './services/openmeteo';
import { SpotterFeedService } from './services/spotter-feed';
import { MultiSourceStormDetector } from './services/multi-source-tracker';
import { AlertNotificationService } from './services/alert-notification-service';
import { StormTracker } from './ml/storm-tracker';
import { HailPredictorML } from './ml/hail-ml-model';
import { Coordinates, StormCell, RainViewerFrame, SpotterReport } from './types/meteorology';

import { RadarMapComponent } from './components/RadarMap';
import { TimelineControllerComponent } from './components/TimelineController';
import { AlertFeedComponent } from './components/AlertFeed';
import { ConvectiveTelemetryComponent } from './components/ConvectiveTelemetry';
import { LocationSearchComponent } from './components/LocationSearch';
import { SpotterModalComponent } from './components/SpotterModal';
import { NotificationModalComponent } from './components/NotificationModal';

class HailCastApp {
  private radarMap!: RadarMapComponent;
  private timelineController!: TimelineControllerComponent;
  private alertFeed!: AlertFeedComponent;
  private telemetry!: ConvectiveTelemetryComponent;
  private locationSearch!: LocationSearchComponent;
  private spotterModal!: SpotterModalComponent;
  private notificationModal!: NotificationModalComponent;

  private baseStormCells: StormCell[] = [];
  private currentStormCells: StormCell[] = [];
  private currentSpotterReports: SpotterReport[] = [];
  private rainViewerHost: string = 'https://tilecache.rainviewer.com';
  private inspectedLocation: { coords: Coordinates; name: string } | null = null;

  constructor() {
    this.init();
  }

  private async init(): Promise<void> {
    console.log('⚡ Inizializzazione HailCast-ML Multi-Source...');

    // 1. Inizializza i componenti grafici
    this.radarMap = new RadarMapComponent('radarMap');
    this.timelineController = new TimelineControllerComponent();
    this.alertFeed = new AlertFeedComponent();
    this.telemetry = new ConvectiveTelemetryComponent();
    this.locationSearch = new LocationSearchComponent();
    this.spotterModal = new SpotterModalComponent();
    this.notificationModal = new NotificationModalComponent();

    // 2. Registra gli eventi
    this.bindEvents();

    // 3. Carica i dati delle segnalazioni iniziali
    this.currentSpotterReports = SpotterFeedService.getReports();
    this.radarMap.renderSpotterReports(this.currentSpotterReports);

    // 4. Carica e rileva le celle temporalesche da fonti multiple (Radar + Open-Meteo CAPE + Spotter)
    await this.loadConvectiveStorms();

    // 5. Connettiti a RainViewer API per i frame radar in tempo reale
    await this.fetchLiveRadar();
    
    // Avvio automatico della timeline (il tempo avanza da solo)
    this.timelineController.play();
    
    // Avvia orologio live in tempo reale (aggiornato ogni secondo)
    this.startLiveClockTicker();

    // Refresh automatico continuo multi-sorgente ogni 30 secondi per avere sempre i dati radar più recenti
    setInterval(async () => {
      await this.fetchLiveRadar(true);
      await this.refreshMultiSourceStorms();
    }, 30000);

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

    // Cambio frame radar dalla timeline: muove sia i tile radar che i nuclei e le traiettorie di grandine
    this.timelineController.setOnFrameChange((frame: RainViewerFrame, _index: number, _isNowcast: boolean, offsetMinutes: number) => {
      const prevailingVelocity = this.baseStormCells[0]?.velocity;
      this.radarMap.updateRadarFrame(frame, this.rainViewerHost, offsetMinutes, prevailingVelocity);

      // Spostamento e animazione continua dei temporali e della grandine nel tempo
      if (this.baseStormCells.length > 0) {
        this.currentStormCells = StormTracker.projectStormCellsForOffset(this.baseStormCells, offsetMinutes);
        this.radarMap.renderStormCells(this.currentStormCells);
        this.alertFeed.renderStormCells(this.currentStormCells);

        // Se l'utente sta monitorando una località, aggiorna l'ETA e la distanza in tempo reale
        if (this.inspectedLocation) {
          const assessment = StormTracker.assessLocationRisk(this.inspectedLocation.name, this.inspectedLocation.coords, this.currentStormCells);
          this.locationSearch.showRiskCard(assessment);
        }
      }
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

    document.getElementById('btnNavAlerts')?.addEventListener('click', () => {
      this.notificationModal.open();
      setMobileNavActive('btnNavAlerts');
    });

    // Pulsante Apertura Modale Notifiche & Allerte Email
    document.getElementById('btnOpenNotificationModal')?.addEventListener('click', () => {
      this.notificationModal.open(this.inspectedLocation?.name, this.inspectedLocation?.coords);
    });

    // Pulsante Allerta Rapida dalla Card Località
    document.getElementById('btnSetAlertForLocation')?.addEventListener('click', () => {
      this.notificationModal.open(this.inspectedLocation?.name, this.inspectedLocation?.coords);
    });

    this.notificationModal.setOnSubscriptionUpdated((sub) => {
      this.showToast(`Monitoraggio attivo per ${sub.locationName} (${sub.email})`, 'success');
      this.alertFeed.addAlert(`Configurato monitoraggio allerta grandine/pioggia per ${sub.locationName} (${sub.email}).`, 'info');
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
          statusTextEl.textContent = `RADAR LIVE 🟢 • SCANSIONE: ${this.lastRadarScanTimeStr} | ORA: ${liveTimeStr}`;
        } else {
          statusTextEl.textContent = `RADAR LIVE 🟢 • ORA: ${liveTimeStr}`;
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

  private async loadConvectiveStorms(): Promise<void> {
    try {
      const detected = await MultiSourceStormDetector.scanAndDetectCells();
      this.baseStormCells = detected.length > 0 ? detected : SpotterFeedService.getSimulatedSupercells();
    } catch (err) {
      console.warn('Fallback a celle convettive simulate:', err);
      this.baseStormCells = SpotterFeedService.getSimulatedSupercells();
    }

    this.currentStormCells = this.baseStormCells;
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

  private async refreshMultiSourceStorms(): Promise<void> {
    try {
      const previousIds = new Set(this.baseStormCells.map(c => c.id));
      const freshCells = await MultiSourceStormDetector.scanAndDetectCells();
      
      if (freshCells.length > 0) {
        this.baseStormCells = freshCells;
        this.currentStormCells = freshCells;
        this.radarMap.renderStormCells(this.currentStormCells);
        this.alertFeed.renderStormCells(this.currentStormCells);

        // Notifica eventuali nuove celle convettive rilevate
        for (const cell of freshCells) {
          if (!previousIds.has(cell.id) && (cell.severity === 'destructive' || cell.severity === 'severe')) {
            this.showToast(`Nuova cella rilevata da multi-feed: ${cell.name} (${cell.meshDiameterCm} cm)`, 'warning');
            this.alertFeed.addAlert(`Nuovo nucleo convettivo rilevato da Radar & Open-Meteo: ${cell.name} (${cell.maxDbz} dBZ)`, 'danger');
          }
        }

        // Se l'utente sta monitorando una località, aggiorna i dati in tempo reale
        if (this.inspectedLocation) {
          const assessment = StormTracker.assessLocationRisk(
            this.inspectedLocation.name,
            this.inspectedLocation.coords,
            this.currentStormCells
          );
          this.locationSearch.showRiskCard(assessment);
        }

        // Verifica le allerte per l'eventuale sottoscrizione email/push configurata dall'utente
        const alertCheck = AlertNotificationService.checkStormCellAlerts(this.currentStormCells);
        if (alertCheck.triggered && alertCheck.alert) {
          const sub = AlertNotificationService.getSubscription();
          if (sub) {
            await AlertNotificationService.sendEmailAlert(sub, alertCheck.alert.type, {
              cellName: alertCheck.alert.cell.name,
              hailSizeCm: alertCheck.alert.cell.meshDiameterCm,
              etaMinutes: alertCheck.alert.eta,
              maxDbz: alertCheck.alert.cell.maxDbz
            });
            this.showToast(`📧 Allerta Inviata a ${sub.email}: ${alertCheck.alert.title}`, 'danger');
            this.alertFeed.addAlert(`[EMAIL & PUSH INVIATA] ${alertCheck.alert.title}: ${alertCheck.alert.message}`, 'danger');
          }
        }
      }
    } catch (err) {
      console.warn('Errore refresh celle multi-fonte:', err);
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
    this.inspectedLocation = { coords, name };
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

  private async runSupercellSimulation(): Promise<void> {
    this.alertFeed.addAlert('▶ Avviata simulazione supercella convettiva padana (Evento Estremo 65 dBZ).', 'danger');
    await this.loadConvectiveStorms();
    this.radarMap.flyTo({ lat: 45.4, lng: 10.8 }, 9);
    this.timelineController.play();
  }
}

// Avvio applicazione al caricamento del DOM
document.addEventListener('DOMContentLoaded', () => {
  new HailCastApp();
});
