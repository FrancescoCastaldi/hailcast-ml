import { RainViewerService } from './services/rainviewer';
import { OpenMeteoService } from './services/openmeteo';
import { SpotterFeedService } from './services/spotter-feed';
import { MultiSourceStormDetector } from './services/multi-source-tracker';
import { AlertNotificationService } from './services/alert-notification-service';
import { StormTracker } from './ml/storm-tracker';
import { HailPredictorML } from './ml/hail-ml-model';
import { StormCell, Coordinates, SpotterReport, RainViewerFrame } from './types/meteorology';

import { RadarMapComponent } from './components/RadarMap';
import { TimelineControllerComponent } from './components/TimelineController';
import { AlertFeedComponent } from './components/AlertFeed';
import { ConvectiveTelemetryComponent } from './components/ConvectiveTelemetry';
import { LocationSearchComponent } from './components/LocationSearch';
import { SpotterModalComponent } from './components/SpotterModal';
import { NotificationModalComponent } from './components/NotificationModal';
import { SoundingProfileModalComponent } from './components/SoundingProfileModal';
import { DamageCalculatorModalComponent } from './components/DamageCalculatorModal';
import { SevereHailBulletinGenerator } from './services/bulletin-generator';

class HailCastApp {
  private static REFRESH_INTERVAL_KEY = 'hailcast_refresh_interval_ms';

  private radarMap!: RadarMapComponent;
  private timelineController!: TimelineControllerComponent;
  private alertFeed!: AlertFeedComponent;
  private telemetry!: ConvectiveTelemetryComponent;
  private locationSearch!: LocationSearchComponent;
  private spotterModal!: SpotterModalComponent;
  private notificationModal!: NotificationModalComponent;
  private soundingModal!: SoundingProfileModalComponent;
  private damageModal!: DamageCalculatorModalComponent;

  private baseStormCells: StormCell[] = [];
  private currentStormCells: StormCell[] = [];
  
  private basePerturbations: StormCell[] = []; // Reusing StormCell type for perturbations (they share polygons, velocity, etc)
  private currentPerturbations: StormCell[] = [];

  private currentSpotterReports: SpotterReport[] = [];
  private rainViewerHost: string = 'https://tilecache.rainviewer.com';
  private inspectedLocation: { coords: Coordinates; name: string } | null = null;
  private activeSelectedCell: StormCell | null = null;
  private refreshTimer: number | null = null;

  public appMode: 'hail' | 'storm' = 'hail';

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
    this.soundingModal = new SoundingProfileModalComponent();
    this.damageModal = new DamageCalculatorModalComponent();

    // 2. Registra gli eventi
    this.bindEvents();

    // 3. Carica i dati delle segnalazioni iniziali
    this.currentSpotterReports = SpotterFeedService.getReports();
    this.radarMap.renderSpotterReports(this.currentSpotterReports);

    // 4. Carica e rileva le celle temporalesche da fonti multiple (Radar + Open-Meteo CAPE + Spotter)
    await this.loadConvectiveStorms();

    // 5. Connettiti a RainViewer API per i frame radar in tempo reale
    await this.fetchLiveRadar();
    
    // Posiziona il player esattamente sul frame LIVE (Ora) all'avvio in pausa
    this.timelineController.jumpToLive();
    
    // Avvia orologio live in tempo reale (aggiornato ogni secondo)
    this.startLiveClockTicker();

    // Refresh automatico multi-sorgente con intervallo configurabile (30s / 1min / 5min)
    this.setupAutoRefresh();

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
        if (this.appMode === 'hail' && this.baseStormCells.length > 0) {
          this.currentStormCells = StormTracker.projectStormCellsForOffset(this.baseStormCells, offsetMinutes);
          this.radarMap.renderStormCells(this.currentStormCells);
          this.alertFeed.renderStormCells(this.currentStormCells);
        } else if (this.appMode === 'storm' && this.basePerturbations.length > 0) {
          this.currentPerturbations = StormTracker.projectStormCellsForOffset(this.basePerturbations, offsetMinutes);
          this.radarMap.renderStormCells(this.currentPerturbations); // Reuse rendering logic
          this.alertFeed.renderStormCells(this.currentPerturbations);
        }

        // Aggiorna le previsioni di innesco in direzione e le celle concretizzate
        this.updateGenesisForecasts(offsetMinutes);

        // Se l'utente sta monitorando una località, aggiorna l'ETA e la distanza in tempo reale
        if (this.inspectedLocation) {
          const cellsToAssess = this.appMode === 'hail' ? this.currentStormCells : this.currentPerturbations;
          const assessment = StormTracker.assessLocationRisk(this.inspectedLocation.name, this.inspectedLocation.coords, cellsToAssess);
          this.locationSearch.showRiskCard(assessment);
        }
    });

    // Toggle Mode
    document.getElementById('btnModeHail')?.addEventListener('click', () => {
      this.switchAppMode('hail');
    });

    document.getElementById('btnModeStorm')?.addEventListener('click', () => {
      this.switchAppMode('storm');
    });

    // Invio nuova segnalazione spotter da terra
    this.spotterModal.setOnReportSubmitted((report: SpotterReport) => {
      this.currentSpotterReports = SpotterFeedService.getReports();
      this.radarMap.renderSpotterReports(this.currentSpotterReports);
      this.radarMap.flyTo(report.coords, 11);

      AlertNotificationService.playAlertChime();

      const phenomEmoji = report.phenomenon === 'downburst' ? '💨' : (report.phenomenon === 'lightning' ? '⚡' : (report.phenomenon === 'torrential_rain' ? '🌧️' : '❄️'));
      this.alertFeed.addAlert(
        `${phenomEmoji} Nuova Segnalazione da ${report.locationName}: ${report.hailSizeCm > 0 ? report.hailSizeCm + ' cm' : 'vento ' + (report.windSpeedKmh || 65) + ' km/h'}!`,
        report.hailSizeCm > 3.0 ? 'danger' : 'warning'
      );
      this.showToast(`Segnalazione pubblicata live per ${report.locationName}!`, 'success');
    });

    // Tasti HUD Dual-Pol Polarimetric Radar Modes
    const dualPolBtns = document.querySelectorAll('.dualpol-btn');
    dualPolBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const targetBtn = e.currentTarget as HTMLElement;
        const mode = targetBtn.dataset.mode as 'reflectivity' | 'zdr' | 'correlation_coefficient';
        dualPolBtns.forEach(b => b.classList.remove('active'));
        targetBtn.classList.add('active');
        this.radarMap.setDualPolMode(mode);
        this.showToast(`Radar Dual-Pol: ${mode.toUpperCase()}`, 'info');
      });
    });

    // Tasti Header & Telemetria: Bollettino, Profilo HGZ, Calcolo Danni
    document.getElementById('btnOpenBulletin')?.addEventListener('click', () => {
      const assessment = this.inspectedLocation 
        ? StormTracker.assessLocationRisk(this.inspectedLocation.name, this.inspectedLocation.coords, this.currentStormCells)
        : null;
      SevereHailBulletinGenerator.generateAndOpenBulletin(this.activeSelectedCell, assessment, this.currentStormCells);
      this.showToast('📄 Bollettino Nowcast Grandine generato con successo!', 'success');
    });

    document.getElementById('btnOpenSoundingModal')?.addEventListener('click', async () => {
      const coords = this.activeSelectedCell?.centroid || this.inspectedLocation?.coords || { lat: 45.4, lng: 10.5 };
      const locName = this.activeSelectedCell?.name || this.inspectedLocation?.name || 'Pianura Padana / Settore Attivo';
      const profile = OpenMeteoService.getSyntheticVerticalProfile(coords, locName);
      this.soundingModal.open(profile);
    });

    document.getElementById('btnOpenDamageModal')?.addEventListener('click', () => {
      const hailDiam = this.activeSelectedCell?.meshDiameterCm || 3.5;
      const locName = this.activeSelectedCell?.name || this.inspectedLocation?.name || 'Settore Convettivo';
      this.damageModal.open(hailDiam, locName);
    });

    // Tasti HUD mappa
    document.getElementById('selectRadarSource')?.addEventListener('change', (e) => {
      const select = e.currentTarget as HTMLSelectElement;
      const source = select.value as 'rainviewer' | 'dpc-vmi' | 'dpc-sri';
      this.radarMap.setRadarSource(source);
      
      const sourceLabels: Record<string, string> = {
        'rainviewer': 'RainViewer Mosaic',
        'dpc-vmi': 'Protezione Civile DPC (VMI dBZ)',
        'dpc-sri': 'Protezione Civile DPC (SRI mm/h)'
      };
      
      const label = sourceLabels[source] || source;
      const statusText = document.getElementById('radarStatusText');
      if (statusText) {
        statusText.textContent = `RADAR: ${label.toUpperCase()} LIVE`;
      }
      this.alertFeed.addAlert(`Sorgente radar impostata: ${label}`, 'info');
      this.showToast(`Sorgente Radar: ${label}`, 'info');
    });

    document.getElementById('btnToggleDpcStations')?.addEventListener('click', (e) => {
      const btn = e.currentTarget as HTMLElement;
      btn.classList.toggle('active');
      const active = btn.classList.contains('active');
      this.radarMap.toggleDpcStations(active);
      this.showToast(active ? 'Rete Radar DPC (24+ stazioni) Visibile' : 'Rete Radar DPC Nascosta', 'info');
    });

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

    document.getElementById('btnToggleGenesis')?.addEventListener('click', (e) => {
      const btn = e.currentTarget as HTMLElement;
      btn.classList.toggle('active');
      const active = btn.classList.contains('active');
      this.radarMap.toggleGenesis(active);
      this.showToast(active ? 'Previsioni in Direzione ed Inneschi Visibili' : 'Inneschi Nascosti', 'info');
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

    // Gestione Welcome Modal (Made by Francesco Castaldi) - Disabilitato all'avvio per non ostacolare la vista radar
    const welcomeModal = document.getElementById('welcomeModal');
    const btnDismissWelcome = document.getElementById('btnDismissWelcome');
    
    // Assicura che il popup non compaia mai automaticamente all'apertura del sito
    if (welcomeModal) {
      welcomeModal.style.display = 'none';
    }

    const closeWelcomeModal = () => {
      if (welcomeModal) {
        welcomeModal.style.display = 'none';
      }
    };

    btnDismissWelcome?.addEventListener('click', closeWelcomeModal);

    // Chiusura al click sullo sfondo
    welcomeModal?.addEventListener('click', (e) => {
      if (e.target === welcomeModal) {
        closeWelcomeModal();
      }
    });

    // Apribile solo su richiesta esplicita cliccando sul logo
    document.querySelector('.logo-container')?.addEventListener('click', () => {
      if (welcomeModal) {
        welcomeModal.style.display = 'flex';
      }
    });

    // Gestione Navigazione Mobile con 4 Tasti Contestuali
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
      setMobileNavActive('btnNavGpsLocation');
    };

    mobileDrawerBackdrop?.addEventListener('click', () => {
      closeAllMobileDrawers();
    });

    btnCloseLeftSidebar?.addEventListener('click', () => {
      closeAllMobileDrawers();
    });

    // 1. Tasto Contestuale: 📍 Rileva Posizione GPS del Telefono & Calcola Rischio
    document.getElementById('btnNavGpsLocation')?.addEventListener('click', () => {
      closeAllMobileDrawers();
      setMobileNavActive('btnNavGpsLocation');

      if ('geolocation' in navigator) {
        this.showToast('📍 Rilevamento posizione GPS del telefono...', 'info');
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
            const locName = 'La tua posizione (GPS)';
            this.handleLocationInspection(coords, locName);
            this.showToast(`📍 Posizione rilevata: ${coords.lat.toFixed(3)}°N, ${coords.lng.toFixed(3)}°E`, 'success');
          },
          (err) => {
            console.warn('GPS negato o non disponibile:', err);
            // Centra sulla vista Italia o posizione salvata
            this.radarMap.resetView();
            this.showToast('Impossibile ottenere il GPS. Mappa centrata sull\'Italia.', 'warning');
          },
          { enableHighAccuracy: true, timeout: 8000 }
        );
      } else {
        this.radarMap.resetView();
        this.showToast('Geolocalizzazione non supportata dal browser.', 'warning');
      }
    });

    // 2. Tasto Contestuale: ⚡ Temporali & Nowcast
    document.getElementById('btnNavCells')?.addEventListener('click', () => {
      const isOpen = leftSidebar?.classList.toggle('mobile-open');
      this.telemetry.close();
      if (isOpen) {
        mobileDrawerBackdrop?.classList.add('active');
        setMobileNavActive('btnNavCells');
      } else {
        mobileDrawerBackdrop?.classList.remove('active');
        setMobileNavActive('btnNavGpsLocation');
      }
    });

    // 3. Tasto Contestuale: ❄️ Segnala Grandine/Temporale
    document.getElementById('btnNavSpotter')?.addEventListener('click', () => {
      closeAllMobileDrawers();
      setMobileNavActive('btnNavSpotter');
      this.spotterModal.open(this.inspectedLocation?.name, this.inspectedLocation?.coords);
    });

    // 4. Tasto Contestuale: 🔔 Gestione Allerte & Email
    document.getElementById('btnNavAlerts')?.addEventListener('click', () => {
      closeAllMobileDrawers();
      setMobileNavActive('btnNavAlerts');
      this.notificationModal.open(this.inspectedLocation?.name, this.inspectedLocation?.coords);
    });

    // Pulsante Apertura Modale Notifiche & Allerte Email da Header
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

  /**
   * Configura il refresh automatico dei dati radar con intervallo selezionabile
   * (30s / 1min / 5min, persistito in localStorage) e pulsante di aggiornamento manuale
   */
  private setupAutoRefresh(): void {
    const saved = parseInt(localStorage.getItem(HailCastApp.REFRESH_INTERVAL_KEY) || '30000', 10);
    const intervalMs = [30000, 60000, 300000].includes(saved) ? saved : 30000;

    const select = document.getElementById('refreshIntervalSelect') as HTMLSelectElement;
    if (select) select.value = intervalMs.toString();

    this.startAutoRefresh(intervalMs);

    select?.addEventListener('change', () => {
      const ms = parseInt(select.value, 10);
      localStorage.setItem(HailCastApp.REFRESH_INTERVAL_KEY, ms.toString());
      this.startAutoRefresh(ms);
      const label = ms >= 60000 ? `${ms / 60000} min` : `${ms / 1000}s`;
      this.showToast(`🔄 Aggiornamento dati radar ogni ${label}`, 'info');
    });

    document.getElementById('btnManualRefresh')?.addEventListener('click', async () => {
      this.showToast('🔄 Aggiornamento dati radar in corso...', 'info');
      await this.fetchLiveRadar(true);
      await this.refreshMultiSourceStorms();
      this.showToast('✅ Dati radar aggiornati', 'success');
    });
  }

  private startAutoRefresh(intervalMs: number): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
    this.refreshTimer = window.setInterval(async () => {
      await this.fetchLiveRadar(true);
      await this.refreshMultiSourceStorms();
    }, intervalMs);
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

    try {
      const detectedPerturbs = await MultiSourceStormDetector.scanAndDetectPerturbations();
      this.basePerturbations = detectedPerturbs;
    } catch (err) {
      console.warn('Fallback a perturbazioni vuote:', err);
      this.basePerturbations = [];
    }

    this.currentStormCells = this.baseStormCells;
    this.currentPerturbations = this.basePerturbations;

    this.updateUIForAppMode();
    this.updateGenesisForecasts(0);

    for (const cell of this.currentStormCells) {
      if (cell.severity === 'destructive' || cell.severity === 'severe') {
        this.alertFeed.addAlert(
          `ALLERTA GRANDINE: ${cell.name} (${cell.maxDbz} dBZ) - Rischio MESH ${cell.meshDiameterCm} cm verso ${Math.round(cell.velocity.directionDeg)}°`,
          'danger'
        );
      }
    }
  }

  /**
   * Aggiorna e renderizza le previsioni di innesco in direzione nella mappa e nella sidebar
   */
  private updateGenesisForecasts(offsetMinutes: number = 0): void {
    const forecasts = MultiSourceStormDetector.getGenesisForecasts(offsetMinutes);
    this.radarMap.renderGenesisForecasts(forecasts);

    const listContainer = document.getElementById('genesisForecastList');
    if (!listContainer) return;

    const activeForecasts = forecasts.filter(f => f.maturationStage !== 'concretized');

    if (activeForecasts.length === 0) {
      listContainer.innerHTML = '<div class="genesis-empty-msg">Nessun innesco imminente rilevato.</div>';
      return;
    }

    listContainer.innerHTML = activeForecasts.map(f => `
      <div class="genesis-card" data-genesis-id="${f.id}">
        <div class="genesis-card-header">
          <span class="genesis-tag-trigger">⚡ Innesco Imminente</span>
          <span class="genesis-conf-val">${f.triggerConfidenceScore}% Conf. Innesco</span>
        </div>
        <div class="genesis-card-title">${f.name}</div>
        <div class="genesis-card-corridor">
          <span>&rarr; ${f.directionCardinal} (${f.targetCorridor})</span>
        </div>

        <div class="genesis-card-hail-prob">
          <div class="card-prob-label">
            <span>❄️ Probabilità Grandine Vera:</span>
            <span class="card-prob-badge risk-${f.hailRiskLevel}">${f.hailConversionProbability}%</span>
          </div>
          <div class="card-prob-bar">
            <div class="card-prob-bar-fill risk-${f.hailRiskLevel}" style="width: ${f.hailConversionProbability}%"></div>
          </div>
        </div>

        <div class="genesis-card-meta">
          <span class="meta-item-eta">ETA: <b>~${f.etaMinutes} min</b></span>
          <span class="meta-item-hail">Chicco: <b>~${f.expectedMeshDiameterCm} cm</b></span>
        </div>
      </div>
    `).join('');

    // Attach click listeners to cards to focus the map
    listContainer.querySelectorAll('.genesis-card').forEach(card => {
      card.addEventListener('click', (e) => {
        const id = (e.currentTarget as HTMLElement).dataset.genesisId;
        const targetForecast = activeForecasts.find(f => f.id === id);
        if (targetForecast) {
          this.radarMap.flyTo(targetForecast.originCoords, 10);
          this.showToast(`🎯 Inquadrata zona di innesco: ${targetForecast.name}`, 'info');
        }
      });
    });
  }

  private switchAppMode(mode: 'hail' | 'storm'): void {
    if (this.appMode === mode) return;
    this.appMode = mode;
    
    // Update active button
    document.getElementById('btnModeHail')?.classList.remove('active');
    document.getElementById('btnModeStorm')?.classList.remove('active');
    
    if (mode === 'hail') {
      document.getElementById('btnModeHail')?.classList.add('active');
      document.body.classList.remove('mode-storm');
      document.body.classList.add('mode-hail');
      const sidebarTitle = document.getElementById('sidebarMainTitle');
      if (sidebarTitle) sidebarTitle.textContent = 'Temporali Attivi';
    } else {
      document.getElementById('btnModeStorm')?.classList.add('active');
      document.body.classList.remove('mode-hail');
      document.body.classList.add('mode-storm');
      const sidebarTitle = document.getElementById('sidebarMainTitle');
      if (sidebarTitle) sidebarTitle.textContent = 'Perturbazioni Attive';
    }

    this.updateUIForAppMode();
    this.showToast(`Modalità ${mode === 'hail' ? 'Grandine' : 'Perturbazioni'} Attivata`, 'info');
  }

  private updateUIForAppMode(): void {
    if (this.appMode === 'hail') {
      this.radarMap.renderStormCells(this.currentStormCells);
      this.alertFeed.renderStormCells(this.currentStormCells);
    } else {
      this.radarMap.renderStormCells(this.currentPerturbations);
      this.alertFeed.renderStormCells(this.currentPerturbations);
    }
    
    if (this.inspectedLocation) {
      const cellsToAssess = this.appMode === 'hail' ? this.currentStormCells : this.currentPerturbations;
      const assessment = StormTracker.assessLocationRisk(
        this.inspectedLocation.name,
        this.inspectedLocation.coords,
        cellsToAssess
      );
      this.locationSearch.showRiskCard(assessment);
    }
  }

  private async refreshMultiSourceStorms(): Promise<void> {
    try {
      const previousIds = new Set(this.baseStormCells.map(c => c.id));
      const freshCells = await MultiSourceStormDetector.scanAndDetectCells();
      
      const freshIds = new Set(freshCells.map(c => c.id));
      this.baseStormCells = freshCells;
      this.currentStormCells = freshCells;
      
      const freshPerturbs = await MultiSourceStormDetector.scanAndDetectPerturbations();
      this.basePerturbations = freshPerturbs;
      this.currentPerturbations = freshPerturbs;

      this.updateUIForAppMode();

      // Notifica celle dissolte
      for (const oldId of previousIds) {
        if (!freshIds.has(oldId)) {
          console.log(`ℹ️ Cella temporalesca ${oldId} dissolta e rimossa dal radar.`);
        }
      }

      // Notifica eventuali nuove celle convettive rilevate
      for (const cell of freshCells) {
        if (!previousIds.has(cell.id) && (cell.severity === 'destructive' || cell.severity === 'severe')) {
          this.showToast(`Nuova cella rilevata da multi-feed: ${cell.name} (${cell.meshDiameterCm} cm)`, 'warning');
          this.alertFeed.addAlert(`Nuovo nucleo convettivo rilevato da Radar & Open-Meteo: ${cell.name} (${cell.maxDbz} dBZ)`, 'danger');
        }
      }

        // Se l'utente sta monitorando una località, aggiorna i dati in tempo reale
        if (this.inspectedLocation) {
          const cellsToAssess = this.appMode === 'hail' ? this.currentStormCells : this.currentPerturbations;
          const assessment = StormTracker.assessLocationRisk(
            this.inspectedLocation.name,
            this.inspectedLocation.coords,
            cellsToAssess
          );
          this.locationSearch.showRiskCard(assessment);
        }

        // Verifica le allerte per l'eventuale sottoscrizione email/push configurata dall'utente
        const alertCells = this.appMode === 'hail' ? this.currentStormCells : this.currentPerturbations;
        const alertCheck = AlertNotificationService.checkStormCellAlerts(alertCells);
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
    } catch (err) {
      console.warn('Errore refresh celle multi-fonte:', err);
    }
  }

  private inspectStormCell(cell: StormCell): void {
    this.activeSelectedCell = cell;
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
}

// Avvio applicazione al caricamento del DOM
document.addEventListener('DOMContentLoaded', () => {
  new HailCastApp();
});
