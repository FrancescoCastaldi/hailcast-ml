export class DamageCalculatorModalComponent {
  private modalEl: HTMLElement;
  private currentHailSizeCm: number = 3.5;

  constructor() {
    this.modalEl = document.getElementById('damageCalculatorModal') as HTMLElement;
    this.bindEvents();
  }

  private bindEvents(): void {
    const btnClose = document.getElementById('btnCloseDamageModal');
    btnClose?.addEventListener('click', () => this.close());

    this.modalEl?.addEventListener('click', (e) => {
      if (e.target === this.modalEl) {
        this.close();
      }
    });

    const rangeInput = document.getElementById('damageHailSlider') as HTMLInputElement;
    rangeInput?.addEventListener('input', () => {
      this.currentHailSizeCm = parseFloat(rangeInput.value);
      this.updateCalculations();
    });

    document.querySelectorAll('.preset-hail-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const val = parseFloat((e.currentTarget as HTMLElement).dataset.size || '3.5');
        if (rangeInput) rangeInput.value = val.toString();
        this.currentHailSizeCm = val;
        this.updateCalculations();
      });
    });
  }

  public open(hailSizeCm: number = 3.5, locationName?: string): void {
    this.currentHailSizeCm = hailSizeCm;
    if (!this.modalEl) return;

    const locEl = document.getElementById('damageModalLocationName');
    if (locEl) {
      locEl.textContent = locationName ? `Rischio d'Impatto per ${locationName}` : 'Simulatore Vulnerabilità Territoriale';
    }

    const rangeInput = document.getElementById('damageHailSlider') as HTMLInputElement;
    if (rangeInput) rangeInput.value = hailSizeCm.toString();

    this.updateCalculations();
    this.modalEl.style.display = 'flex';
  }

  public close(): void {
    if (this.modalEl) {
      this.modalEl.style.display = 'none';
    }
  }

  private updateCalculations(): void {
    const size = this.currentHailSizeCm;
    const valDisplay = document.getElementById('damageHailValDisplay');
    if (valDisplay) valDisplay.textContent = `${size.toFixed(1)} cm (${this.getSizeNickname(size)})`;

    // 1. Vigneti & Viticoltura (Valpolicella, Prosecco, Franciacorta)
    // Chicchi da 1cm = 20%, 2.5cm = 65%, > 4cm = 95-100%
    const vineyardLoss = Math.min(100, Math.round(Math.pow(size / 3.8, 1.6) * 95));
    this.updateCategoryCard('vineyard', vineyardLoss, size >= 2.0 ? 'Defogliazione estesa, tranciatura grappoli e necrosi tralci' : 'Danno fogliare parziale e micro-abrasioni');

    // 2. Frutteti (Mele, Pere, Pesche)
    const orchardLoss = Math.min(100, Math.round(Math.pow(size / 3.4, 1.7) * 98));
    this.updateCategoryCard('orchard', orchardLoss, size >= 2.5 ? 'Ammaccature profonde, caduta precoce e azzeramento resa' : 'Danni estetici e perdita calibro commerciale');

    // 3. Seminativi & Mais
    const cropLoss = Math.min(100, Math.round(Math.pow(size / 4.5, 1.8) * 90));
    this.updateCategoryCard('crops', cropLoss, size >= 3.0 ? 'Allettamento fusti e lacerazione lamina fogliare' : 'Danni contenuti se in fase vegetativa precoce');

    // 4. Carrozzeria e Parabrezza Auto
    let vehicleStatus = 'Nessun danno visibile (bolli assenti)';
    let vehicleLoss = 0;
    if (size >= 5.0) {
      vehicleLoss = 95;
      vehicleStatus = '🚨 Parabrezza e lunotto sfondati, carrozzeria gravemente martellata';
    } else if (size >= 3.5) {
      vehicleLoss = 70;
      vehicleStatus = '⚠️ Parabrezza incrinato/scheggiato, decine di bozzi su tetto e cofano';
    } else if (size >= 2.2) {
      vehicleLoss = 35;
      vehicleStatus = '🟡 Piccoli bolli diffusi sulla lamiera, cristalli intatti';
    }
    this.updateCategoryCard('vehicle', vehicleLoss, vehicleStatus);

    // 5. Pannelli Fotovoltaici e Tetti
    let solarLoss = 0;
    let solarStatus = 'Vetro temperato intatto, resistenza conforme IEC 61215';
    if (size >= 5.5) {
      solarLoss = 90;
      solarStatus = '🚨 Rottura generalizzata del vetro frontale, cortocircuito celle';
    } else if (size >= 4.0) {
      solarLoss = 45;
      solarStatus = '⚠️ Micro-cracking delle celle al silicio e calo resa 40%';
    }
    this.updateCategoryCard('solar', solarLoss, solarStatus);
  }

  private updateCategoryCard(category: string, percentage: number, description: string): void {
    const barEl = document.getElementById(`${category}DamageBar`);
    const valEl = document.getElementById(`${category}DamagePct`);
    const descEl = document.getElementById(`${category}DamageDesc`);

    if (barEl) {
      barEl.style.width = `${percentage}%`;
      barEl.style.background = percentage >= 75 ? 'linear-gradient(90deg, #ff0055, #ff0000)' : percentage >= 40 ? 'linear-gradient(90deg, #ffaa00, #ff5500)' : 'linear-gradient(90deg, #00f0ff, #00aaee)';
    }
    if (valEl) {
      valEl.textContent = `${percentage}%`;
      valEl.style.color = percentage >= 75 ? '#ff3366' : percentage >= 40 ? '#ffaa00' : '#00f0ff';
    }
    if (descEl) descEl.textContent = description;
  }

  private getSizeNickname(diamCm: number): string {
    if (diamCm < 1.0) return 'Granella';
    if (diamCm < 2.2) return 'Moneta 1€';
    if (diamCm < 3.5) return 'Noce';
    if (diamCm < 5.2) return 'Pallina Golf';
    if (diamCm < 7.0) return 'Uovo';
    return 'Tennis / Gigante';
  }
}
