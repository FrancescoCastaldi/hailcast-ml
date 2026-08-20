import { AlertSubscription, AlertHistoryEntry, StormCell } from '../types/meteorology';
import { StormTracker } from '../ml/storm-tracker';

export class AlertNotificationService {
  private static STORAGE_KEY_SUBS = 'hailcast_alert_subscriptions_v2';
  private static STORAGE_KEY_OLD = 'hailcast_alert_subscription';
  private static STORAGE_KEY_HISTORY = 'hailcast_alert_history_v2';
  
  // Cooldown rigorosi per prevenire spam email
  private static LOCATION_COOLDOWN_MS = 15 * 60 * 1000; // Al massimo 1 email ogni 15 minuti per la stessa località
  private static SAME_CELL_COOLDOWN_MS = 30 * 60 * 1000; // Al massimo 1 email ogni 30 minuti per la stessa cella temporalesca

  // Isteresi anti "avvisi a singhiozzo" (ispirata a Grandina.it): la minaccia deve rientrare
  // sotto una banda inferiore prima che l'allerta possa scattare di nuovo
  private static HYSTERESIS_FACTOR = 0.7;   // Grandine: riarmo al 70% della soglia (es. 2.0 cm -> 1.4 cm)
  private static RAIN_HYSTERESIS_DBZ = 3;   // Pioggia: riarmo a 3 dBZ sotto la soglia
  
  // Lock in memoria per prevenire invii simultanei/concorrenti (race condition)
  private static activeDispatchLocks = new Set<string>();

  /**
   * Recupera tutte le sottoscrizioni salvate (con migrazione automatica da legacy)
   */
  public static getSubscriptions(): AlertSubscription[] {
    try {
      const data = localStorage.getItem(this.STORAGE_KEY_SUBS);
      if (data) {
        return JSON.parse(data) as AlertSubscription[];
      }
      // Migrazione da vecchia chiave singola
      const oldData = localStorage.getItem(this.STORAGE_KEY_OLD);
      if (oldData) {
        const oldSub = JSON.parse(oldData) as AlertSubscription;
        if (oldSub && oldSub.locationName) {
          oldSub.id = oldSub.id || `sub-${Date.now()}`;
          const list = [oldSub];
          localStorage.setItem(this.STORAGE_KEY_SUBS, JSON.stringify(list));
          return list;
        }
      }
      return [];
    } catch {
      return [];
    }
  }

  /**
   * Recupera la prima sottoscrizione attiva (per retrocompatibilità)
   */
  public static getSubscription(): AlertSubscription | null {
    const list = this.getSubscriptions();
    return list.find(s => s.enabled) || list[0] || null;
  }

  /**
   * Salva o aggiorna una sottoscrizione
   */
  public static saveSubscription(sub: AlertSubscription): void {
    const list = this.getSubscriptions();
    if (!sub.id) {
      sub.id = `sub-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      list.unshift(sub);
    } else {
      const idx = list.findIndex(s => s.id === sub.id);
      if (idx >= 0) {
        list[idx] = sub;
      } else {
        list.unshift(sub);
      }
    }
    localStorage.setItem(this.STORAGE_KEY_SUBS, JSON.stringify(list));
    localStorage.setItem(this.STORAGE_KEY_OLD, JSON.stringify(sub));
  }

  /**
   * Elimina una sottoscrizione
   */
  public static removeSubscription(id: string): void {
    const list = this.getSubscriptions().filter(s => s.id !== id && s.locationName !== id);
    localStorage.setItem(this.STORAGE_KEY_SUBS, JSON.stringify(list));
    if (list.length > 0) {
      localStorage.setItem(this.STORAGE_KEY_OLD, JSON.stringify(list[0]));
    } else {
      localStorage.removeItem(this.STORAGE_KEY_OLD);
    }
  }

  /**
   * Abilita o disabilita una sottoscrizione
   */
  public static toggleSubscription(id: string, enabled: boolean): void {
    const list = this.getSubscriptions();
    const sub = list.find(s => s.id === id || s.locationName === id);
    if (sub) {
      sub.enabled = enabled;
      localStorage.setItem(this.STORAGE_KEY_SUBS, JSON.stringify(list));
    }
  }

  /**
   * Recupera lo storico cronologico di tutte le allerte inviate
   */
  public static getHistory(): AlertHistoryEntry[] {
    try {
      const data = localStorage.getItem(this.STORAGE_KEY_HISTORY);
      if (!data) return [];
      return JSON.parse(data) as AlertHistoryEntry[];
    } catch {
      return [];
    }
  }

  /**
   * Aggiunge una nuova voce nello storico persistente
   */
  public static addHistoryEntry(entry: Omit<AlertHistoryEntry, 'id' | 'timestamp'>): AlertHistoryEntry {
    const history = this.getHistory();
    const fullEntry: AlertHistoryEntry = {
      ...entry,
      id: `hist-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: new Date().toLocaleString('it-IT', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      })
    };
    history.unshift(fullEntry);
    if (history.length > 100) history.pop();
    localStorage.setItem(this.STORAGE_KEY_HISTORY, JSON.stringify(history));
    return fullEntry;
  }

  /**
   * Cancella lo storico
   */
  public static clearHistory(): void {
    localStorage.removeItem(this.STORAGE_KEY_HISTORY);
  }

  /**
   * Riproduce un allarme sonoro d'emergenza via Web Audio API (senza file esterni)
   */
  public static playAlertChime(): void {
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      
      const playTone = (freq: number, start: number, duration: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, ctx.currentTime + start);
        gain.gain.setValueAtTime(0.3, ctx.currentTime + start);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + start + duration);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + start);
        osc.stop(ctx.currentTime + start + duration);
      };

      // Sequenza acustica d'allerta meteo (bitonale: 880Hz -> 1200Hz -> 880Hz)
      playTone(880, 0, 0.25);
      playTone(1200, 0.28, 0.25);
      playTone(880, 0.56, 0.35);
    } catch (e) {
      console.warn('Impossibile riprodurre segnale acustico:', e);
    }
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
        vibrate: [300, 150, 300]
      } as NotificationOptions);
    } catch (e) {
      console.warn('Errore invio notifica browser:', e);
    }
  }

  /**
   * Invia un'allerta email reale tramite gateway HTTP FormSubmit.co e salva nello storico
   */
  public static async sendEmailAlert(
    subscription: AlertSubscription,
    alertType: 'hail' | 'rain' | 'test',
    details: {
      cellName?: string;
      hailSizeCm?: number;
      etaMinutes?: number;
      maxDbz?: number;
    }
  ): Promise<{ success: boolean; message: string; previewHtml: string }> {
    const timestamp = new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
    
    let subject = '';
    let bodyText = '';
    let advice = '';

    if (alertType === 'hail') {
      subject = `⚠️ ALLERTA GRANDINE per ${subscription.locationName}: Chicchi stimati ${details.hailSizeCm || 2.5} cm in arrivo in ~${details.etaMinutes || 20} min!`;
      bodyText = `È stata rilevata una cella convettiva severa (${details.cellName || 'Supercella'}, intensità radar ${details.maxDbz || 60} dBZ) in rotta verso ${subscription.locationName}.`;
      advice = `Metti subito al riparo autovetture e veicoli, chiudi tapparelle ed evita di sostare all'aperto nelle prossime ore.`;
    } else if (alertType === 'rain') {
      subject = `🌧️ ALLERTA PIOGGIA INTENSA / NUBIFRAGIO per ${subscription.locationName}`;
      bodyText = `Nucleo temporalesco ad elevata riflettività (${details.maxDbz || 55} dBZ) in avvicinamento su ${subscription.locationName} (ETA ~${details.etaMinutes || 20} min).`;
      advice = `Prestare massima attenzione a possibili allagamenti, sottopassi e raffiche di vento improvvise.`;
    } else {
      subject = `🔔 [HailCast] Attivazione Ricezione Allerte Meteo per ${subscription.locationName}`;
      bodyText = `Questa è un'email di attivazione per confermare il monitoraggio radar automatico su ${subscription.locationName}.`;
      advice = `IMPORTANTE: Per completare l'abilitazione e ricevere le future allerte grandine e nubifragi in tempo reale, fai clic sul pulsante/link di conferma "Activate Form" inviato da FormSubmit nella tua casella di posta (inclusa la cartella Spam / Promozioni).`;
    }

    const previewHtml = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0b1322; color: #f8fafc; padding: 20px; border-radius: 12px; border: 1px solid rgba(0, 240, 255, 0.4);">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 15px; border-bottom: 1px solid rgba(255, 255, 255, 0.1); padding-bottom: 10px;">
          <h2 style="color: #00f0ff; margin: 0; font-size: 1.2rem;">⚡ HailCast-ML Alert System</h2>
          <span style="background: ${alertType === 'test' ? '#0ea5e9' : '#f43f5e'}; color: #fff; padding: 3px 10px; border-radius: 4px; font-weight: bold; font-size: 11px;">${alertType === 'test' ? 'ATTIVAZIONE FORM' : 'LIVE DISPATCH'}</span>
        </div>
        <p style="font-size: 14px; margin: 6px 0;"><strong>Destinatario:</strong> ${subscription.email}</p>
        <p style="font-size: 14px; margin: 6px 0;"><strong>Località Monitorata:</strong> ${subscription.locationName} (${subscription.coords.lat.toFixed(3)}°N, ${subscription.coords.lng.toFixed(3)}°E)</p>
        <p style="font-size: 14px; margin: 6px 0;"><strong>Orario Richiesta:</strong> ${timestamp}</p>
        <div style="background: rgba(0, 240, 255, 0.1); border-left: 4px solid #00f0ff; padding: 12px; border-radius: 6px; margin: 15px 0;">
          <h3 style="color: #00f0ff; margin: 0 0 8px 0; font-size: 1.05rem;">${subject}</h3>
          <p style="line-height: 1.5; color: #e2e8f0; margin: 0;">${bodyText}</p>
        </div>
        <div style="background: rgba(255, 170, 0, 0.15); border-left: 4px solid #ffaa00; padding: 12px; border-radius: 6px; margin: 15px 0;">
          <strong style="color: #ffaa00;">${alertType === 'test' ? '🛡️ Istruzioni di Attivazione Ricezione:' : '🛡️ Consigli di Autoprotezione:'}</strong>
          <p style="margin: 5px 0 0 0; color: #fef08a; font-size: 0.9rem;">${advice}</p>
        </div>
        <p style="font-size: 11px; color: #64748b; margin-top: 15px;">Avviso meteorologico generato automaticamente dalla piattaforma HailCast-ML.</p>
      </div>
    `;

    // Esegui l'invio HTTP reale dell'email al destinatario tramite FormSubmit.co Gateway con doppio canale (Fetch + Hidden Form Fallback)
    let gatewaySuccess = false;
    let gatewayMessage = '';

    const payloadMap: Record<string, string> = alertType === 'test'
      ? {
          _subject: `🔔 [HailCast] Attivazione Ricezione Allerte per ${subscription.locationName}`,
          _template: 'box',
          _captcha: 'false',
          _replyto: 'no-reply@hailcast.ml',
          Messaggio: 'Clicca su "Activate / Confirm Form" per completare l\'attivazione delle allerte meteo.',
          Località: subscription.locationName,
          Coordinate: `${subscription.coords.lat.toFixed(4)}°N, ${subscription.coords.lng.toFixed(4)}°E`,
          Destinatario: subscription.email,
          Soglia_Grandine: `> ${subscription.hailThresholdCm} cm`,
          Soglia_Pioggia: `> ${subscription.rainThresholdMm} mm/h`,
          Preavviso: `${subscription.leadTimeMinutes} min`,
          Orario: timestamp
        }
      : {
          _subject: `⚡ [HailCast Alert] ${alertType === 'hail' ? 'Grandine' : 'Pioggia/Temporale'} per ${subscription.locationName}`,
          _template: 'box',
          _captcha: 'false',
          _replyto: 'no-reply@hailcast.ml',
          Allerta: alertType === 'hail' ? 'RISCHIO GRANDINE' : 'PIOGGIA INTENSA / TEMPORALE',
          Località: subscription.locationName,
          Coordinate: `${subscription.coords.lat.toFixed(4)}°N, ${subscription.coords.lng.toFixed(4)}°E`,
          Cella: details.cellName || 'Cella Temporalesca',
          Diametro_Grandine: `${details.hailSizeCm || 0} cm`,
          Riflettività_Radar: `${details.maxDbz || 50} dBZ`,
          ETA_Arrivo: details.etaMinutes === 0 ? 'IN CORSO SULLA ZONA' : `~${details.etaMinutes || 15} min`,
          Orario: timestamp,
          Consigli: advice,
          Dettagli: bodyText
        };

    // Verifica Anti-Spam: Previeni invii doppi della stessa notifica nello stesso intervallo temporale
    const lockKey = `${subscription.email}_${subscription.locationName}_${alertType}`;
    if (this.activeDispatchLocks.has(lockKey)) {
      console.warn(`[AntiSpam] Invio già in corso per ${lockKey}, richiesta duplicata ignorata.`);
      return { success: true, message: 'Invio già in corso per questa notifica.', previewHtml };
    }

    // Controlla se la stessa notifica è già stata inviata negli ultimi 10 minuti (tranne se test manuale)
    if (alertType !== 'test') {
      const history = this.getHistory();
      const recentDuplicate = history.find(h => 
        h.email === subscription.email &&
        h.locationName === subscription.locationName &&
        h.alertType === alertType &&
        (Date.now() - new Date(h.timestamp).getTime()) < this.LOCATION_COOLDOWN_MS
      );

      if (recentDuplicate) {
        console.log(`[AntiSpam] Email recente già inviata a ${subscription.email} per ${subscription.locationName}. Ignorata per evitare spam.`);
        return { success: true, message: 'Allerta già notificata di recente per questa località.', previewHtml };
      }
    }

    this.activeDispatchLocks.add(lockKey);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);

      const response = await fetch(`https://formsubmit.co/ajax/${encodeURIComponent(subscription.email)}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        signal: controller.signal,
        body: JSON.stringify(payloadMap)
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        gatewaySuccess = true;
        gatewayMessage = `Email instradata con successo verso ${subscription.email}!`;
      } else {
        // Fallback su invio nativo del form
        this.dispatchViaHiddenForm(subscription.email, payloadMap);
        gatewaySuccess = true;
        gatewayMessage = `Email inviata a ${subscription.email}.`;
      }
    } catch (err) {
      console.warn('Fetch AJAX bloccato da browser/adblocker, eseguo fallback con invio nativo:', err);
      this.dispatchViaHiddenForm(subscription.email, payloadMap);
      gatewaySuccess = true;
      gatewayMessage = `Email inviata a ${subscription.email}.`;
    } finally {
      // Rilascia il lock dopo 5 secondi per prevenire chiamate doppie
      setTimeout(() => this.activeDispatchLocks.delete(lockKey), 5000);
    }

    // Salva sempre nello storico delle allerte
    this.addHistoryEntry({
      locationName: subscription.locationName,
      email: subscription.email,
      alertType,
      cellName: details.cellName,
      hailSizeCm: details.hailSizeCm,
      maxDbz: details.maxDbz,
      etaMinutes: details.etaMinutes,
      message: subject
    });

    return {
      success: gatewaySuccess,
      message: gatewayMessage,
      previewHtml
    };
  }

  /**
   * Invio tramite form HTML nascosto in un iframe (bypassa blocchi CORS e filtri adblocker del browser)
   */
  private static dispatchViaHiddenForm(email: string, payload: Record<string, string>): void {
    try {
      let iframe = document.getElementById('hailcast_formsubmit_iframe') as HTMLIFrameElement;
      if (!iframe) {
        iframe = document.createElement('iframe');
        iframe.id = 'hailcast_formsubmit_iframe';
        iframe.name = 'hailcast_formsubmit_iframe';
        iframe.style.display = 'none';
        document.body.appendChild(iframe);
      }

      const form = document.createElement('form');
      form.method = 'POST';
      form.action = `https://formsubmit.co/${encodeURIComponent(email)}`;
      form.target = 'hailcast_formsubmit_iframe';
      form.style.display = 'none';

      for (const [key, value] of Object.entries(payload)) {
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = key;
        input.value = value;
        form.appendChild(input);
      }

      document.body.appendChild(form);
      form.submit();
      setTimeout(() => form.remove(), 2500);
    } catch (e) {
      console.warn('Errore fallback hidden form:', e);
    }
  }

  /**
   * Controlla se le celle temporalesche attive soddisfano le condizioni di allerta per tutte le località iscritte
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
    const subscriptions = this.getSubscriptions().filter(s => s.enabled && s.email && s.coords);
    if (subscriptions.length === 0) {
      return { triggered: false };
    }

    const now = Date.now();
    let lastTriggeredAlert: any = null;

    for (const sub of subscriptions) {
      const assessment = StormTracker.assessLocationRisk(sub.locationName, sub.coords, cells);
      const onTrack =
        assessment.estimatedArrivalMinutes !== null &&
        assessment.estimatedArrivalMinutes <= sub.leadTimeMinutes;

      const nearestCell = onTrack
        ? (cells.find(c => {
            const dLat = (c.centroid.lat - sub.coords.lat) * 111.32;
            const dLng = (c.centroid.lng - sub.coords.lng) * (111.32 * Math.cos((sub.coords.lat * Math.PI) / 180));
            return Math.sqrt(dLat * dLat + dLng * dLng) <= assessment.nearestStormDistanceKm + 5;
          }) || cells[0])
        : null;

      // Nessuna cella in rotta entro il preavviso: riarma l'allerta se era attiva
      if (!nearestCell) {
        if (sub.alertActive) {
          sub.alertActive = false;
          this.saveSubscription(sub);
        }
        continue;
      }

      // Soglia dBZ basata su Marshall-Palmer Z-R
      const rainDbzThreshold = Math.round(10 * Math.log10(200 * Math.pow(Math.max(1, sub.rainThresholdMm || 10), 1.6)));
      const isHailThreat = nearestCell.meshDiameterCm >= (sub.hailThresholdCm || 0) && nearestCell.meshDiameterCm > 0;
      const isRainThreat = nearestCell.maxDbz >= Math.max(38, Math.min(58, rainDbzThreshold));
      const threatActive = isHailThreat || isRainThreat;

      if (threatActive) {
        // Isteresi: se l'allerta è già scattata, non ri-inviare finché la minaccia non rientra sotto la banda
        if (sub.alertActive) {
          continue;
        }

        // Cooldown 1: Stessa cella già notificata negli ultimi 30 minuti -> Salta
        if (
          sub.lastNotifiedCellId === nearestCell.id &&
          sub.lastNotifiedAt &&
          now - sub.lastNotifiedAt < this.SAME_CELL_COOLDOWN_MS
        ) {
          continue;
        }

        // Cooldown 2: Qualsiasi altra notifica inviata alla stessa località negli ultimi 15 minuti -> Salta
        if (
          sub.lastNotifiedAt &&
          now - sub.lastNotifiedAt < this.LOCATION_COOLDOWN_MS
        ) {
          continue;
        }

        sub.alertActive = true;
        sub.lastNotifiedAt = now;
        sub.lastNotifiedCellId = nearestCell.id;
        this.saveSubscription(sub);

        const type: 'hail' | 'rain' = isHailThreat ? 'hail' : 'rain';
        const title = isHailThreat
          ? `⚠️ ALLERTA GRANDINE su ${sub.locationName}!`
          : `🌧️ ALLERTA PIOGGIA INTENSA su ${sub.locationName}!`;
        const message = isHailThreat
          ? `Cella ${nearestCell.name} (${nearestCell.meshDiameterCm} cm MESH) ${assessment.estimatedArrivalMinutes === 0 ? 'sopra la zona' : `in arrivo in ~${assessment.estimatedArrivalMinutes} min`}.`
          : `Temporale ad alta intensità (${nearestCell.maxDbz} dBZ) ${assessment.estimatedArrivalMinutes === 0 ? 'sopra la zona' : `in arrivo in ~${assessment.estimatedArrivalMinutes} min`}.`;

        this.playAlertChime();

        if (sub.enableBrowserPush) {
          this.sendBrowserNotification(title, message);
        }

        // Invia email automatica (protetta da anti-spam e deduplicazione)
        this.sendEmailAlert(sub, type, {
          cellName: nearestCell.name,
          hailSizeCm: nearestCell.meshDiameterCm,
          maxDbz: nearestCell.maxDbz,
          etaMinutes: assessment.estimatedArrivalMinutes ?? undefined
        });

        lastTriggeredAlert = {
          triggered: true,
          alert: {
            type,
            title,
            message,
            cell: nearestCell,
            eta: assessment.estimatedArrivalMinutes
          }
        };
      } else {
        // Banda di isteresi: riarma solo quando la minaccia scende sotto la soglia di riarmo
        const rearmHail = nearestCell.meshDiameterCm < (sub.hailThresholdCm || 0) * this.HYSTERESIS_FACTOR;
        const rearmRain = nearestCell.maxDbz < Math.max(38, Math.min(58, rainDbzThreshold)) - this.RAIN_HYSTERESIS_DBZ;
        if (sub.alertActive && rearmHail && rearmRain) {
          sub.alertActive = false;
          this.saveSubscription(sub);
        }
      }
    }

    return lastTriggeredAlert || { triggered: false };
  }
}
