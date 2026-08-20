import { AlertSubscription, Coordinates } from '../types/meteorology';
import { AlertNotificationService } from '../services/alert-notification-service';

const ITALIAN_TOWNS_GEO: Record<string, Coordinates> = {
  'verona': { lat: 45.438, lng: 10.991 },
  'desenzano': { lat: 45.470, lng: 10.536 },
  'peschiera': { lat: 45.438, lng: 10.692 },
  'gardone': { lat: 45.620, lng: 10.560 },
  'salò': { lat: 45.608, lng: 10.528 },
  'sirmione': { lat: 45.492, lng: 10.607 },
  'bardolino': { lat: 45.548, lng: 10.720 },
  'lazise': { lat: 45.505, lng: 10.732 },
  'torri': { lat: 45.609, lng: 10.686 },
  'malcesine': { lat: 45.764, lng: 10.808 },
  'riva': { lat: 45.885, lng: 10.841 },
  'affi': { lat: 45.553, lng: 10.796 },
  'bussolengo': { lat: 45.474, lng: 10.846 },
  'villafranca': { lat: 45.351, lng: 10.843 },
  'valeggio': { lat: 45.354, lng: 10.734 },
  'sommacampagna': { lat: 45.405, lng: 10.826 },
  'san bonifacio': { lat: 45.398, lng: 11.277 },
  'legnago': { lat: 45.193, lng: 11.310 },
  'milano': { lat: 45.464, lng: 9.189 },
  'brescia': { lat: 45.541, lng: 10.211 },
  'bergamo': { lat: 45.698, lng: 9.677 },
  'monza': { lat: 45.584, lng: 9.274 },
  'como': { lat: 45.808, lng: 9.085 },
  'varese': { lat: 45.820, lng: 8.825 },
  'mantova': { lat: 45.156, lng: 10.791 },
  'cremona': { lat: 45.133, lng: 10.022 },
  'pavia': { lat: 45.185, lng: 9.155 },
  'vicenza': { lat: 45.545, lng: 11.535 },
  'padova': { lat: 45.406, lng: 11.876 },
  'treviso': { lat: 45.666, lng: 12.243 },
  'venezia': { lat: 45.440, lng: 12.315 },
  'trento': { lat: 46.067, lng: 11.121 },
  'bolzano': { lat: 46.498, lng: 11.354 },
  'udine': { lat: 46.063, lng: 13.235 },
  'pordenone': { lat: 45.956, lng: 12.660 },
  'trieste': { lat: 45.649, lng: 13.776 },
  'torino': { lat: 45.070, lng: 7.686 },
  'novara': { lat: 45.446, lng: 8.620 },
  'alessandria': { lat: 44.912, lng: 8.615 },
  'asti': { lat: 44.900, lng: 8.206 },
  'cuneo': { lat: 44.384, lng: 7.542 },
  'genova': { lat: 44.405, lng: 8.946 },
  'bologna': { lat: 44.494, lng: 11.342 },
  'modena': { lat: 44.647, lng: 10.925 },
  'reggio emilia': { lat: 44.698, lng: 10.631 },
  'parma': { lat: 44.801, lng: 10.327 },
  'piacenza': { lat: 45.052, lng: 9.692 },
  'ferrara': { lat: 44.838, lng: 11.619 },
  'ravenna': { lat: 44.418, lng: 12.203 },
  'forlì': { lat: 44.222, lng: 12.040 },
  'cesena': { lat: 44.139, lng: 12.243 },
  'rimini': { lat: 44.059, lng: 12.568 },
  'firenze': { lat: 43.769, lng: 11.255 },
  'pisa': { lat: 43.722, lng: 10.401 },
  'livorno': { lat: 43.548, lng: 10.310 },
  'lucca': { lat: 43.842, lng: 10.502 },
  'arezzo': { lat: 43.463, lng: 11.879 },
  'siena': { lat: 43.318, lng: 11.330 },
  'ancona': { lat: 43.615, lng: 13.518 },
  'pesaro': { lat: 43.912, lng: 12.915 },
  'perugia': { lat: 43.110, lng: 12.390 },
  'terni': { lat: 42.564, lng: 12.641 },
  'roma': { lat: 41.902, lng: 12.496 },
  'latina': { lat: 41.467, lng: 12.903 },
  'viterbo': { lat: 42.417, lng: 12.104 },
  'frosinone': { lat: 41.643, lng: 13.351 },
  'pescara': { lat: 42.461, lng: 14.216 },
  'l\'aquila': { lat: 42.349, lng: 13.399 },
  'napoli': { lat: 40.851, lng: 14.268 },
  'salerno': { lat: 40.682, lng: 14.768 },
  'caserta': { lat: 41.072, lng: 14.332 },
  'bari': { lat: 41.117, lng: 16.871 },
  'foggia': { lat: 41.462, lng: 15.544 },
  'lecce': { lat: 40.354, lng: 18.174 },
  'taranto': { lat: 40.476, lng: 17.229 },
  'potenza': { lat: 40.640, lng: 15.805 },
  'catanzaro': { lat: 38.909, lng: 16.587 },
  'reggio calabria': { lat: 38.111, lng: 15.647 },
  'cosenza': { lat: 39.300, lng: 16.250 },
  'palermo': { lat: 38.115, lng: 13.361 },
  'catania': { lat: 37.507, lng: 15.087 },
  'messina': { lat: 38.193, lng: 15.554 },
  'cagliari': { lat: 39.223, lng: 9.121 },
  'sassari': { lat: 40.725, lng: 8.560 }
};

export class NotificationModalComponent {
  private modalBackdrop: HTMLElement;
  private form: HTMLFormElement;
  private subIdInput: HTMLInputElement;
  private labelInput: HTMLInputElement;
  private emailInput: HTMLInputElement;
  private locationInput: HTMLInputElement;
  private hailThresholdSelect: HTMLSelectElement;
  private rainThresholdSelect: HTMLSelectElement;
  private leadTimeSelect: HTMLSelectElement;
  private pushCheckbox: HTMLInputElement;
  private btnClose: HTMLElement;
  private btnCancel: HTMLElement;
  private btnTestEmail: HTMLElement;
  private emailPreviewContainer: HTMLElement;

  private activeListContainer: HTMLElement;
  private historyListContainer: HTMLElement;
  private activeSubsCountEl: HTMLElement;
  private historyCountEl: HTMLElement;
  private btnClearHistory: HTMLElement;
  private btnAddNewAlert: HTMLElement;

  private currentCoords: Coordinates = { lat: 45.438, lng: 10.991 }; // Default: Verona
  private currentLocationName: string = 'Verona, Veneto';
  private onSubscriptionUpdatedCallback?: (sub: AlertSubscription) => void;

  constructor() {
    this.modalBackdrop = document.getElementById('notificationModal') as HTMLElement;
    this.form = document.getElementById('notificationForm') as HTMLFormElement;
    this.subIdInput = document.getElementById('alertSubId') as HTMLInputElement;
    this.labelInput = document.getElementById('alertLabelInput') as HTMLInputElement;
    this.emailInput = document.getElementById('alertEmailInput') as HTMLInputElement;
    this.locationInput = document.getElementById('alertLocationInput') as HTMLInputElement;
    this.hailThresholdSelect = document.getElementById('hailThresholdSelect') as HTMLSelectElement;
    this.rainThresholdSelect = document.getElementById('rainThresholdSelect') as HTMLSelectElement;
    this.leadTimeSelect = document.getElementById('leadTimeSelect') as HTMLSelectElement;
    this.pushCheckbox = document.getElementById('enablePushCheckbox') as HTMLInputElement;
    this.btnClose = document.getElementById('btnCloseNotificationModal') as HTMLElement;
    this.btnCancel = document.getElementById('btnCancelNotification') as HTMLElement;
    this.btnTestEmail = document.getElementById('btnTestEmailAlert') as HTMLElement;
    this.emailPreviewContainer = document.getElementById('emailPreviewContainer') as HTMLElement;

    this.activeListContainer = document.getElementById('activeAlertsListContainer') as HTMLElement;
    this.historyListContainer = document.getElementById('alertHistoryListContainer') as HTMLElement;
    this.activeSubsCountEl = document.getElementById('activeSubsCount') as HTMLElement;
    this.historyCountEl = document.getElementById('historyCount') as HTMLElement;
    this.btnClearHistory = document.getElementById('btnClearAlertHistory') as HTMLElement;
    this.btnAddNewAlert = document.getElementById('btnAddNewAlert') as HTMLElement;

    this.loadFirstSubscription();
    this.bindEvents();
    this.refreshTabsData();
  }

  public setOnSubscriptionUpdated(callback: (sub: AlertSubscription) => void): void {
    this.onSubscriptionUpdatedCallback = callback;
  }

  public open(locationName?: string, coords?: Coordinates, tabId: string = 'tabConfigPanel'): void {
    if (locationName && coords) {
      this.currentLocationName = locationName;
      this.currentCoords = coords;
      if (this.locationInput && !this.subIdInput?.value) {
        this.locationInput.value = locationName;
      }
    }
    this.refreshTabsData();
    this.switchTab(tabId);
    if (this.modalBackdrop) {
      this.modalBackdrop.style.display = 'flex';
    }
  }

  public close(): void {
    if (this.modalBackdrop) {
      this.modalBackdrop.style.display = 'none';
    }
    if (this.emailPreviewContainer) {
      this.emailPreviewContainer.style.display = 'none';
    }
  }

  public resetForm(locationName?: string, coords?: Coordinates): void {
    if (this.subIdInput) this.subIdInput.value = '';
    if (this.labelInput) this.labelInput.value = '';
    if (this.locationInput) this.locationInput.value = locationName || this.currentLocationName;
    if (this.hailThresholdSelect) this.hailThresholdSelect.value = '2.0';
    if (this.rainThresholdSelect) this.rainThresholdSelect.value = '10';
    if (this.leadTimeSelect) this.leadTimeSelect.value = '30';
    if (this.pushCheckbox) this.pushCheckbox.checked = true;
    if (coords) this.currentCoords = coords;
    if (this.emailPreviewContainer) this.emailPreviewContainer.style.display = 'none';
  }

  private switchTab(tabId: string): void {
    document.querySelectorAll('.notif-tab-btn').forEach(btn => {
      if (btn.getAttribute('data-tab') === tabId) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    document.querySelectorAll('.notif-tab-panel').forEach(panel => {
      if (panel.id === tabId) {
        (panel as HTMLElement).style.display = 'block';
      } else {
        (panel as HTMLElement).style.display = 'none';
      }
    });

    this.refreshTabsData();
  }

  private refreshTabsData(): void {
    this.renderActiveSubscriptions();
    this.renderHistory();
  }

  private loadFirstSubscription(): void {
    const saved = AlertNotificationService.getSubscription();
    if (saved) {
      if (this.subIdInput) this.subIdInput.value = saved.id || '';
      if (this.labelInput) this.labelInput.value = saved.label || '';
      if (this.emailInput) this.emailInput.value = saved.email;
      if (this.locationInput) this.locationInput.value = saved.locationName;
      if (this.hailThresholdSelect) this.hailThresholdSelect.value = saved.hailThresholdCm.toString();
      if (this.rainThresholdSelect) this.rainThresholdSelect.value = saved.rainThresholdMm.toString();
      if (this.leadTimeSelect) this.leadTimeSelect.value = saved.leadTimeMinutes.toString();
      if (this.pushCheckbox) this.pushCheckbox.checked = saved.enableBrowserPush;
      this.currentCoords = saved.coords;
      this.currentLocationName = saved.locationName;
    }
  }

  private loadSubscriptionIntoForm(sub: AlertSubscription): void {
    if (this.subIdInput) this.subIdInput.value = sub.id || '';
    if (this.labelInput) this.labelInput.value = sub.label || '';
    if (this.emailInput) this.emailInput.value = sub.email;
    if (this.locationInput) this.locationInput.value = sub.locationName;
    if (this.hailThresholdSelect) this.hailThresholdSelect.value = sub.hailThresholdCm.toString();
    if (this.rainThresholdSelect) this.rainThresholdSelect.value = sub.rainThresholdMm.toString();
    if (this.leadTimeSelect) this.leadTimeSelect.value = sub.leadTimeMinutes.toString();
    if (this.pushCheckbox) this.pushCheckbox.checked = sub.enableBrowserPush;
    this.currentCoords = sub.coords;
    this.currentLocationName = sub.locationName;
    this.switchTab('tabConfigPanel');
  }

  private resolveCoordinates(locationName: string): Coordinates {
    const clean = locationName.toLowerCase().trim();
    for (const [name, coords] of Object.entries(ITALIAN_TOWNS_GEO)) {
      if (clean.includes(name)) {
        return coords;
      }
    }
    return this.currentCoords;
  }

  private renderActiveSubscriptions(): void {
    const list = AlertNotificationService.getSubscriptions();
    if (this.activeSubsCountEl) {
      this.activeSubsCountEl.textContent = list.filter(s => s.enabled).length.toString();
    }

    if (!this.activeListContainer) return;

    if (list.length === 0) {
      this.activeListContainer.innerHTML = `
        <div class="empty-alerts-box">
          <span class="empty-icon">📍</span>
          <p>Nessuna allerta mail attiva al momento.</p>
          <small>Configura la tua prima città nella scheda "Configura Allerta" o clicca su "+ Nuova Allerta".</small>
        </div>
      `;
      return;
    }

    this.activeListContainer.innerHTML = '';
    for (const sub of list) {
      const card = document.createElement('div');
      card.className = `alert-sub-card ${sub.enabled ? 'active' : 'disabled'}`;
      card.innerHTML = `
        <div class="sub-card-header">
          <div class="sub-card-title">
            <span class="sub-pin">📍</span>
            <strong>${sub.label ? `<span class="sub-custom-tag">${sub.label}</span> ` : ''}${sub.locationName}</strong>
          </div>
          <div class="sub-status-pill ${sub.enabled ? 'live' : 'off'}">
            ${sub.enabled ? 'MONITORAGGIO ATTIVO 🟢' : 'SOSPESO ⚪'}
          </div>
        </div>

        <div class="sub-card-body">
          <div class="sub-info-row">
            <span>Email:</span> <b>${sub.email}</b>
          </div>
          <div class="sub-info-row">
            <span>Soglie:</span> 
            <b>Grandine &gt; ${sub.hailThresholdCm} cm | Pioggia &gt; ${sub.rainThresholdMm} mm/h | Preavviso ${sub.leadTimeMinutes} min</b>
          </div>
          <div class="sub-info-row">
            <span>Notifiche Browser:</span> 
            <b>${sub.enableBrowserPush ? 'Abilitate ✅' : 'Disattivate'}</b>
          </div>
        </div>

        <div class="sub-card-actions">
          <button class="btn-edit-sub btn btn-secondary btn-xs" data-id="${sub.id}">
            Modifica ✏️
          </button>
          <button class="btn-toggle-sub btn btn-secondary btn-xs" data-id="${sub.id}">
            ${sub.enabled ? 'Sospendi ⏸️' : 'Riattiva ▶️'}
          </button>
          <button class="btn-remove-sub btn btn-secondary btn-xs danger-hover" data-id="${sub.id}">
            Rimuovi 🗑️
          </button>
        </div>
      `;

      card.querySelector('.btn-edit-sub')?.addEventListener('click', () => {
        this.loadSubscriptionIntoForm(sub);
      });

      card.querySelector('.btn-toggle-sub')?.addEventListener('click', () => {
        AlertNotificationService.toggleSubscription(sub.id || sub.locationName, !sub.enabled);
        this.renderActiveSubscriptions();
      });

      card.querySelector('.btn-remove-sub')?.addEventListener('click', () => {
        if (confirm(`Rimuovere il monitoraggio allerte per ${sub.locationName}?`)) {
          AlertNotificationService.removeSubscription(sub.id || sub.locationName);
          this.renderActiveSubscriptions();
        }
      });

      this.activeListContainer.appendChild(card);
    }
  }

  private renderHistory(): void {
    const history = AlertNotificationService.getHistory();
    if (this.historyCountEl) {
      this.historyCountEl.textContent = history.length.toString();
    }

    if (!this.historyListContainer) return;

    if (history.length === 0) {
      this.historyListContainer.innerHTML = `
        <div class="empty-alerts-box">
          <span class="empty-icon">📜</span>
          <p>Nessuna allerta registrata nello storico.</p>
          <small>Le email e gli avvisi inviati compariranno automaticamente qui in ordine cronologico.</small>
        </div>
      `;
      return;
    }

    this.historyListContainer.innerHTML = '';
    for (const item of history) {
      const row = document.createElement('div');
      const isHail = item.alertType === 'hail';
      const isRain = item.alertType === 'rain';
      row.className = `history-item-row alert-${isHail ? 'danger' : isRain ? 'warning' : 'info'}`;
      row.innerHTML = `
        <div class="history-item-top">
          <div class="history-type">
            <span class="history-emoji">${isHail ? '❄️ ALLERTA GRANDINE' : isRain ? '🌧️ ALLERTA PIOGGIA' : '🔔 TEST DI VERIFICA'}</span>
            <strong>${item.locationName}</strong>
          </div>
          <span class="history-time">${item.timestamp}</span>
        </div>
        <div class="history-item-msg">${item.message}</div>
        <div class="history-item-footer">
          <span>Destinatario: <b>${item.email}</b></span>
          ${item.hailSizeCm ? `<span class="hail-pill">Chicchi: ${item.hailSizeCm} cm</span>` : ''}
          ${item.etaMinutes ? `<span class="eta-pill">ETA: ~${item.etaMinutes} min</span>` : ''}
          <span class="badge-dispatched">INVIATA CON SUCCESSO ✅</span>
        </div>
      `;
      this.historyListContainer.appendChild(row);
    }
  }

  private bindEvents(): void {
    this.btnClose?.addEventListener('click', () => this.close());
    this.btnCancel?.addEventListener('click', () => this.close());

    // Click + Nuova Allerta
    this.btnAddNewAlert?.addEventListener('click', () => {
      this.resetForm();
      this.switchTab('tabConfigPanel');
    });

    // Tab buttons click
    document.querySelectorAll('.notif-tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const target = e.currentTarget as HTMLElement;
        const tabId = target.getAttribute('data-tab');
        if (tabId) {
          this.switchTab(tabId);
        }
      });
    });

    // Svuota Storico
    this.btnClearHistory?.addEventListener('click', () => {
      if (confirm('Sei sicuro di voler cancellare tutto lo storico delle allerte inviate?')) {
        AlertNotificationService.clearHistory();
        this.renderHistory();
      }
    });

    this.modalBackdrop?.addEventListener('click', (e) => {
      if (e.target === this.modalBackdrop) {
        this.close();
      }
    });

    // Test Email Alert con invio HTTP reale tramite Gateway
    this.btnTestEmail?.addEventListener('click', async () => {
      const email = this.emailInput?.value?.trim();
      const location = this.locationInput?.value?.trim() || this.currentLocationName;

      if (!email || !email.includes('@')) {
        alert('Inserisci prima un indirizzo email valido (es. nome@gmail.com).');
        this.emailInput?.focus();
        return;
      }

      const originalBtnText = this.btnTestEmail.innerHTML;
      this.btnTestEmail.innerHTML = '<span>⏳ Invio Email in corso verso i server...</span>';
      (this.btnTestEmail as HTMLButtonElement).disabled = true;

      const resolvedCoords = this.resolveCoordinates(location);

      const tempSub: AlertSubscription = {
        label: this.labelInput?.value?.trim() || undefined,
        enabled: true,
        email,
        locationName: location,
        coords: resolvedCoords,
        hailThresholdCm: parseFloat(this.hailThresholdSelect?.value || '0'),
        rainThresholdMm: parseFloat(this.rainThresholdSelect?.value || '10'),
        leadTimeMinutes: parseInt(this.leadTimeSelect?.value || '30', 10),
        enableBrowserPush: this.pushCheckbox?.checked || false
      };

      AlertNotificationService.playAlertChime();

      const res = await AlertNotificationService.sendEmailAlert(tempSub, 'test', {});

      this.btnTestEmail.innerHTML = originalBtnText;
      (this.btnTestEmail as HTMLButtonElement).disabled = false;

      if (this.emailPreviewContainer) {
        this.emailPreviewContainer.innerHTML = `
          <div class="test-email-success-badge" style="border-color: #00f0ff; background: rgba(0, 240, 255, 0.12);">
            ✅ <strong>Email di Attivazione Inviata a ${email}!</strong>
            <p style="margin: 8px 0 0 0; font-size: 0.84rem; font-weight: 500; color: #e2e8f0; line-height: 1.45;">
              📩 <strong>Azione Richiesta:</strong> Apri la tua casella di posta (controlla anche in <em>Spam / Posta Indesiderata o Promozioni</em>) e <strong>fai clic sul pulsante "Activate Form"</strong> per accettare e iniziare a ricevere le allerte automatiche per <strong>${location}</strong>!
            </p>
          </div>
          ${res.previewHtml}
        `;
        this.emailPreviewContainer.style.display = 'block';
      }

      if (tempSub.enableBrowserPush) {
        const granted = await AlertNotificationService.requestBrowserPermission();
        if (granted) {
          AlertNotificationService.sendBrowserNotification(
            `⚡ HailCast: Allerta per ${location}`,
            `Notifiche meteo live collegate alla tua email ${email}!`
          );
        }
      }

      this.refreshTabsData();
    });

    // Salva sottoscrizione
    this.form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = this.emailInput.value.trim();
      const location = this.locationInput.value.trim();
      const label = this.labelInput.value.trim();
      const existingId = this.subIdInput.value.trim();

      if (!email) return;

      let enablePush = this.pushCheckbox.checked;
      if (enablePush) {
        const granted = await AlertNotificationService.requestBrowserPermission();
        if (!granted) {
          enablePush = false;
        }
      }

      const resolvedCoords = this.resolveCoordinates(location || this.currentLocationName);

      const sub: AlertSubscription = {
        id: existingId || `sub-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        label: label || undefined,
        enabled: true,
        email,
        locationName: location || this.currentLocationName,
        coords: resolvedCoords,
        hailThresholdCm: parseFloat(this.hailThresholdSelect.value),
        rainThresholdMm: parseFloat(this.rainThresholdSelect.value),
        leadTimeMinutes: parseInt(this.leadTimeSelect.value, 10),
        enableBrowserPush: enablePush
      };

      AlertNotificationService.saveSubscription(sub);
      this.resetForm();
      this.refreshTabsData();
      this.switchTab('tabActivePanel');

      if (this.onSubscriptionUpdatedCallback) {
        this.onSubscriptionUpdatedCallback(sub);
      }
    });
  }
}
