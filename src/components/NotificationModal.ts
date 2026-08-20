import { AlertSubscription, Coordinates } from '../types/meteorology';
import { AlertNotificationService } from '../services/alert-notification-service';

export class NotificationModalComponent {
  private modalBackdrop: HTMLElement;
  private form: HTMLFormElement;
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

  private currentCoords: Coordinates = { lat: 45.438, lng: 10.991 }; // Default: Verona
  private currentLocationName: string = 'Verona, Veneto';
  private onSubscriptionUpdatedCallback?: (sub: AlertSubscription) => void;

  constructor() {
    this.modalBackdrop = document.getElementById('notificationModal') as HTMLElement;
    this.form = document.getElementById('notificationForm') as HTMLFormElement;
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

    this.loadSavedSubscription();
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
      if (this.locationInput) {
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

  private switchTab(tabId: string): void {
    // Aggiorna bottoni
    document.querySelectorAll('.notif-tab-btn').forEach(btn => {
      if (btn.getAttribute('data-tab') === tabId) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    // Aggiorna pannelli
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

  private loadSavedSubscription(): void {
    const saved = AlertNotificationService.getSubscription();
    if (saved) {
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
          <small>Configura la tua prima città nella scheda "Configura Allerta".</small>
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
            <strong>${sub.locationName}</strong>
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
          <button class="btn-toggle-sub btn btn-secondary btn-xs" data-id="${sub.id}">
            ${sub.enabled ? 'Sospendi ⏸️' : 'Riattiva ▶️'}
          </button>
          <button class="btn-remove-sub btn btn-secondary btn-xs danger-hover" data-id="${sub.id}">
            Rimuovi 🗑️
          </button>
        </div>
      `;

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

      const tempSub: AlertSubscription = {
        enabled: true,
        email,
        locationName: location,
        coords: this.currentCoords,
        hailThresholdCm: parseFloat(this.hailThresholdSelect?.value || '0'),
        rainThresholdMm: parseFloat(this.rainThresholdSelect?.value || '10'),
        leadTimeMinutes: parseInt(this.leadTimeSelect?.value || '30', 10),
        enableBrowserPush: this.pushCheckbox?.checked || false
      };

      AlertNotificationService.playAlertChime();

      const res = await AlertNotificationService.sendEmailAlert(tempSub, 'hail', {
        cellName: 'Supercella Gardesana (Cell #104)',
        hailSizeCm: 3.8,
        etaMinutes: 22,
        maxDbz: 64
      });

      this.btnTestEmail.innerHTML = originalBtnText;
      (this.btnTestEmail as HTMLButtonElement).disabled = false;

      if (this.emailPreviewContainer) {
        this.emailPreviewContainer.innerHTML = `
          <div class="test-email-success-badge">
            ✅ <strong>Email Inviata con Successo a ${email}!</strong>
            <p style="margin: 6px 0 0 0; font-size: 0.8rem; font-weight: normal; color: #cbd5e1;">
              Controlla la tua casella di posta (inclusa la cartella <em>Spam / Posta Indesiderata o Promozioni</em>).
              <br><small style="color: #94a3b8;">La prima volta, FormSubmit invia una mail di attivazione per autorizzare le notifiche automatiche.</small>
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

      if (!email) return;

      let enablePush = this.pushCheckbox.checked;
      if (enablePush) {
        const granted = await AlertNotificationService.requestBrowserPermission();
        if (!granted) {
          enablePush = false;
        }
      }

      const sub: AlertSubscription = {
        id: `sub-${Date.now()}`,
        enabled: true,
        email,
        locationName: location || this.currentLocationName,
        coords: this.currentCoords,
        hailThresholdCm: parseFloat(this.hailThresholdSelect.value),
        rainThresholdMm: parseFloat(this.rainThresholdSelect.value),
        leadTimeMinutes: parseInt(this.leadTimeSelect.value, 10),
        enableBrowserPush: enablePush
      };

      AlertNotificationService.saveSubscription(sub);
      this.refreshTabsData();
      this.switchTab('tabActivePanel');

      if (this.onSubscriptionUpdatedCallback) {
        this.onSubscriptionUpdatedCallback(sub);
      }
    });
  }
}
