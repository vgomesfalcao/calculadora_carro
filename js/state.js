let cars = [];
let oldCars = [];
let carCounter = 0;
let oldCarCounter = 0;
let finCounter = 0;
let aporteRefCarId = null;

function syncQuickPicks() {
  const horizonte = readIntegerValue($('horizonte')) || 0;
  document.querySelectorAll('.quick-pick').forEach(btn => {
    btn.classList.toggle('active', parseInt(btn.dataset.h, 10) === horizonte);
  });
}

function setAutosaveStatus(message, state = 'idle') {
  const statusEl = $('autosave_status');
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.dataset.state = state;
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
    vendaAtual: 8000,
    ...preset
  };
}

function createFinancing(preset = {}) {
  const id = `fin_${++finCounter}`;
  return {
    id,
    name: preset.name || `Financiamento ${Math.random().toString(36).slice(2, 5).toUpperCase()}`,
    prazo: 48,
    juros: 1.45,
    amortType: 'price',
    extraAmort: 0,
    extraMode: 'prazo',
    parcelaReal: 0,
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
