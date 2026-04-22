(function() {
  const $ = id => document.getElementById(id);
  const fmtBRL = v => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
  const fmtBRL2 = v => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const escapeHTML = str => String(str).replace(/[&<>"']/g, c => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
  })[c]);

  const CAR_COLORS = [
    '#2d5f4a', '#3a5a8c', '#8c3a5a', '#c2772a', '#5a6c3a',
    '#6a3a8c', '#3a8c8c', '#8c6a3a', '#4a4a4a', '#8c3a3a',
  ];

  const ANTIGO_COLOR = '#b8562a';
  const ANO_ATUAL = new Date().getFullYear();
  const CET_PADRAO = 0.10; // 10% adicional sobre Price puro para refletir IOF + tarifas + seguros típicos
  const STORAGE_KEY = 'calculadora-carro-state-v1';
  const EMBEDDED_STATE_ID = 'embedded_state';

  // Dado uma parcela desejada (real do banco), resolve numericamente a taxa efetiva que a gera
  function taxaEfetivaParaParcela(pv, n, parcelaDesejada) {
    if (pv <= 0 || parcelaDesejada <= 0 || n <= 0) return 0;
    if (parcelaDesejada * n <= pv) return 0; // parcela tão baixa que é juros zero ou negativos
    // Bissection: taxa entre 0.0001% e 50% ao mês
    let lo = 0.000001, hi = 0.5;
    for (let iter = 0; iter < 80; iter++) {
      const mid = (lo + hi) / 2;
      const parcela = calcPrice(pv, mid, n);
      if (Math.abs(parcela - parcelaDesejada) < 0.01) return mid;
      if (parcela < parcelaDesejada) lo = mid;
      else hi = mid;
    }
    return (lo + hi) / 2;
  }

  function taxaSacParaPrimeiraParcela(pv, n, parcelaDesejada) {
    if (pv <= 0 || parcelaDesejada <= 0 || n <= 0) return 0;
    return Math.max(0, (parcelaDesejada - (pv / n)) / pv);
  }

  // Resolve qual taxa efetiva usar para um financiamento:
  // - Se parcelaReal > 0: usa essa parcela como âncora, calcula a taxa que a gera
  // - Caso contrário: taxa nominal + margem CET padrão (10%) — aplica na taxa para gerar parcela ~10% maior
  // Retorna { taxaEfetiva, parcelaReferencia, fonte: 'manual'|'auto'|'nominal' }
  function resolverTaxaEfetiva(pv, jurosNominalMes, prazo, parcelaReal, amortType = 'price') {
    if (parcelaReal && parcelaReal > 0 && pv > 0) {
      const taxa = amortType === 'sac'
        ? taxaSacParaPrimeiraParcela(pv, prazo, parcelaReal)
        : taxaEfetivaParaParcela(pv, prazo, parcelaReal);
      return { taxaEfetiva: taxa, parcelaReferencia: parcelaReal, fonte: 'manual' };
    }
    const parcelaPura = amortType === 'sac'
      ? (pv / prazo) + (pv * jurosNominalMes)
      : calcPrice(pv, jurosNominalMes, prazo);
    const parcelaComCet = parcelaPura * (1 + CET_PADRAO);
    const taxaEfetiva = amortType === 'sac'
      ? taxaSacParaPrimeiraParcela(pv, prazo, parcelaComCet)
      : taxaEfetivaParaParcela(pv, prazo, parcelaComCet);
    return { taxaEfetiva, parcelaReferencia: parcelaComCet, fonte: 'auto' };
  }

  let cars = [];
  let oldCars = [];
  let carCounter = 0;
  let oldCarCounter = 0;
  let finCounter = 0;
  let aporteRefCarId = null; // ID do carro novo usado como referência para calcular o aporte

  function syncQuickPicks() {
    const horizonte = readIntegerValue($('horizonte')) || 0;
    document.querySelectorAll('.quick-pick').forEach(btn => {
      btn.classList.toggle('active', parseInt(btn.dataset.h) === horizonte);
    });
  }

  function setAutosaveStatus(message, state = 'idle') {
    const statusEl = $('autosave_status');
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.dataset.state = state;
  }

  function roundTo(value, decimals = 2) {
    if (!Number.isFinite(value)) return 0;
    const factor = 10 ** decimals;
    return Math.round(value * factor) / factor;
  }

  function parseLocaleNumber(raw) {
    if (typeof raw === 'number') return Number.isFinite(raw) ? raw : 0;

    const text = String(raw ?? '').trim();
    if (!text) return 0;

    const sanitized = text.replace(/\s+/g, '');

    if (sanitized.includes(',') && sanitized.includes('.')) {
      const normalized = sanitized.replace(/\./g, '').replace(',', '.');
      return Number(normalized) || 0;
    }

    if (sanitized.includes(',')) {
      return Number(sanitized.replace(/\./g, '').replace(',', '.')) || 0;
    }

    const dotCount = (sanitized.match(/\./g) || []).length;
    if (dotCount > 1) {
      return Number(sanitized.replace(/\./g, '')) || 0;
    }

    if (dotCount === 1) {
      const [, fraction = ''] = sanitized.split('.');
      if (fraction.length === 3) {
        return Number(sanitized.replace('.', '')) || 0;
      }
    }

    return Number(sanitized) || 0;
  }

  function readNumericValue(inputOrValue) {
    const raw = typeof inputOrValue === 'object' && inputOrValue !== null && 'value' in inputOrValue
      ? inputOrValue.value
      : inputOrValue;
    return parseLocaleNumber(raw);
  }

  function isIntegerInput(input) {
    return input?.dataset?.integer === 'true';
  }

  function readIntegerValue(inputOrValue) {
    return Math.round(readNumericValue(inputOrValue) || 0);
  }

  function readInputValue(inputOrValue) {
    return typeof inputOrValue === 'object' && inputOrValue !== null && isIntegerInput(inputOrValue)
      ? readIntegerValue(inputOrValue)
      : readNumericValue(inputOrValue);
  }

  function isCarroUsado(car) {
    return (readIntegerValue(car?.ano) || ANO_ATUAL) < ANO_ATUAL;
  }

  function isCarroEmGarantia(car) {
    if (typeof car?.emGarantia === 'boolean') return car.emGarantia;
    return !isCarroUsado(car);
  }

  function getCarCuidadoCopy(car) {
    return isCarroEmGarantia(car)
      ? {
          label: 'Revisões',
          help: 'Se o carro ainda está na garantia, use revisões por mês ou por ano.'
        }
      : isCarroUsado(car)
      ? {
          label: 'Manutenção',
          help: 'Fora da garantia, preencha manutenção por mês ou por ano.'
        }
      : {
          label: 'Manutenção',
          help: 'Se o carro não estiver mais na garantia, preencha manutenção por mês ou por ano.'
        };
  }

  function updateCarCuidadoCopy(card, car) {
    if (!card) return;
    const copy = getCarCuidadoCopy(car);
    const labelEl = card.querySelector('[data-cuidado-label]');
    const helpEl = card.querySelector('[data-cuidado-help]');
    if (labelEl) labelEl.textContent = copy.label;
    if (helpEl) helpEl.textContent = copy.help;
  }

  function inferInputDecimals(input) {
    if (isIntegerInput(input)) return 0;
    const step = input?.getAttribute?.('step');
    if (!step || step === 'any') return 2;
    if (!step.includes('.')) return 0;
    return step.split('.')[1].length;
  }

  function formatInputValue(value, decimals = 2, useGrouping = true) {
    return roundTo(value, decimals).toLocaleString('pt-BR', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
      useGrouping,
    });
  }

  function formatNumericInput(input) {
    if (!input) return;
    const useGrouping = input.dataset.noGrouping !== 'true';
    const raw = String(input.value ?? '').trim();
    if (!raw) {
      if (input.hasAttribute('placeholder')) {
        input.value = '';
        return;
      }
      input.value = formatInputValue(0, inferInputDecimals(input), useGrouping);
      return;
    }
    const value = isIntegerInput(input) ? readIntegerValue(raw) : readNumericValue(raw);
    input.value = formatInputValue(value, inferInputDecimals(input), useGrouping);
  }

  function normalizeNumericInputs(root = document) {
    root.querySelectorAll('input[type="number"], input.numeric-input').forEach(input => {
      if (input.type === 'color') return;

      input.classList.add('numeric-input');
      if (input.type === 'number') input.type = 'text';
      input.inputMode = inferInputDecimals(input) > 0 ? 'decimal' : 'numeric';
      input.autocomplete = 'off';

      if (!input.dataset.numericFormatted) {
        input.addEventListener('blur', () => formatNumericInput(input));
        input.dataset.numericFormatted = 'true';
      }

      formatNumericInput(input);
    });
  }

  function setPairedInputs(monthlyInput, annualInput, monthlyValue, monthlyDecimals = 2, annualDecimals = 2, monthlyToAnnual = v => v * 12) {
    if (monthlyInput) monthlyInput.value = formatInputValue(monthlyValue, monthlyDecimals);
    if (annualInput) annualInput.value = formatInputValue(monthlyToAnnual(monthlyValue), annualDecimals);
  }

  function monthlyPercentToAnnual(monthlyPct) {
    const monthlyRate = Math.max(0, monthlyPct || 0) / 100;
    return (Math.pow(1 + monthlyRate, 12) - 1) * 100;
  }

  function annualPercentToMonthly(annualPct) {
    const annualRate = Math.max(0, annualPct || 0) / 100;
    return (Math.pow(1 + annualRate, 1 / 12) - 1) * 100;
  }

  function monthlyToAnnualLinear(value) {
    return (value || 0) * 12;
  }

  function annualToMonthlyLinear(value) {
    return (value || 0) / 12;
  }

  function bindLinkedInputs({
    monthlyInput,
    annualInput,
    monthlyToAnnual,
    annualToMonthly,
    monthlyDecimals = 2,
    annualDecimals = 2,
  }) {
    if (!monthlyInput || !annualInput) return;

    monthlyInput.addEventListener('input', () => {
      const monthlyValue = readNumericValue(monthlyInput);
      if (annualInput) annualInput.value = formatInputValue(monthlyToAnnual(monthlyValue), annualDecimals);
      recalcular();
    });

    annualInput.addEventListener('input', () => {
      const annualValue = readNumericValue(annualInput);
      const monthlyValue = annualToMonthly(annualValue);
      if (monthlyInput) monthlyInput.value = formatInputValue(monthlyValue, monthlyDecimals);
      recalcular();
    });
  }

  function getGlobalsFromDOM() {
    return {
      horizonte: Math.max(1, Math.round(readNumericValue($('horizonte')) || 60)),
      capitalInicial: readNumericValue($('capital_inicial')) || 0,
      rendimentoMes: readNumericValue($('rendimento_mes')) || 0,
      kmMes: readNumericValue($('km_mes')) || 0,
      combustivelPreco: readNumericValue($('combustivel_preco')) || 0,
      aporteMensal: readNumericValue($('aporte_mensal')) || 0,
    };
  }

  function applyGlobalsToDOM(globals = {}) {
    if ($('horizonte')) $('horizonte').value = formatInputValue(Math.max(1, Math.round(globals.horizonte) || 60), 0);
    if ($('capital_inicial')) $('capital_inicial').value = formatInputValue(globals.capitalInicial ?? 50000, inferInputDecimals($('capital_inicial')));
    setPairedInputs($('rendimento_mes'), $('rendimento_ano'), globals.rendimentoMes ?? 0.80, 2, 2, monthlyPercentToAnnual);
    setPairedInputs($('km_mes'), $('km_ano'), globals.kmMes ?? 1500, 0, 0, monthlyToAnnualLinear);
    if ($('combustivel_preco')) $('combustivel_preco').value = formatInputValue(globals.combustivelPreco ?? 6.20, inferInputDecimals($('combustivel_preco')));
    if ($('aporte_mensal')) $('aporte_mensal').value = formatInputValue(globals.aporteMensal ?? 2500, inferInputDecimals($('aporte_mensal')));
    syncQuickPicks();
  }

  function buildSerializableState() {
    return {
      version: 1,
      savedAt: new Date().toISOString(),
      globals: getGlobalsFromDOM(),
      oldCars: JSON.parse(JSON.stringify(oldCars)),
      cars: JSON.parse(JSON.stringify(cars)),
      aporteRefCarId,
    };
  }

  function parseStateCandidate(raw) {
    try {
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (!parsed || typeof parsed !== 'object') return null;
      if (!parsed.globals || typeof parsed.globals !== 'object') return null;
      if (!Array.isArray(parsed.oldCars) || !Array.isArray(parsed.cars)) return null;
      return {
        version: parsed.version || 1,
        savedAt: parsed.savedAt || new Date(0).toISOString(),
        globals: parsed.globals,
        oldCars: parsed.oldCars,
        cars: parsed.cars,
        aporteRefCarId: parsed.aporteRefCarId || null,
      };
    } catch {
      return null;
    }
  }

  function readEmbeddedState() {
    const el = $(EMBEDDED_STATE_ID);
    if (!el) return null;
    const raw = el.textContent.trim();
    if (!raw) return null;
    return parseStateCandidate(raw);
  }

  function readLocalState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return parseStateCandidate(raw);
    } catch {
      setAutosaveStatus('Armazenamento local indisponível neste contexto.', 'error');
      return null;
    }
  }

  function latestTimestamp(state) {
    const ts = Date.parse(state?.savedAt || '');
    return Number.isFinite(ts) ? ts : 0;
  }

  function extractCounter(id, prefix) {
    const match = typeof id === 'string' ? id.match(new RegExp(`^${prefix}_(\\d+)$`)) : null;
    return match ? parseInt(match[1], 10) : 0;
  }

  function recalibrarCounters() {
    carCounter = Math.max(0, ...cars.map(car => extractCounter(car.id, 'car')));
    oldCarCounter = Math.max(0, ...oldCars.map(car => extractCounter(car.id, 'oldcar')));
    finCounter = Math.max(0, ...cars.flatMap(car => car.financings.map(fin => extractCounter(fin.id, 'fin'))));
  }

  function restoreState(state) {
    if (!state || !state.oldCars.length || !state.cars.length) return false;

    applyGlobalsToDOM(state.globals);
    oldCars = state.oldCars.map(oldCar => createOldCar(oldCar));
    cars = state.cars.map(car => {
      const financings = Array.isArray(car.financings) && car.financings.length
        ? car.financings.map(fin => createFinancing(fin))
        : [createFinancing({ name: 'Banco A', juros: 1.45, prazo: 48 })];
      const restoredCar = createCar({ ...car, financings, activeFinancingId: car.activeFinancingId });
      if (!restoredCar.financings.some(fin => fin.id === restoredCar.activeFinancingId)) {
        restoredCar.activeFinancingId = restoredCar.financings[0]?.id || null;
      }
      return restoredCar;
    });
    aporteRefCarId = state.aporteRefCarId || null;
    recalibrarCounters();
    setAutosaveStatus('Rascunho local restaurado.', 'saved');
    return true;
  }

  function loadState() {
    const embeddedState = readEmbeddedState();
    const localState = readLocalState();
    const chosenState = [embeddedState, localState]
      .filter(Boolean)
      .sort((a, b) => latestTimestamp(a) - latestTimestamp(b))
      .pop();

    return chosenState ? restoreState(chosenState) : false;
  }

  function saveState() {
    const state = buildSerializableState();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      const time = new Date(state.savedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      setAutosaveStatus(`Salvo neste navegador às ${time}.`, 'saved');
    } catch {
      setAutosaveStatus('Armazenamento local indisponível neste contexto.', 'error');
    }
    return state;
  }

  function escapeJSONForScriptTag(json) {
    return json.replace(/</g, '\\u003c');
  }

  function hideChartArtifacts() {
    const tooltip = $('chart_tooltip');
    if (tooltip) tooltip.classList.remove('show');
    const hoverLine = $('chart_svg')?.querySelector('.hover-line');
    if (hoverLine) hoverLine.remove();
  }

  function seedDefaultState() {
    oldCars = [createOldCar({ name: 'Meu carro de 1993' })];
    cars = [
      createCar({ name: 'Honda HR-V', color: CAR_COLORS[0] }),
      createCar({ name: 'Toyota Corolla', color: CAR_COLORS[1], valor: 120000, entrada: 40000 })
    ];
    aporteRefCarId = cars[0]?.id || null;
    setAutosaveStatus('Mudanças serão salvas automaticamente neste navegador.', 'idle');
  }

  function createOldCar(preset = {}) {
    const id = `oldcar_${++oldCarCounter}`;
    return {
      id,
      name: preset.name || `Antigo ${oldCars.length + 1}`,
      manutencao: 450,
      consumo: 8,
      seguroAnual: 1800,
      licenciamentoAnual: 180,
      vendaAtual: 8000, // valor que daria se vendesse hoje
      ...preset
    };
  }

  function createFinancing(preset = {}) {
    const id = `fin_${++finCounter}`;
    return {
      id,
      name: preset.name || `Financiamento ${Math.random().toString(36).slice(2,5).toUpperCase()}`,
      prazo: 48,
      juros: 1.45,
      amortType: 'price',
      extraAmort: 0,
      extraMode: 'prazo',
      parcelaReal: 0, // 0 = usar cálculo automático (Price puro + 10% CET padrão). >0 = sobrescreve
      ...preset
    };
  }

  function createCar(preset = {}) {
    const id = `car_${++carCounter}`;
    const color = preset.color || CAR_COLORS[cars.length % CAR_COLORS.length];
    const car = {
      id,
      name: preset.name || `Carro ${cars.length + 1}`,
      color,
      ano: ANO_ATUAL,
      emGarantia: true,
      showActiveFinancingInChart: true,
      showCashPurchaseInChart: false,
      valor: 90000,
      entrada: 30000,
      ipvaPerc: 4,
      seguroPerc: 4,
      revisao: 900,
      consumo: 13,
      financings: [],
      activeFinancingId: null,
      ...preset
    };
    if (car.financings.length === 0) {
      const fin1 = createFinancing({ name: 'Banco A', juros: 1.45, prazo: 48 });
      const fin2 = createFinancing({ name: 'Banco B', juros: 1.25, prazo: 60 });
      car.financings = [fin1, fin2];
      car.activeFinancingId = fin1.id;
    }
    if (typeof car.emGarantia !== 'boolean') {
      car.emGarantia = !isCarroUsado(car);
    }
    if (typeof car.showActiveFinancingInChart !== 'boolean') {
      const activeFin = car.financings.find(fin => fin.id === car.activeFinancingId) || car.financings[0];
      car.showActiveFinancingInChart = activeFin ? activeFin.showInChart !== false : true;
    }
    if (typeof car.showCashPurchaseInChart !== 'boolean') {
      car.showCashPurchaseInChart = false;
    }
    return car;
  }

  // ============ FINANCIAMENTO ============
  function calcPrice(pv, i, n) {
    if (i === 0) return pv / n;
    const f = Math.pow(1 + i, n);
    return pv * (i * f) / (f - 1);
  }

  function simularFinanciamento(pv, i, n, amortType, extra, extraMode, monthlyBudget = 0) {
    const result = [];
    if (pv <= 0) return { meses: [], prazoEfetivo: 0, totalPago: 0, totalJuros: 0, parcelaMedia: 0, parcelaBaseMedia: 0, primeiraParcelaBase: 0, ultimaParcelaBase: 0, primeiraParcela: 0, ultimaParcela: 0, extraMedio: 0, primeiraExtra: 0, ultimaExtra: 0 };

    let saldo = pv;
    let parcelaPrice = calcPrice(pv, i, n);
    let amortSAC = pv / n;
    let totalPago = 0;
    let totalJuros = 0;
    let totalExtra = 0;
    let totalParcelaBase = 0;
    let mes = 0;
    const maxMeses = n + 2;

    while (saldo > 0.01 && mes < maxMeses) {
      mes++;
      const juros = saldo * i;
      let parcelaBase, amortBase;

      if (amortType === 'price') {
        parcelaBase = parcelaPrice;
        amortBase = parcelaBase - juros;
      } else {
        amortBase = amortSAC;
        parcelaBase = amortBase + juros;
      }

      if (amortBase > saldo) amortBase = saldo;
      parcelaBase = amortBase + juros;

      const extraDesejado = monthlyBudget > 0
        ? Math.max(0, monthlyBudget - parcelaBase)
        : extra;
      const extraReal = Math.min(extraDesejado, Math.max(0, saldo - amortBase));
      const totalMes = parcelaBase + extraReal;
      saldo -= (amortBase + extraReal);
      if (saldo < 0) saldo = 0;

      totalPago += totalMes;
      totalJuros += juros;
      totalExtra += extraReal;
      totalParcelaBase += parcelaBase;

      result.push({ mes, parcelaBase, juros, amortBase, extra: extraReal, total: totalMes, saldoFinal: saldo });

      if (saldo <= 0.01) break;

      if (extraMode === 'parcela' && extraReal > 0) {
        const mesesRestantes = n - mes;
        if (mesesRestantes > 0) {
          if (amortType === 'price') parcelaPrice = calcPrice(saldo, i, mesesRestantes);
          else amortSAC = saldo / mesesRestantes;
        } else break;
      }
    }

    return {
      meses: result,
      prazoEfetivo: result.length,
      totalPago,
      totalJuros,
      parcelaMedia: result.length > 0 ? totalPago / result.length : 0,
      parcelaBaseMedia: result.length > 0 ? totalParcelaBase / result.length : 0,
      primeiraParcelaBase: result[0]?.parcelaBase || 0,
      ultimaParcelaBase: result[result.length - 1]?.parcelaBase || 0,
      primeiraParcela: result[0]?.total || 0,
      ultimaParcela: result[result.length - 1]?.total || 0,
      extraMedio: result.length > 0 ? totalExtra / result.length : 0,
      primeiraExtra: result[0]?.extra || 0,
      ultimaExtra: result[result.length - 1]?.extra || 0
    };
  }

  // ============ DEPRECIAÇÃO ============
  // Retorna o VALOR ATUAL do carro no mês M (começa em valorInicial)
  function valorCarroNoMes(valorInicial, mes) {
    const taxas = [0.20, 0.15, 0.10, 0.10, 0.10, 0.08, 0.08, 0.08, 0.08, 0.08];
    let valor = valorInicial;
    let mesesRestantes = mes;
    let ano = 0;
    while (mesesRestantes > 0) {
      const taxaAno = taxas[Math.min(ano, taxas.length - 1)];
      const mesesEsteAno = Math.min(12, mesesRestantes);
      const perdaAno = valor * taxaAno * (mesesEsteAno / 12);
      valor -= perdaAno;
      mesesRestantes -= mesesEsteAno;
      ano++;
    }
    return Math.max(0, valor);
  }

  // Antigo: depreciação linear mínima (5% a.a.) com piso no valor de venda
  function valorAntigoNoMes(valorVendaAtual, mes) {
    const taxaAnual = 0.05;
    const fatorMes = Math.pow(1 - taxaAnual, mes / 12);
    return Math.max(valorVendaAtual * 0.5, valorVendaAtual * fatorMes);
  }

  function calcularPrazoCompraVista(valorAlvo, capitalInicial, aporteMensal, rendimentoMensal) {
    const objetivo = Math.max(0, valorAlvo || 0);
    let saldo = Math.max(0, capitalInicial || 0);
    const aporte = Math.max(0, aporteMensal || 0);
    const rend = Math.max(0, rendimentoMensal || 0);

    if (saldo >= objetivo) {
      return { meses: 0, saldoFinal: saldo, atingiu: true };
    }

    if (objetivo <= 0) {
      return { meses: 0, saldoFinal: saldo, atingiu: true };
    }

    if (saldo === 0 && aporte === 0) {
      return { meses: null, saldoFinal: saldo, atingiu: false };
    }

    const LIMITE_MESES = 1200;
    for (let mes = 1; mes <= LIMITE_MESES; mes++) {
      if (saldo > 0) saldo *= (1 + rend);
      saldo += aporte;
      if (saldo >= objetivo) {
        return { meses: mes, saldoFinal: saldo, atingiu: true };
      }
    }

    return { meses: null, saldoFinal: saldo, atingiu: false };
  }

  function formatarPrazoMeses(meses) {
    if (meses === 0) return 'disponivel agora';
    if (!Number.isFinite(meses) || meses === null) return 'prazo indeterminado';
    if (meses < 12) return `${meses} meses`;
    const anos = Math.floor(meses / 12);
    const mesesRestantes = meses % 12;
    if (mesesRestantes === 0) return `${anos} ano${anos > 1 ? 's' : ''}`;
    return `${anos}a ${mesesRestantes}m`;
  }

  // ============ SIMULAÇÃO PATRIMÔNIO ============
  // Lógica: a cada mês, (1) caixa positivo rende à taxa CDI, (2) aporte mensal entra (se houver), (3) despesas do mês são debitadas.
  // Se caixa ficar negativo, vira dívida e NÃO rende (mas também não cresce como dívida — simplificação).
  function simularPatrimonioAntigo(globals, antigo, horizonte, aportePorMes) {
    const caixaInicial = globals.capitalInicial;
    const combMes = (globals.kmMes / antigo.consumo) * globals.precoComb;
    const gastoMes = antigo.manutencao + combMes + (antigo.seguroAnual / 12) + (antigo.licenciamentoAnual / 12);
    const rend = globals.rendMes;
    const historico = [];

    let caixa = caixaInicial;
    historico.push({ mes: 0, caixa, patrimonio: caixa + antigo.vendaAtual, gastoAcum: 0, aporteAcum: 0 });

    let gastoAcum = 0;
    let aporteAcum = 0;
    for (let m = 1; m <= horizonte; m++) {
      // 1) Rendimento sobre caixa positivo
      if (caixa > 0) caixa = caixa * (1 + rend);
      // 2) Aporte mensal (piso em zero)
      const aporte = aportePorMes ? Math.max(0, aportePorMes[m] || 0) : 0;
      caixa += aporte;
      aporteAcum += aporte;
      // 3) Debitar gastos do antigo
      caixa -= gastoMes;
      gastoAcum += gastoMes;
      const valorCarro = valorAntigoNoMes(antigo.vendaAtual, m);
      historico.push({ mes: m, caixa, patrimonio: caixa + valorCarro, gastoAcum, aporteAcum });
    }
    return historico;
  }

  function simularPatrimonioCarroNovo(globals, carro, financing, horizonte, vendaAntigo) {
    // Caixa inicial: capital + dinheiro da venda do antigo − entrada do financiamento
    const caixaInicial = globals.capitalInicial + (vendaAntigo || 0) - carro.entrada;
    const financiado = Math.max(0, carro.valor - carro.entrada);
    const jurosM = financing.juros / 100;
    const { taxaEfetiva } = resolverTaxaEfetiva(financiado, jurosM, financing.prazo, financing.parcelaReal, financing.amortType);

    const simFin = simularFinanciamento(financiado, taxaEfetiva, financing.prazo, financing.amortType, financing.extraAmort, financing.extraMode, globals.aporteMensal || 0);

    const parcelaPorMes = new Array(horizonte + 1).fill(0);
    for (const m of simFin.meses) {
      if (m.mes <= horizonte) parcelaPorMes[m.mes] = m.total;
    }

    const combMes = (globals.kmMes / carro.consumo) * globals.precoComb;
    const ipvaMes = (carro.valor * (carro.ipvaPerc / 100)) / 12;
    const seguroMes = (carro.valor * (carro.seguroPerc / 100)) / 12;
    const cuidadoMes = carro.revisao / 12;
    const operacionalMes = combMes + ipvaMes + seguroMes + cuidadoMes;

    const rend = globals.rendMes;
    const historico = [];

    let caixa = caixaInicial;
    let valorCarro = carro.valor;
    historico.push({ mes: 0, caixa, patrimonio: caixa + valorCarro, gastoAcum: carro.entrada });

    let gastoAcum = carro.entrada;

    for (let m = 1; m <= horizonte; m++) {
      // 1) Rendimento sobre caixa positivo
      if (caixa > 0) caixa = caixa * (1 + rend);
      // 2) Debitar parcela do financiamento + operacional
      const parcela = parcelaPorMes[m] || 0;
      const gastoMes = parcela + operacionalMes;
      caixa -= gastoMes;
      gastoAcum += gastoMes;
      valorCarro = valorCarroNoMes(carro.valor, m);
      historico.push({ mes: m, caixa, patrimonio: caixa + valorCarro, gastoAcum });
    }
    return { historico, simFin };
  }

  function simularPatrimonioCarroVista(globals, carro, horizonte, vendaAntigo) {
    const caixaInicial = globals.capitalInicial + (vendaAntigo || 0) - carro.valor;
    const combMes = (globals.kmMes / carro.consumo) * globals.precoComb;
    const ipvaMes = (carro.valor * (carro.ipvaPerc / 100)) / 12;
    const seguroMes = (carro.valor * (carro.seguroPerc / 100)) / 12;
    const cuidadoMes = carro.revisao / 12;
    const operacionalMes = combMes + ipvaMes + seguroMes + cuidadoMes;

    const rend = globals.rendMes;
    const historico = [];

    let caixa = caixaInicial;
    let valorCarro = carro.valor;
    historico.push({ mes: 0, caixa, patrimonio: caixa + valorCarro, gastoAcum: carro.valor });

    let gastoAcum = carro.valor;
    for (let m = 1; m <= horizonte; m++) {
      if (caixa > 0) caixa = caixa * (1 + rend);
      caixa -= operacionalMes;
      gastoAcum += operacionalMes;
      valorCarro = valorCarroNoMes(carro.valor, m);
      historico.push({ mes: m, caixa, patrimonio: caixa + valorCarro, gastoAcum });
    }

    return { historico };
  }

  // ============ UI: OLD CAR CARD ============
  function renderOldCar(car) {
    const card = document.createElement('div');
    card.className = 'car-card old';
    card.style.setProperty('--car-color', ANTIGO_COLOR);
    card.dataset.id = car.id;

    card.innerHTML = `
      <div class="car-header">
        <span style="width:32px; height:32px; border-radius:50%; background:${ANTIGO_COLOR}; display:inline-block; flex-shrink:0;"></span>
        <input type="text" class="car-name-input" data-field="name" value="${escapeHTML(car.name)}" maxlength="40">
        <span style="font-family:'JetBrains Mono', monospace; font-size:0.72rem; color:var(--ink-mute); letter-spacing:0.1em;">CUSTO/MÊS: <strong style="color:${ANTIGO_COLOR};" data-out="total">—</strong></span>
        <button class="icon-btn danger" data-action="remove-old-car" title="Remover">× remover</button>
      </div>

      <div class="car-body-grid">
        <div>
          <div class="section-label">Manutenção e combustível</div>
          <div class="field paired-field">
            <label>Manutenção
              <small>Preencha por mês ou por ano.</small>
            </label>
            <div class="paired-inputs">
              <div class="paired-slot">
                <span class="paired-slot-label">Mensal</span>
                <div class="input-wrap">
                  <span class="prefix">R$</span>
                  <input type="number" data-field="manutencao" value="${roundTo(car.manutencao, 2)}" min="0" step="0.01">
                </div>
              </div>
              <div class="paired-slot">
                <span class="paired-slot-label">Anual</span>
                <div class="input-wrap">
                  <span class="prefix">R$</span>
                  <input type="number" data-derived-field="manutencaoAnual" value="${roundTo(monthlyToAnnualLinear(car.manutencao), 2)}" min="0" step="0.01">
                </div>
              </div>
            </div>
          </div>
          <div class="field">
            <label>Consumo</label>
            <div class="input-wrap">
              <input type="number" data-field="consumo" value="${car.consumo}" min="1" step="0.5">
              <span class="suffix">km/L</span>
            </div>
          </div>
          <div class="field">
            <label>Preço venda hoje
              <small>Se vender para comprar outro</small>
            </label>
            <div class="input-wrap">
              <span class="prefix">R$</span>
              <input type="number" data-field="vendaAtual" value="${car.vendaAtual}" min="0" step="0.01">
            </div>
          </div>
        </div>

        <div>
          <div class="section-label">Taxas anuais</div>
          <div class="field paired-field">
            <label>Seguro
              <small>Preencha por mês ou por ano.</small>
            </label>
            <div class="paired-inputs">
              <div class="paired-slot">
                <span class="paired-slot-label">Mensal</span>
                <div class="input-wrap">
                  <span class="prefix">R$</span>
                  <input type="number" data-derived-field="seguroMensal" value="${roundTo(annualToMonthlyLinear(car.seguroAnual), 2)}" min="0" step="0.01">
                </div>
              </div>
              <div class="paired-slot">
                <span class="paired-slot-label">Anual</span>
                <div class="input-wrap">
                  <span class="prefix">R$</span>
                  <input type="number" data-field="seguroAnual" value="${roundTo(car.seguroAnual, 2)}" min="0" step="0.01">
                </div>
              </div>
            </div>
          </div>
          <div class="field">
            <label>Licenciamento anual</label>
            <div class="input-wrap">
              <span class="prefix">R$</span>
              <input type="number" data-field="licenciamentoAnual" value="${car.licenciamentoAnual}" min="0" step="0.01">
            </div>
          </div>
        </div>
      </div>
    `;

    const manutencaoMesInput = card.querySelector('[data-field="manutencao"]');
    const manutencaoAnoInput = card.querySelector('[data-derived-field="manutencaoAnual"]');
    const seguroMesInput = card.querySelector('[data-derived-field="seguroMensal"]');
    const seguroAnoInput = card.querySelector('[data-field="seguroAnual"]');

    card.querySelectorAll('input[data-field], input[data-derived-field]').forEach(inp => {
      inp.addEventListener('input', e => {
        const field = e.target.dataset.field;
        const derivedField = e.target.dataset.derivedField;

        if (field === 'name') {
          car.name = e.target.value;
        } else if (field === 'manutencao') {
          car.manutencao = readNumericValue(e.target);
          if (manutencaoAnoInput) manutencaoAnoInput.value = formatInputValue(monthlyToAnnualLinear(car.manutencao), 2);
        } else if (derivedField === 'manutencaoAnual') {
          car.manutencao = annualToMonthlyLinear(readNumericValue(e.target));
          if (manutencaoMesInput) manutencaoMesInput.value = formatInputValue(car.manutencao, 2);
        } else if (field === 'seguroAnual') {
          car.seguroAnual = readNumericValue(e.target);
          if (seguroMesInput) seguroMesInput.value = formatInputValue(annualToMonthlyLinear(car.seguroAnual), 2);
        } else if (derivedField === 'seguroMensal') {
          car.seguroAnual = monthlyToAnnualLinear(readNumericValue(e.target));
          if (seguroAnoInput) seguroAnoInput.value = formatInputValue(car.seguroAnual, 2);
        } else {
          car[field] = readInputValue(e.target);
        }
        recalcular();
      });
    });

    card.querySelector('[data-action="remove-old-car"]').addEventListener('click', () => {
      if (oldCars.length <= 1) {
        alert('Você precisa manter pelo menos 1 carro antigo.');
        return;
      }
      oldCars = oldCars.filter(c => c.id !== car.id);
      renderAll();
    });

    return card;
  }

  // ============ UI: CAR CARD ============
  function renderCar(car) {
    const card = document.createElement('div');
    card.className = 'car-card';
    card.style.setProperty('--car-color', car.color);
    card.dataset.id = car.id;
    const cuidadoCopy = getCarCuidadoCopy(car);

    card.innerHTML = `
      <div class="car-header">
        <input type="color" data-field="color" value="${car.color}" title="Cor do carro">
        <input type="text" class="car-name-input" data-field="name" value="${escapeHTML(car.name)}" maxlength="40">
        <button class="icon-btn danger" data-action="remove-car" title="Remover carro">× remover</button>
      </div>

      <div class="car-body-grid">
        <div>
          <div class="section-label">Veículo</div>
          <div class="field">
            <label>Valor do veículo</label>
            <div class="input-wrap">
              <span class="prefix">R$</span>
              <input type="number" data-field="valor" value="${car.valor}" min="0" step="0.01">
            </div>
          </div>
          <div class="field">
            <label>Ano do carro
              <small>Use o ano para comparar novo, seminovo ou usado</small>
            </label>
            <div class="input-wrap">
              <input type="number" data-field="ano" value="${car.ano}" min="1950" max="${ANO_ATUAL}" step="1" data-integer="true" data-no-grouping="true">
            </div>
          </div>
          <div class="field">
            <label>Garantia
              <small>Seminovo e usado também podem continuar cobertos</small>
            </label>
            <label class="field-boolean">
              <input type="checkbox" data-field="emGarantia" ${isCarroEmGarantia(car) ? 'checked' : ''}>
              <span>Ainda está na garantia</span>
            </label>
          </div>
          <div class="field">
            <label>Entrada
              <small>Sai do caixa</small>
            </label>
            <div class="input-wrap">
              <span class="prefix">R$</span>
              <input type="number" data-field="entrada" value="${car.entrada}" min="0" step="0.01">
            </div>
          </div>
          <div class="field">
            <label>Consumo</label>
            <div class="input-wrap">
              <input type="number" data-field="consumo" value="${car.consumo}" min="1" step="0.5">
              <span class="suffix">km/L</span>
            </div>
          </div>
        </div>

        <div>
          <div class="section-label">Operacional</div>
          <div class="field">
            <label>IPVA
              <small>% do valor venal</small>
            </label>
            <div class="input-wrap">
              <input type="number" data-field="ipvaPerc" value="${car.ipvaPerc}" min="0" step="0.1">
              <span class="suffix">%</span>
            </div>
          </div>
          <div class="field paired-field">
            <label>Seguro
              <small>% do valor do carro, por mês ou por ano.</small>
            </label>
            <div class="paired-inputs">
              <div class="paired-slot">
                <span class="paired-slot-label">Mensal</span>
                <div class="input-wrap">
                  <input type="number" data-derived-field="seguroPercMes" value="${roundTo(annualToMonthlyLinear(car.seguroPerc), 2)}" min="0" step="0.01">
                  <span class="suffix">% a.m.</span>
                </div>
              </div>
              <div class="paired-slot">
                <span class="paired-slot-label">Anual</span>
                <div class="input-wrap">
                  <input type="number" data-field="seguroPerc" value="${roundTo(car.seguroPerc, 2)}" min="0" step="0.1">
                  <span class="suffix">% a.a.</span>
                </div>
              </div>
            </div>
          </div>
          <div class="field paired-field">
            <label><span data-cuidado-label>${cuidadoCopy.label}</span>
              <small data-cuidado-help>${cuidadoCopy.help}</small>
            </label>
            <div class="paired-inputs">
              <div class="paired-slot">
                <span class="paired-slot-label">Mensal</span>
                <div class="input-wrap">
                  <span class="prefix">R$</span>
                  <input type="number" data-derived-field="revisaoMensal" value="${roundTo(annualToMonthlyLinear(car.revisao), 2)}" min="0" step="0.01">
                </div>
              </div>
              <div class="paired-slot">
                <span class="paired-slot-label">Anual</span>
                <div class="input-wrap">
                  <span class="prefix">R$</span>
                  <input type="number" data-field="revisao" value="${roundTo(car.revisao, 2)}" min="0" step="0.01">
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="financings-wrap" data-financings-wrap>
        <div class="scenario-controls">
          <div class="scenario-card">
            <div class="scenario-card-copy">
              <div class="scenario-card-title">Compra à vista</div>
              <div class="scenario-card-subtitle">Simula pagar o valor total do carro agora e incluir esse cenário na comparação.</div>
              <div class="scenario-card-meta" data-out="cash-buy-time">Calculando prazo para compra à vista...</div>
            </div>
            <label class="field-boolean">
              <input type="checkbox" data-field="showCashPurchaseInChart" ${car.showCashPurchaseInChart ? 'checked' : ''}>
              <span>Mostrar no gráfico</span>
            </label>
          </div>

          <div class="scenario-card">
            <div class="scenario-card-copy">
              <div class="scenario-card-title">Modo financiado</div>
              <div class="scenario-card-subtitle">Liga ou desliga toda a seção de financiamentos e a presença do financiamento ativo no gráfico.</div>
            </div>
            <label class="field-boolean">
              <input type="checkbox" data-field="showActiveFinancingInChart" ${car.showActiveFinancingInChart ? 'checked' : ''}>
              <span>Usar financiamentos</span>
            </label>
          </div>
        </div>

        <div class="financings-panel ${car.showActiveFinancingInChart ? '' : 'disabled'}" data-financings-panel>
        <div class="financings-header">
          <div class="financings-header-main">
            <div class="financings-heading-copy">
              <div class="financings-header-title">Seção de financiamentos</div>
              <div class="financings-header-subtitle">Escolha abaixo qual banco fica ativo para este carro quando o modo financiado estiver em uso.</div>
            </div>
          </div>
          <button class="add-btn small" data-action="add-financing" ${car.showActiveFinancingInChart ? '' : 'disabled'}>+ Financiamento</button>
        </div>
        <div class="financings-grid" data-financings-container></div>
        </div>
      </div>
    `;

    // Bindings do carro
    const seguroPercMesInput = card.querySelector('[data-derived-field="seguroPercMes"]');
    const seguroPercAnoInput = card.querySelector('[data-field="seguroPerc"]');
    const revisaoMesInput = card.querySelector('[data-derived-field="revisaoMensal"]');
    const revisaoAnoInput = card.querySelector('[data-field="revisao"]');

    card.querySelectorAll('input[data-field], input[data-derived-field]').forEach(inp => {
      inp.addEventListener('input', e => {
        const field = e.target.dataset.field;
        const derivedField = e.target.dataset.derivedField;

        if (field === 'name' || field === 'color') {
          car[field] = e.target.value;
          if (field === 'color') {
            card.style.setProperty('--car-color', car.color);
          }
        } else if (field === 'showActiveFinancingInChart') {
          car.showActiveFinancingInChart = e.target.checked;
          renderAll();
          return;
        } else if (field === 'showCashPurchaseInChart') {
          car.showCashPurchaseInChart = e.target.checked;
        } else if (field === 'emGarantia') {
          car.emGarantia = e.target.checked;
          updateCarCuidadoCopy(card, car);
        } else if (field === 'ano') {
          car.ano = Math.max(1950, Math.min(ANO_ATUAL, readIntegerValue(e.target) || ANO_ATUAL));
          updateCarCuidadoCopy(card, car);
        } else if (field === 'seguroPerc') {
          car.seguroPerc = readNumericValue(e.target);
          if (seguroPercMesInput) seguroPercMesInput.value = formatInputValue(annualToMonthlyLinear(car.seguroPerc), 2);
        } else if (derivedField === 'seguroPercMes') {
          car.seguroPerc = monthlyToAnnualLinear(readNumericValue(e.target));
          if (seguroPercAnoInput) seguroPercAnoInput.value = formatInputValue(car.seguroPerc, 2);
        } else if (field === 'revisao') {
          car.revisao = readNumericValue(e.target);
          if (revisaoMesInput) revisaoMesInput.value = formatInputValue(annualToMonthlyLinear(car.revisao), 2);
        } else if (derivedField === 'revisaoMensal') {
          car.revisao = monthlyToAnnualLinear(readNumericValue(e.target));
          if (revisaoAnoInput) revisaoAnoInput.value = formatInputValue(car.revisao, 2);
        } else {
          car[field] = readInputValue(e.target);
        }
        recalcular();
      });
    });

    card.querySelector('[data-action="remove-car"]').addEventListener('click', () => {
      if (cars.length <= 1) {
        alert('Você precisa manter pelo menos 1 carro novo para comparação.');
        return;
      }
      cars = cars.filter(c => c.id !== car.id);
      renderAll();
    });

    card.querySelector('[data-action="add-financing"]').addEventListener('click', () => {
      car.financings.push(createFinancing({
        name: `Banco ${String.fromCharCode(65 + car.financings.length)}`
      }));
      renderAll();
    });

    // Render financings
    const finContainer = card.querySelector('[data-financings-container]');
    car.financings.forEach(fin => {
      finContainer.appendChild(renderFinancing(car, fin));
    });

    return card;
  }

  function renderFinancing(car, fin) {
    const isActive = fin.id === car.activeFinancingId;
    const isEnabled = car.showActiveFinancingInChart;
    const aporteMensalGlobal = readNumericValue($('aporte_mensal')) || 0;
    const card = document.createElement('div');
    card.className = 'fin-card' + (isActive && isEnabled ? ' active' : '') + (!isEnabled ? ' disabled' : '');
    card.dataset.id = fin.id;

    card.innerHTML = `
      <div class="fin-card-header">
        <input type="text" class="fin-name-input" data-field="name" value="${escapeHTML(fin.name)}" maxlength="30">
        <button class="icon-btn danger" data-action="remove-fin" title="Remover">×</button>
      </div>

      <div class="field">
        <label>Prazo</label>
        <div class="input-wrap">
          <input type="number" data-field="prazo" value="${fin.prazo}" min="1" step="1" data-integer="true">
          <span class="suffix">meses</span>
        </div>
      </div>
      <div class="field">
        <label>Juros nominal</label>
        <div class="input-wrap">
          <input type="number" data-field="juros" value="${fin.juros}" min="0" step="0.01">
          <span class="suffix">% a.m.</span>
        </div>
      </div>

      <div class="field">
        <label>Parcela real do banco
          <small>Vazio = calcula automático com +${(CET_PADRAO*100).toFixed(0)}% de CET</small>
        </label>
        <div class="input-wrap">
          <span class="prefix">R$</span>
          <input type="number" data-field="parcelaReal" value="${fin.parcelaReal || ''}" min="0" step="0.01" placeholder="auto">
        </div>
      </div>

      <div class="toggle-row" data-toggle="amortType">
        <button data-val="price" class="${fin.amortType === 'price' ? 'active' : ''}">Price</button>
        <button data-val="sac" class="${fin.amortType === 'sac' ? 'active' : ''}">SAC</button>
      </div>

      <div class="field">
        <label>${aporteMensalGlobal > 0 ? 'Amort. extra calculada' : 'Amort. extra'}
          <small>${aporteMensalGlobal > 0 ? 'Calculada pela sobra entre o aporte mensal global e a parcela do mês.' : 'Valor fixo adicional pago todo mês.'}</small>
        </label>
        <div class="input-wrap">
          <span class="prefix">R$</span>
          <input type="number" data-field="extraAmort" value="${fin.extraAmort}" min="0" step="0.01" data-out="extra-amort" ${aporteMensalGlobal > 0 ? 'disabled' : ''}>
        </div>
      </div>

      <div class="toggle-row" data-toggle="extraMode">
        <button data-val="prazo" class="${fin.extraMode === 'prazo' ? 'active' : ''}">↓ Prazo</button>
        <button data-val="parcela" class="${fin.extraMode === 'parcela' ? 'active' : ''}">↓ Parcela</button>
      </div>

      <div class="fin-metrics" data-metrics></div>

      <button class="fin-select-btn" data-action="select-fin">
        ${!isEnabled ? 'Financiamento desativado' : isActive ? '✓ Ativo' : 'Ativar'}
      </button>
    `;

    if (!isEnabled) {
      card.querySelectorAll('input, button').forEach(el => {
        el.disabled = true;
      });
    }

    card.querySelectorAll('input[data-field]').forEach(inp => {
      inp.addEventListener('input', e => {
        const field = e.target.dataset.field;
        if (field === 'name') fin[field] = e.target.value;
        else if (e.target.type === 'checkbox') fin[field] = e.target.checked;
        else fin[field] = readInputValue(e.target);
        recalcular();
      });
    });

    card.querySelectorAll('.toggle-row').forEach(tg => {
      const field = tg.dataset.toggle;
      tg.querySelectorAll('button').forEach(btn => {
        btn.addEventListener('click', () => {
          fin[field] = btn.dataset.val;
          tg.querySelectorAll('button').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          recalcular();
        });
      });
    });

    card.querySelector('[data-action="remove-fin"]').addEventListener('click', () => {
      if (car.financings.length <= 1) {
        alert('Cada carro precisa manter pelo menos 1 financiamento.');
        return;
      }
      car.financings = car.financings.filter(f => f.id !== fin.id);
      if (car.activeFinancingId === fin.id) {
        car.activeFinancingId = car.financings[0].id;
      }
      renderAll();
    });

    card.querySelector('[data-action="select-fin"]').addEventListener('click', () => {
      car.activeFinancingId = fin.id;
      renderAll();
    });

    return card;
  }

  function renderAll() {
    const oldContainer = $('old_cars_container');
    oldContainer.innerHTML = '';
    oldCars.forEach(car => oldContainer.appendChild(renderOldCar(car)));

    const container = $('cars_container');
    container.innerHTML = '';
    cars.forEach(car => container.appendChild(renderCar(car)));
    normalizeNumericInputs(oldContainer);
    normalizeNumericInputs(container);
    recalcular();
  }

  // ============ RECÁLCULO ============
  function recalcular() {
    const H = Math.max(1, readIntegerValue($('horizonte')) || 60);
    const globals = {
      capitalInicial: readNumericValue($('capital_inicial')) || 0,
      rendMes: (readNumericValue($('rendimento_mes')) || 0) / 100,
      kmMes: readNumericValue($('km_mes')) || 0,
      precoComb: readNumericValue($('combustivel_preco')) || 0,
      aporteMensal: readNumericValue($('aporte_mensal')) || 0,
    };

    // ==== CALCULAR DESPESAS DO CARRO ANTIGO (para saber o aporte) ====
    // Usamos o MELHOR antigo, mas ainda não sabemos qual é — vamos decidir depois.
    // Por enquanto, precisamos conhecer as despesas de cada antigo.
    const oldCarBaseData = oldCars.map(oldCar => {
      const combMes = (globals.kmMes / (oldCar.consumo || 1)) * globals.precoComb;
      const custoMensal = oldCar.manutencao + combMes + (oldCar.seguroAnual / 12) + (oldCar.licenciamentoAnual / 12);
      return { oldCar, custoMensal, combMes };
    });

    // Atualizar display do custo mensal em cada card antigo
    oldCarBaseData.forEach(({ oldCar, custoMensal }) => {
      const card = document.querySelector(`.car-card.old[data-id="${oldCar.id}"]`);
      if (card) {
        const outEl = card.querySelector('[data-out="total"]');
        if (outEl) outEl.textContent = fmtBRL2(custoMensal);
      }
    });

    cars.forEach(car => {
      const card = document.querySelector(`.car-card[data-id="${car.id}"]`);
      const cashTimeEl = card?.querySelector('[data-out="cash-buy-time"]');
      if (!cashTimeEl) return;

      const prazoVista = calcularPrazoCompraVista(
        car.valor,
        globals.capitalInicial,
        globals.aporteMensal,
        globals.rendMes
      );

      if (prazoVista.atingiu) {
        cashTimeEl.textContent = `Compra estimada em ${formatarPrazoMeses(prazoVista.meses)} com saldo de ${fmtBRL2(prazoVista.saldoFinal)}.`;
      } else {
        cashTimeEl.textContent = 'Com os parâmetros atuais, o valor do carro não é atingido em prazo razoável.';
      }
    });

    const aportePorMes = new Array(H + 1).fill(globals.aporteMensal);
    aportePorMes[0] = 0;
    const aporteMedioStr = fmtBRL2(globals.aporteMensal);
    const aporteExplain = globals.aporteMensal > 0
      ? `Você informou <strong>${fmtBRL2(globals.aporteMensal)}/mês</strong> como capacidade fixa de aporte. Ao manter o carro antigo, esse valor é investido mensalmente. Nos financiamentos, a sobra entre esse aporte e a parcela do mês vira amortização extra.`
      : 'Defina um aporte mensal nas premissas globais para investir ao manter o antigo e acelerar a quitação nos financiamentos.';

    $('aporte_valor_out').textContent = aporteMedioStr;
    $('aporte_explain').innerHTML = aporteExplain;

    // ==== SIMULAR CADA CARRO ANTIGO COM APORTE ====
    const oldCarResults = oldCarBaseData.map(({ oldCar, custoMensal }) => {
      const historico = simularPatrimonioAntigo(globals, oldCar, H, aportePorMes);
      return {
        oldCar,
        historico,
        custoMensal,
        finalPatrimonio: historico[historico.length - 1].patrimonio
      };
    });

    // Escolher o melhor carro antigo (maior patrimônio ao fim do horizonte)
    const bestOld = oldCarResults.length > 0
      ? oldCarResults.reduce((a, b) => a.finalPatrimonio >= b.finalPatrimonio ? a : b)
      : null;

    const histAntigo = bestOld ? bestOld.historico : [{ mes: 0, caixa: globals.capitalInicial, patrimonio: globals.capitalInicial, gastoAcum: 0, aporteAcum: 0 }];
    const vendaAntigoParaNovo = bestOld ? bestOld.oldCar.vendaAtual : 0;

    // ==== SIMULAR CADA CARRO NOVO ====
    const carResults = cars.map(car => {
      const activeFin = car.financings.find(f => f.id === car.activeFinancingId) || car.financings[0];
      const result = simularPatrimonioCarroNovo(globals, car, activeFin, H, vendaAntigoParaNovo);
      const chartScenarios = [];

      // Atualizar métricas de CADA financiamento do carro
      car.financings.forEach(fin => {
        const financiado = Math.max(0, car.valor - car.entrada);
        const resolved = resolverTaxaEfetiva(financiado, fin.juros / 100, fin.prazo, fin.parcelaReal, fin.amortType);
        const taxaEf = resolved.taxaEfetiva;
        const simF = simularFinanciamento(financiado, taxaEf, fin.prazo, fin.amortType, fin.extraAmort, fin.extraMode, globals.aporteMensal);
        const simFSem = simularFinanciamento(financiado, taxaEf, fin.prazo, fin.amortType, 0, fin.extraMode);
        const economiaJuros = simFSem.totalJuros - simF.totalJuros;
        const mesesEconomizados = simFSem.prazoEfetivo - simF.prazoEfetivo;
        const custoFinalComAmort = car.entrada + simF.totalPago;
        const custoFinalSemAmort = car.entrada + simFSem.totalPago;

        const finCard = document.querySelector(`.car-card[data-id="${car.id}"] .fin-card[data-id="${fin.id}"]`);
        if (finCard) {
          const metricsEl = finCard.querySelector('[data-metrics]');
          const extraOutEl = finCard.querySelector('[data-out="extra-amort"]');
          if (extraOutEl && globals.aporteMensal > 0) {
            extraOutEl.value = formatInputValue(simF.primeiraExtra, 2);
          }
          const parcelaLabel = fin.amortType === 'price' ? 'Parcela base' : '1a parcela';
          const parcelaDestaque = simF.primeiraParcelaBase;
          const fonteTag = resolved.fonte === 'manual'
            ? `<span style="background:#c99a2a; color:#fff; font-size:0.6rem; padding:2px 6px; border-radius:2px; letter-spacing:0.08em;">MANUAL</span>`
            : `<span style="background:var(--ink-mute); color:#fff; font-size:0.6rem; padding:2px 6px; border-radius:2px; letter-spacing:0.08em;" title="Calculada com margem CET de ${(CET_PADRAO*100).toFixed(0)}% sobre juros nominais">AUTO +${(CET_PADRAO*100).toFixed(0)}%</span>`;
          metricsEl.innerHTML = `
            <div class="fin-total-compare">
              <div class="fin-total-card primary">
                <div class="fin-total-title">Custo final com amortização</div>
                <div class="fin-total-value">${fmtBRL(custoFinalComAmort)}</div>
                <div class="fin-total-meta">Juros e custos: ${fmtBRL(simF.totalJuros)}</div>
              </div>
              <div class="fin-total-card">
                <div class="fin-total-title">Custo final sem amortização</div>
                <div class="fin-total-value">${fmtBRL(custoFinalSemAmort)}</div>
                <div class="fin-total-meta">Juros e custos: ${fmtBRL(simFSem.totalJuros)}</div>
              </div>
            </div>
            <div class="metric">
              <div class="metric-label">${parcelaLabel} ${fonteTag}</div>
              <div class="metric-value highlight">${fmtBRL(parcelaDestaque)}</div>
            </div>
            <div class="metric">
              <div class="metric-label">Prazo ef.</div>
              <div class="metric-value">${simF.prazoEfetivo}m</div>
            </div>
            <div class="metric">
              <div class="metric-label">Total pago</div>
              <div class="metric-value">${fmtBRL(simF.totalPago)}</div>
            </div>
            <div class="metric">
              <div class="metric-label">Juros + custos com amort.</div>
              <div class="metric-value">${fmtBRL(simF.totalJuros)}</div>
            </div>
            <div class="metric" style="grid-column:1/-1; padding-top:6px; border-top:1px dashed var(--line); font-size:0.7rem; color:var(--ink-mute);">
              Taxa efetiva (CET): ${(taxaEf * 100).toFixed(2)}% a.m.${resolved.fonte === 'auto' ? ` <em>(${fin.juros}% nominal + margem)</em>` : ''}${fin.amortType === 'sac' ? ` · última parcela ${fmtBRL(simF.ultimaParcelaBase)}` : ''}
            </div>
            ${(globals.aporteMensal > 0 || fin.extraAmort > 0) ? `
              <div class="metric" style="grid-column:1/-1; padding-top:6px; border-top:1px dashed var(--line);">
                <div class="metric-label">Amort. extra poupa</div>
                <div class="metric-value" style="color:#2d5f4a; font-size:0.75rem;">
                  ${fmtBRL(economiaJuros)}${mesesEconomizados > 0 ? ` · ${mesesEconomizados}m antes` : ''}${globals.aporteMensal > 0 ? ` · extra inicial ${fmtBRL2(simF.primeiraExtra)}` : ''}
                </div>
              </div>
            ` : ''}
          `;
        }

      });

      if (car.showActiveFinancingInChart && activeFin) {
        chartScenarios.push({
          type: 'financing',
          name: `${car.name} · ${activeFin.name}`,
          color: car.color,
          dashArray: '',
          historico: result.historico,
          finalPatrimonio: result.historico[result.historico.length - 1].patrimonio,
          detail: activeFin.amortType === 'price'
            ? `Price · parcela ${fmtBRL(result.simFin.primeiraParcelaBase)}/mês`
            : `SAC · 1a ${fmtBRL(result.simFin.primeiraParcelaBase)} · última ${fmtBRL(result.simFin.ultimaParcelaBase)}`,
          finName: activeFin.name
        });
      }

      if (car.showCashPurchaseInChart) {
        const vistaResult = simularPatrimonioCarroVista(globals, car, H, vendaAntigoParaNovo);
        chartScenarios.push({
          type: 'cash',
          name: `${car.name} · À vista`,
          color: car.color,
          dashArray: '3 4',
          historico: vistaResult.historico,
          finalPatrimonio: vistaResult.historico[vistaResult.historico.length - 1].patrimonio,
          detail: `Compra à vista · ${fmtBRL(car.valor)}`,
          finName: 'À vista'
        });
      }

      return {
        car,
        activeFin,
        historico: result.historico,
        finalPatrimonio: result.historico[result.historico.length - 1].patrimonio,
        simFin: result.simFin,
        chartScenarios
      };
    });

    const chartScenarioResults = carResults.flatMap(result => result.chartScenarios);

    // Renderizar gráfico
    renderChart(globals, H, histAntigo, chartScenarioResults, bestOld);
    renderLegendAndRanking(globals, H, histAntigo, chartScenarioResults, bestOld);
    saveState();
  }

  // ============ GRÁFICO ============
  let chartData = null; // cache para tooltip

  function renderChart(globals, H, histAntigo, scenarioResults, bestOld) {
    const svg = $('chart_svg');
    const W = 900, Ht = 500;
    const padL = 70, padR = 20, padT = 20, padB = 50;
    const plotW = W - padL - padR;
    const plotH = Ht - padT - padB;

    const antigoLabel = bestOld ? `Manter ${bestOld.oldCar.name}` : 'Manter antigo';

    // Calcular escalas
    const allSeries = [
      { name: antigoLabel, color: ANTIGO_COLOR, data: histAntigo, isAntigo: true },
      ...scenarioResults.map(r => ({
        name: r.name,
        color: r.color,
        dashArray: r.dashArray,
        data: r.historico,
        isAntigo: false,
        detail: r.detail,
        type: r.type
      }))
    ];

    const allValues = allSeries.flatMap(s => s.data.map(d => d.patrimonio));
    const maxY = Math.max(...allValues) * 1.05;
    const minY = Math.min(...allValues, 0) * (Math.min(...allValues) < 0 ? 1.05 : 0.95);

    const xScale = mes => padL + (mes / H) * plotW;
    const yScale = val => padT + plotH - ((val - minY) / (maxY - minY)) * plotH;

    // SVG content
    let html = '';

    // Grid horizontal
    const nGrid = 5;
    for (let i = 0; i <= nGrid; i++) {
      const v = minY + (maxY - minY) * (i / nGrid);
      const y = yScale(v);
      html += `<line class="chart-grid-line" x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}"/>`;
      html += `<text class="chart-axis-label" x="${padL - 8}" y="${y + 4}" text-anchor="end">${fmtBRL(v)}</text>`;
    }

    // Eixo X labels
    const nX = Math.min(6, H);
    for (let i = 0; i <= nX; i++) {
      const mes = Math.round((H * i) / nX);
      const x = xScale(mes);
      html += `<line class="chart-grid-line" x1="${x}" y1="${padT}" x2="${x}" y2="${padT + plotH}" stroke-dasharray="2,3"/>`;
      html += `<text class="chart-axis-label" x="${x}" y="${padT + plotH + 20}" text-anchor="middle">${mes}m</text>`;
    }

    // Axes
    html += `<line class="chart-axis-line" x1="${padL}" y1="${padT}" x2="${padL}" y2="${padT + plotH}"/>`;
    html += `<line class="chart-axis-line" x1="${padL}" y1="${padT + plotH}" x2="${W - padR}" y2="${padT + plotH}"/>`;

    // Linha zero se relevante
    if (minY < 0) {
      const y0 = yScale(0);
      html += `<line x1="${padL}" y1="${y0}" x2="${W - padR}" y2="${y0}" stroke="#aaa" stroke-width="1" stroke-dasharray="4,4"/>`;
    }

    // Linhas dos cenários
    allSeries.forEach((s, idx) => {
      const points = s.data.map(d => `${xScale(d.mes)},${yScale(d.patrimonio)}`).join(' ');
      html += `<polyline class="chart-line" points="${points}" stroke="${s.color}" stroke-dasharray="${s.dashArray || ''}" data-series="${idx}"/>`;

      // Último ponto destacado
      const last = s.data[s.data.length - 1];
      html += `<circle class="chart-dot" cx="${xScale(last.mes)}" cy="${yScale(last.patrimonio)}" r="5" stroke="${s.color}"/>`;
    });

    // Labels X e Y
    html += `<text class="chart-axis-label" x="${W / 2}" y="${Ht - 8}" text-anchor="middle" style="font-size:11px;">Meses</text>`;
    html += `<text class="chart-axis-label" x="15" y="${padT + plotH / 2}" text-anchor="middle" transform="rotate(-90 15 ${padT + plotH / 2})" style="font-size:11px;">Patrimônio (R$)</text>`;

    // Overlay invisível para tooltip
    html += `<rect id="chart_overlay" x="${padL}" y="${padT}" width="${plotW}" height="${plotH}" fill="transparent" style="cursor:crosshair;"/>`;

    svg.innerHTML = html;

    chartData = { globals, H, padL, padR, padT, padB, plotW, plotH, xScale, yScale, allSeries };

    // Tooltip interaction
    const overlay = svg.querySelector('#chart_overlay');
    const tooltip = $('chart_tooltip');

    overlay.addEventListener('mousemove', e => {
      const rect = svg.getBoundingClientRect();
      // A svg usa viewBox 900x500, mas no DOM pode estar redimensionada
      const scaleX = rect.width / W;
      const scaleY = rect.height / Ht;
      const svgX = (e.clientX - rect.left) / scaleX;
      const mes = Math.round(((svgX - padL) / plotW) * H);
      if (mes < 0 || mes > H) {
        tooltip.classList.remove('show');
        return;
      }

      const tooltipRows = allSeries.map(s => {
        const pt = s.data[Math.min(mes, s.data.length - 1)];
        return `<div class="tt-row">
          <span><span class="dot" style="background:${s.color}"></span>${escapeHTML(s.name)}</span>
          <strong>${fmtBRL(pt.patrimonio)}</strong>
        </div>`;
      }).join('');

      tooltip.innerHTML = `<div class="tt-title">Mês ${mes}</div>${tooltipRows}`;
      tooltip.classList.add('show');

      // posicionar
      const chartWrapRect = svg.parentElement.getBoundingClientRect();
      let tx = e.clientX - chartWrapRect.left + 14;
      let ty = e.clientY - chartWrapRect.top - 10;
      if (tx + 220 > chartWrapRect.width) tx = e.clientX - chartWrapRect.left - 230;
      if (ty + 200 > chartWrapRect.height) ty = chartWrapRect.height - 210;
      if (ty < 0) ty = 10;
      tooltip.style.left = tx + 'px';
      tooltip.style.top = ty + 'px';

      // Linha vertical do hover
      const existing = svg.querySelector('.hover-line');
      if (existing) existing.remove();
      const hoverX = xScale(mes);
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('class', 'hover-line');
      line.setAttribute('x1', hoverX); line.setAttribute('x2', hoverX);
      line.setAttribute('y1', padT); line.setAttribute('y2', padT + plotH);
      line.setAttribute('stroke', '#000'); line.setAttribute('stroke-width', '1');
      line.setAttribute('stroke-dasharray', '3,3'); line.setAttribute('opacity', '0.4');
      svg.appendChild(line);
    });

    overlay.addEventListener('mouseleave', () => {
      tooltip.classList.remove('show');
      const existing = svg.querySelector('.hover-line');
      if (existing) existing.remove();
    });
  }

  function renderLegendAndRanking(globals, H, histAntigo, scenarioResults, bestOld) {
    const antigoLabel = bestOld ? `Manter ${bestOld.oldCar.name}` : 'Manter antigo';
    const antigoExtra = bestOld && oldCars.length > 1
      ? `melhor entre ${oldCars.length} antigos`
      : 'sem compra de carro';

    // Legenda
    const legendEl = $('chart_legend');
    const items = [
      { name: antigoLabel, color: ANTIGO_COLOR, extra: antigoExtra },
      ...scenarioResults.map(r => ({
        name: r.name,
        color: r.color,
        extra: r.detail || '',
        dashArray: r.dashArray || ''
      }))
    ];
    legendEl.innerHTML = items.map(it => `
      <div class="legend-item">
        <span class="legend-line" style="background:${it.color}; ${it.dashArray ? `mask-image: repeating-linear-gradient(90deg, #000 0 10px, transparent 10px 16px); -webkit-mask-image: repeating-linear-gradient(90deg, #000 0 10px, transparent 10px 16px);` : ''}"></span>
        <span><strong>${escapeHTML(it.name)}</strong> ${it.extra ? `<span style="color:var(--ink-mute);">· ${escapeHTML(it.extra)}</span>` : ''}</span>
      </div>
    `).join('');

    // Ranking
    const antigoFinal = histAntigo[histAntigo.length - 1].patrimonio;
    const ranking = [
      { name: antigoLabel, color: ANTIGO_COLOR, patrimonio: antigoFinal, detail: antigoExtra, isAntigo: true },
      ...scenarioResults.map(r => ({
        name: r.name,
        color: r.color,
        patrimonio: r.finalPatrimonio,
        detail: r.detail,
        isAntigo: false
      }))
    ].sort((a, b) => b.patrimonio - a.patrimonio);

    const tableEl = $('ranking_table');
    tableEl.innerHTML = `
      <thead>
        <tr>
          <th>#</th>
          <th>Cenário</th>
          <th>Detalhes</th>
          <th>Patrimônio em ${H}m</th>
          <th>vs manter antigo</th>
        </tr>
      </thead>
      <tbody>
        ${ranking.map((r, i) => {
          const posClass = i === 0 ? 'p1' : i === 1 ? 'p2' : i === 2 ? 'p3' : '';
          const delta = r.patrimonio - antigoFinal;
          const deltaClass = delta > 0 ? 'delta-pos' : delta < 0 ? 'delta-neg' : '';
          const deltaStr = r.isAntigo ? '—' : `${delta >= 0 ? '+' : ''}${fmtBRL(delta)}`;
          return `
            <tr>
              <td class="pos ${posClass}">${i + 1}º</td>
              <td>
                <span class="car-dot" style="background:${r.color}"></span>
                ${escapeHTML(r.name)}
              </td>
              <td style="font-size:0.78rem; color:var(--ink-mute);">${escapeHTML(r.detail)}</td>
              <td style="font-weight:700;">${fmtBRL(r.patrimonio)}</td>
              <td class="${deltaClass}">${deltaStr}</td>
            </tr>
          `;
        }).join('')}
      </tbody>
    `;
  }

  // ============ INIT ============
  normalizeNumericInputs(document);

  if (!loadState()) {
    seedDefaultState();
  }

  $('add_old_car').addEventListener('click', () => {
    oldCars.push(createOldCar({}));
    renderAll();
  });

  $('add_car').addEventListener('click', () => {
    cars.push(createCar({}));
    renderAll();
  });

  ['horizonte', 'capital_inicial', 'combustivel_preco']
    .forEach(id => $(id).addEventListener('input', recalcular));

  $('aporte_mensal').addEventListener('input', renderAll);

  bindLinkedInputs({
    monthlyInput: $('rendimento_mes'),
    annualInput: $('rendimento_ano'),
    monthlyToAnnual: monthlyPercentToAnnual,
    annualToMonthly: annualPercentToMonthly,
    monthlyDecimals: 2,
    annualDecimals: 2,
  });

  bindLinkedInputs({
    monthlyInput: $('km_mes'),
    annualInput: $('km_ano'),
    monthlyToAnnual: monthlyToAnnualLinear,
    annualToMonthly: annualToMonthlyLinear,
    monthlyDecimals: 0,
    annualDecimals: 0,
  });

  document.querySelectorAll('.quick-pick').forEach(btn => {
    btn.addEventListener('click', () => {
      $('horizonte').value = btn.dataset.h;
      formatNumericInput($('horizonte'));
      syncQuickPicks();
      recalcular();
    });
  });

  $('horizonte').addEventListener('input', () => {
    syncQuickPicks();
  });

  syncQuickPicks();
  renderAll();
})();
