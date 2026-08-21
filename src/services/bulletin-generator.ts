import { StormCell, LocationRiskAssessment } from '../types/meteorology';

export class SevereHailBulletinGenerator {
  /**
   * Genera e apre la finestra stampabile/esportabile del Bollettino Ufficiale di Nowcasting Grandine
   */
  public static generateAndOpenBulletin(
    cell: StormCell | null,
    assessment: LocationRiskAssessment | null,
    activeCells: StormCell[]
  ): void {
    const now = new Date();
    const utcTime = now.toUTCString();
    const localTime = now.toLocaleString('it-IT', { dateStyle: 'full', timeStyle: 'medium' });
    const targetCell = cell || activeCells[0];

    const alertLevel = !targetCell || targetCell.meshDiameterCm < 2.0 ? 'GIALLO' : targetCell.meshDiameterCm < 4.0 ? 'ARANCIONE' : 'ROSSO';
    const alertColor = alertLevel === 'ROSSO' ? '#ff0055' : alertLevel === 'ARANCIONE' ? '#ff7700' : '#ffcc00';

    const impactedTownsList = targetCell?.impactedTowns?.join(', ') || assessment?.locationName || 'Settore padano-alpino';

    const html = `
      <!DOCTYPE html>
      <html lang="it">
      <head>
        <meta charset="UTF-8">
        <title>Bollettino Nowcast Grandine — HailCast-ML</title>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700;800&family=JetBrains+Mono:wght@400;600&display=swap');
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body {
            font-family: 'Outfit', sans-serif;
            background: #ffffff;
            color: #0f172a;
            padding: 32px;
            line-height: 1.5;
          }
          .bulletin-card {
            max-width: 800px;
            margin: 0 auto;
            border: 2px solid #0f172a;
            border-radius: 12px;
            overflow: hidden;
            box-shadow: 0 10px 30px rgba(0,0,0,0.1);
          }
          .bulletin-header {
            background: #0f172a;
            color: #ffffff;
            padding: 24px;
            display: flex;
            justify-content: space-between;
            align-items: center;
          }
          .bulletin-header h1 { font-size: 1.5rem; font-weight: 800; letter-spacing: -0.5px; }
          .bulletin-header .brand { color: #00f0ff; font-family: 'JetBrains Mono', monospace; font-size: 0.85rem; }
          
          .alert-banner {
            background: ${alertColor};
            color: ${alertLevel === 'GIALLO' ? '#0f172a' : '#ffffff'};
            padding: 16px 24px;
            font-weight: 800;
            font-size: 1.1rem;
            display: flex;
            justify-content: space-between;
            align-items: center;
          }
          .bulletin-body { padding: 28px; }
          .meta-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 16px;
            margin-bottom: 24px;
            background: #f8fafc;
            padding: 18px;
            border-radius: 8px;
            border: 1px solid #e2e8f0;
          }
          .meta-item label { display: block; font-size: 0.78rem; text-transform: uppercase; color: #64748b; font-weight: 700; }
          .meta-item value { display: block; font-size: 1rem; font-weight: 700; color: #0f172a; }
          
          .section-title {
            font-size: 1.1rem;
            font-weight: 700;
            margin: 24px 0 12px;
            padding-bottom: 6px;
            border-bottom: 2px solid #e2e8f0;
            display: flex;
            align-items: center;
            gap: 8px;
          }
          .telemetry-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 20px;
          }
          .telemetry-table th, .telemetry-table td {
            padding: 10px 14px;
            border: 1px solid #e2e8f0;
            text-align: left;
            font-size: 0.9rem;
          }
          .telemetry-table th { background: #f1f5f9; font-weight: 700; }
          
          .action-box {
            background: #fff1f2;
            border-left: 4px solid #ff0055;
            padding: 16px;
            border-radius: 6px;
            margin-bottom: 24px;
          }
          .action-box h4 { color: #9f1239; margin-bottom: 6px; font-weight: 700; }
          .action-box ul { padding-left: 20px; color: #881337; font-size: 0.88rem; }
          
          .footer-note {
            text-align: center;
            font-size: 0.78rem;
            color: #94a3b8;
            margin-top: 24px;
            border-top: 1px solid #e2e8f0;
            padding-top: 16px;
          }
          .btn-print-bar {
            text-align: center;
            margin-bottom: 20px;
          }
          .btn-print {
            background: #00f0ff;
            color: #0f172a;
            border: none;
            padding: 10px 24px;
            border-radius: 8px;
            font-weight: 700;
            cursor: pointer;
            font-size: 0.95rem;
          }
          @media print {
            body { padding: 0; }
            .btn-print-bar { display: none; }
            .bulletin-card { border: none; box-shadow: none; max-width: 100%; }
          }
        </style>
      </head>
      <body>
        <div class="btn-print-bar">
          <button class="btn-print" onclick="window.print()">🖨️ Stampa / Salva come PDF</button>
        </div>

        <div class="bulletin-card">
          <div class="bulletin-header">
            <div>
              <h1>BOLLETTINO NOWCASTING GRANDINE</h1>
              <div class="brand">HAILCAST-ML • OPEN METEOROLOGICAL INTELLIGENCE</div>
            </div>
            <div style="text-align: right; font-size: 0.85rem;">
              <div>Rif. Protocollo: <b>HC-${now.getFullYear()}${(now.getMonth()+1).toString().padStart(2,'0')}${now.getDate().toString().padStart(2,'0')}-${now.getHours()}${now.getMinutes()}</b></div>
              <div>Emesso: <b>${localTime}</b> <span style="font-size: 0.75rem; color: #94a3b8;">(${utcTime})</span></div>
            </div>
          </div>

          <div class="alert-banner">
            <span>LIVELLO DI ALLERTA CONVETTIVA: ${alertLevel}</span>
            <span>DIAMETRO CHICCHI: ${targetCell ? targetCell.meshDiameterCm + ' cm' : 'In valutazione'}</span>
          </div>

          <div class="bulletin-body">
            <div class="meta-grid">
              <div class="meta-item">
                <label>Settore Geografico Interessato</label>
                <value>${targetCell?.name || 'Area Convettiva Attiva'}</value>
              </div>
              <div class="meta-item">
                <label>Coordinate Centroide Radar</label>
                <value>${targetCell ? targetCell.centroid.lat.toFixed(3) + '°N, ' + targetCell.centroid.lng.toFixed(3) + '°E' : 'N/D'}</value>
              </div>
              <div class="meta-item">
                <label>Vettore di Spostamento</label>
                <value>${targetCell ? targetCell.velocity.speedKmh + ' km/h verso ' + Math.round(targetCell.velocity.directionDeg) + '°' : 'N/D'}</value>
              </div>
              <div class="meta-item">
                <label>Stato Evolutivo Cella</label>
                <value>${targetCell?.formationStage === 'new_initiation' ? '⚡ Nuovo Sviluppo' : targetCell?.formationStage === 'rapid_intensification' ? '🔥 Rapida Intensificazione' : targetCell?.formationStage === 'dissipating' ? '🌫️ Dissolvimento' : '🟠 Cella Matura'}</value>
              </div>
            </div>

            <div class="section-title">📍 Comuni e Territori in Traiettoria (Next 60 Minuti)</div>
            <p style="font-size: 0.95rem; margin-bottom: 16px; color: #334155;">
              <b>Centri abitati interessati dal cono d'impatto:</b> ${impactedTownsList}
            </p>

            <div class="section-title">⚡ Parametri Fisico-Meteorologici e Machine Learning</div>
            <table class="telemetry-table">
              <thead>
                <tr>
                  <th>Parametro</th>
                  <th>Valore Rilevato</th>
                  <th>Soglia di Riferimento</th>
                  <th>Valutazione Severità</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><b>Riflettività Radar (Max dBZ)</b></td>
                  <td>${targetCell?.maxDbz || 55} dBZ</td>
                  <td>> 55 dBZ = Grandine Severa</td>
                  <td>${(targetCell?.maxDbz || 0) >= 60 ? '🔴 Estrema' : '🟠 Elevata'}</td>
                </tr>
                <tr>
                  <td><b>Diametro MESH (Witt 1998)</b></td>
                  <td>${targetCell?.meshDiameterCm || 3.0} cm</td>
                  <td>> 2.0 cm = Danno a carrozzerie</td>
                  <td>${(targetCell?.meshDiameterCm || 0) >= 4.0 ? '🚨 Distruttiva' : '⚠️ Severa'}</td>
                </tr>
                <tr>
                  <td><b>Probabilità Grandine (POH)</b></td>
                  <td>${targetCell?.pohPercentage || 85}%</td>
                  <td>Waldvogel ΔH > 1.4 km</td>
                  <td>Molto Probabile / Certa</td>
                </tr>
                <tr>
                  <td><b>Energia Convettiva CAPE</b></td>
                  <td>${targetCell?.sounding.cape || 2200} J/kg</td>
                  <td>> 1500 J/kg = Forte Convezione</td>
                  <td>Elevata Instabilità</td>
                </tr>
                <tr>
                  <td><b>Zero Termico (H0) & -20°C</b></td>
                  <td>${targetCell?.sounding.freezingLevel || 3600} m / ${targetCell?.sounding.minus20Level || 6800} m</td>
                  <td>Hail Growth Zone (HGZ)</td>
                  <td>Strato congelamento di ${((targetCell?.sounding.minus20Level || 6800) - (targetCell?.sounding.freezingLevel || 3600))} m</td>
                </tr>
              </tbody>
            </table>

            <div class="action-box">
              <h4>⚠️ PRESCRIZIONI DI AUTO-PROTEZIONE DELLA POPOLAZIONE</h4>
              <ul>
                <li>Ricoverare immediatamente autoveicoli, motocicli e animali in garage o strutture coperte.</li>
                <li>Evitare di transitare sotto alberature ad alto fusto o strutture provvisorie durante il downburst.</li>
                <li>Chiudere tapparelle, persiane e finestre per prevenire la rottura dei vetri dovuta a chicchi di grande calibro guidati dal vento.</li>
                <li>Agricoltori: attivare i sistemi di teli antigrandine e verificare lo sgombero dei canali di scolo.</li>
              </ul>
            </div>

            <div class="footer-note">
              Bollettino generato automaticamente dal motore fisico-statistico HailCast-ML basato su Witt (1998), Waldvogel (1979), Open-Meteo DWD ICON-D2 e mosaico radar RainViewer.<br/>
              Validità del bollettino: 60 minuti dall'emissione.
            </div>
          </div>
        </div>
      </body>
      </html>
    `;

    const printWin = window.open('', '_blank', 'width=900,height=950');
    if (printWin) {
      printWin.document.write(html);
      printWin.document.close();
    }
  }
}
