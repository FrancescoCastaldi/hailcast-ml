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

    this.loadSavedSubscription();
    this.bindEvents();
  }

  public setOnSubscriptionUpdated(callback: (sub: AlertSubscription) => void): void {
    this.onSubscriptionUpdatedCallback = callback;
  }

  public open(locationName?: string, coords?: Coordinates): void {
    if (locationName && coords) {
      this.currentLocationName = locationName;
      this.currentCoords = coords;
      if (this.locationInput) {
        this.locationInput.value = locationName;
      }
    }
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

  private bindEvents(): void {
    this.btnClose?.addEventListener('click', () => this.close());
    this.btnCancel?.addEventListener('click', () => this.close());

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

      // Suona segnale acustico d'allerta
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
      this.close();

      if (this.onSubscriptionUpdatedCallback) {
        this.onSubscriptionUpdatedCallback(sub);
      }
    });
  }
}
