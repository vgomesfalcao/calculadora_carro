function calcPrice(pv, i, n) {
  if (i === 0) return pv / n;
  const f = Math.pow(1 + i, n);
  return pv * (i * f) / (f - 1);
}

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
    if (caixa > 0) caixa = caixa * (1 + rend);
    const aporte = aportePorMes ? Math.max(0, aportePorMes[m] || 0) : 0;
    caixa += aporte;
    aporteAcum += aporte;
    caixa -= gastoMes;
    gastoAcum += gastoMes;
    const valorCarro = valorAntigoNoMes(antigo.vendaAtual, m);
    historico.push({ mes: m, caixa, patrimonio: caixa + valorCarro, gastoAcum, aporteAcum });
  }
  return historico;
}

function simularPatrimonioCarroNovo(globals, carro, financing, horizonte, vendaAntigo) {
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
    if (caixa > 0) caixa = caixa * (1 + rend);
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
