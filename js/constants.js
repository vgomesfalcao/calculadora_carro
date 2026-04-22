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
