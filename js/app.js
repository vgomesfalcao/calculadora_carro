
(function() {

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
    renderLegendAndRanking(globals, H, histAntigo, chartScenarioResults, bestOld, oldCars.length);
    saveState();
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
