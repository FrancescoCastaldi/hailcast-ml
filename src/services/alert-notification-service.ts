import { AlertSubscription, StormCell } from '../types/meteorology';
import { StormTracker } from '../ml/storm-tracker';

export class AlertNotificationService {
  private static STORAGE_KEY = 'hailcast_alert_subscription';
  private static NOTIFICATION_COOLDOWN_MS = 15 * 60 * 1000; // 15 minuti di cooldown tra avvisi per la stessa cella

  /**
   * Recupera la configurazione di sottoscrizione salvata
   */
  public static getSubscription(): AlertSubscription | null {
    try {
      const data = localStorage.getItem(this.STORAGE_KEY);
      if (!data) return null;
      return JSON.parse(data) as AlertSubscription;
    } catch {
      return null;
    }
  }

  /**
   * Salva o aggiorna la sottoscrizione notifiche
   */
  public static saveSubscription(sub: AlertSubscription): void {
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(sub));
  }

  /**
   * Richiede il permesso per le notifiche native del browser (Web Notifications API)
   */
  public static async requestBrowserPermission(): Promise<boolean> {
    if (!('Notification' in window)) {
      console.warn('Questo browser non supporta le notifiche desktop.');
      return false;
    }

    if (Notification.permission === 'granted') {
      return true;
    }

    if (Notification.permission !== 'denied') {
      const permission = await Notification.requestPermission();
      return permission === 'granted';
    }

    return false;
  }

  /**
   * Invia una notifica push del browser
   */
  public static sendBrowserNotification(title: string, body: string): void {
    if (!('Notification' in window) || Notification.permission !== 'granted') {
      return;
    }

    try {
      new Notification(title, {
        body,
        icon: './favicon.png',
        badge: './favicon.png',
        tag: 'hailcast-alert',
        vibrate: [200, 100, 200]
      } as NotificationOptions);
    } catch (e) {
      console.warn('Errore invio notifica browser:', e);
    }
  }

  /**
   * Simula ed invia l'alert email all'utente registrato
   */
  public static async sendEmailAlert(
    subscription: AlertSubscription,
    alertType: 'hail' | 'rain',
    details: {
      cellName?: string;
      hailSizeCm?: number;
      etaMinutes?: number;
      maxDbz?: number;
    }
  ): Promise<{ success: boolean; previewHtml: string }> {
    const timestamp = new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
    
    let subject = '';
    let bodyText = '';
    let advice = '';

    if (alertType === 'hail') {
      subject = `⚠️ ALLERTA GRANDINE per ${subscription.locationName}: Chicchi stimati ${details.hailSizeCm || 2.5} cm in arrivo in ~${details.etaMinutes || 20} min!`;
      bodyText = `È stata rilevata una cella convettiva severa (${details.cellName || 'Supercella'}, intensità ${details.maxDbz || 60} dBZ) in rotta verso ${subscription.locationName}.`;
      advice = `Metti subito al riparo autovetture, chiudi tapparelle ed evita di sostare all'aperto nelle prossime ore.`;
    } else {
      subject = `🌧️ ALLERTA PIOGGIA INTENSA / NUBIFRAGIO per ${subscription.locationName}`;
      bodyText = `Nucleo temporalesco ad elevata riflettività in avvicinamento su ${subscription.locationName}.`;
      advice = `Prestare attenzione a possibili allagamenti e raffiche di vento improvvise.`;
    }

    const previewHtml = `
      <div style="font-family: Arial, sans-serif; background: #0b1322; color: #f8fafc; padding: 20px; border-radius: 12px; border: 1px solid rgba(0, 240, 255, 0.4);">
        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 15px;">
          <h2 style="color: #00f0ff; margin: 0;">⚡ HailCast-ML Alert</h2>
          <span style="background: #f43f5e; color: #fff; padding: 2px 8px; border-radius: 4px; font-weight: bold; font-size: 12px;">PRIORITÀ ALTA</span>
        </div>
        <p style="font-size: 15px; margin-bottom: 8px;"><strong>Destinatario:</strong> ${subscription.email}</p>
        <p style="font-size: 15px; margin-bottom: 8px;"><strong>Località Monitorata:</strong> ${subscription.locationName} (${subscription.coords.lat.toFixed(3)}°N, ${subscription.coords.lng.toFixed(3)}°E)</p>
        <p style="font-size: 15px; margin-bottom: 8px;"><strong>Orario Rilevamento:</strong> ${timestamp}</p>
        <hr style="border: 0; border-top: 1px solid rgba(255, 255, 255, 0.1); margin: 15px 0;">
        <h3 style="color: #ffaa00; margin-top: 0;">${subject}</h3>
        <p style="line-height: 1.5; color: #cbd5e1;">${bodyText}</p>
        <div style="background: rgba(244, 63, 94, 0.15); border-left: 4px solid #f43f5e; padding: 12px; border-radius: 6px; margin: 15px 0;">
          <strong>🛡️ Azioni Consigliate:</strong>
          <p style="margin: 5px 0 0 0; color: #fecdd3;">${advice}</p>
        </div>
        <p style="font-size: 12px; color: #64748b; margin-top: 20px;">Questo messaggio è generato automaticamente dal sistema di nowcasting AI HailCast-ML.</p>
      </div>
    `;

    console.log(`📧 [HailCast Email Service] Email inviata con successo a ${subscription.email}:`, subject);
    return { success: true, previewHtml };
  }

  /**
   * Controlla se le celle temporalesche attive soddisfano le condizioni di allerta per la località dell'utente
   */
  public static checkStormCellAlerts(cells: StormCell[]): {
    triggered: boolean;
    alert?: {
      type: 'hail' | 'rain';
      title: string;
      message: string;
      cell: StormCell;
      eta: number;
      previewHtml?: string;
    };
  } {
    const sub = this.getSubscription();
    if (!sub || !sub.enabled || !sub.email || !sub.coords) {
      return { triggered: false };
    }

    const now = Date.now();
    // Valuta il rischio per le coordinate salvate
    const assessment = StormTracker.assessLocationRisk(sub.locationName, sub.coords, cells);

    if (
      assessment.estimatedArrivalMinutes !== null &&
      assessment.estimatedArrivalMinutes <= sub.leadTimeMinutes
    ) {
      // Trova la cella più vicina in avvicinamento
      const nearestCell = cells.find(c => {
        const dLat = (c.centroid.lat - sub.coords.lat) * 111.32;
        const dLng = (c.centroid.lng - sub.coords.lng) * (111.32 * Math.cos((sub.coords.lat * Math.PI) / 180));
        return Math.sqrt(dLat * dLat + dLng * dLng) <= assessment.nearestStormDistanceKm + 5;
      }) || cells[0];

      if (!nearestCell) return { triggered: false };

      const isHailThreat = nearestCell.meshDiameterCm >= sub.hailThresholdCm;
      const isRainThreat = nearestCell.maxDbz >= (sub.rainThresholdMm >= 25 ? 52 : 44);

      if (isHailThreat || isRainThreat) {
        // Verifica cooldown per non spammare la stessa cella
        if (
          sub.lastNotifiedCellId === nearestCell.id &&
          sub.lastNotifiedAt &&
          now - sub.lastNotifiedAt < this.NOTIFICATION_COOLDOWN_MS
        ) {
          return { triggered: false };
        }

        // Aggiorna stato notifica
        sub.lastNotifiedAt = now;
        sub.lastNotifiedCellId = nearestCell.id;
        this.saveSubscription(sub);

        const type: 'hail' | 'rain' = isHailThreat ? 'hail' : 'rain';
        const title = isHailThreat
          ? `⚠️ ALLERTA GRANDINE su ${sub.locationName}!`
          : `🌧️ ALLERTA PIOGGIA FORTE su ${sub.locationName}!`;
        const message = isHailThreat
          ? `Cella ${nearestCell.name} (${nearestCell.meshDiameterCm} cm MESH) in arrivo in ~${assessment.estimatedArrivalMinutes} min.`
          : `Temporale ad alta intensità (${nearestCell.maxDbz} dBZ) in arrivo in ~${assessment.estimatedArrivalMinutes} min.`;

        // Invia notifica browser se abilitata
        if (sub.enableBrowserPush) {
          this.sendBrowserNotification(title, message);
        }

        return {
          triggered: true,
          alert: {
            type,
            title,
            message,
            cell: nearestCell,
            eta: assessment.estimatedArrivalMinutes
          }
        };
      }
    }

    return { triggered: false };
  }
}
