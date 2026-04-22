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
