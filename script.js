/* ==========================================================================
   ROLÔMETRO — Calculadora de Metragem de Rolos de Adesivo
   script.js

   Organização do arquivo:
     1. Utilidades gerais (formatação, validação)
     2. Núcleo do cálculo (fórmula do rolo)
     3. Tema (claro/escuro)
     4. Formulário principal (campos, chips, precisão)
     5. Diagrama técnico (SVG)
     6. Resultado (exibição, copiar, imprimir)
     7. Histórico (localStorage)
     8. Comparador de rolos
     9. Inicialização
   ========================================================================== */

(function () {
  'use strict';

  /* ------------------------------------------------------------------------
     1. UTILIDADES GERAIS
     ------------------------------------------------------------------------ */

  /**
   * Formata um número no padrão brasileiro (vírgula decimal, ponto de milhar).
   * @param {number} value
   * @param {number} decimals
   * @returns {string}
   */
  function formatNumberBR(value, decimals) {
    return value.toLocaleString('pt-BR', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    });
  }

  /**
   * Converte um texto de input (que pode usar vírgula) para Number.
   * Retorna NaN se não for um número válido.
   * @param {string} raw
   * @returns {number}
   */
  function parseFlexibleNumber(raw) {
    if (raw === null || raw === undefined) return NaN;
    const trimmed = String(raw).trim().replace(',', '.');
    if (trimmed === '') return NaN;
    return Number(trimmed);
  }

  /**
   * Valida se um valor é um número positivo e diferente de zero.
   * @param {number} value
   * @returns {boolean}
   */
  function isPositiveNumber(value) {
    return !isNaN(value) && isFinite(value) && value > 0;
  }

  /* ------------------------------------------------------------------------
     2. NÚCLEO DO CÁLCULO
     ------------------------------------------------------------------------ */

  /**
   * Calcula o comprimento de material enrolado usando o método do diâmetro.
   *   L = π × (D² − d²) / (4 × e)      [resultado em mm]
   *   metros = L / 1000
   *
   * @param {number} D - diâmetro externo do rolo, em mm
   * @param {number} d - diâmetro do tubete, em mm
   * @param {number} e - espessura do material, em mm
   * @returns {{ mm: number, metros: number }}
   */
  function calcularMetragem(D, d, e) {
    const Lmm = Math.PI * (Math.pow(D, 2) - Math.pow(d, 2)) / (4 * e);
    return {
      mm: Lmm,
      metros: Lmm / 1000
    };
  }

  /* ------------------------------------------------------------------------
     3. TEMA (CLARO / ESCURO)
     ------------------------------------------------------------------------ */

  const THEME_KEY = 'rolometro_theme';

  function initTheme() {
    const saved = localStorage.getItem(THEME_KEY);
    const preferDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const theme = saved || (preferDark ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', theme);
  }

  function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem(THEME_KEY, next);
    // Redesenha o diagrama para atualizar cores dependentes do tema, se já houver valores.
    atualizarDiagramaComCamposAtuais();
  }

  /* ------------------------------------------------------------------------
     4. FORMULÁRIO PRINCIPAL
     ------------------------------------------------------------------------ */

  // Referências dos campos
  const inputDiametroExterno = document.getElementById('diametroExterno');
  const inputDiametroTubete = document.getElementById('diametroTubete');
  const espessuraSelect = document.getElementById('espessuraSelect');
  const campoEspessuraCustom = document.getElementById('campoEspessuraCustom');
  const inputEspessuraCustom = document.getElementById('espessuraCustom');

  const erroDiametroExterno = document.getElementById('erroDiametroExterno');
  const erroDiametroTubete = document.getElementById('erroDiametroTubete');
  const erroEspessura = document.getElementById('erroEspessura');

  const form = document.getElementById('formCalculo');
  const tubeteChips = document.querySelectorAll('#tubeteQuickOptions .chip');
  const precisionButtons = document.querySelectorAll('.segmented__option');

  let precisaoAtual = 2;

  // Chips de tubete: ao clicar, preenche o campo e marca como ativo
  tubeteChips.forEach(function (chip) {
    chip.addEventListener('click', function () {
      inputDiametroTubete.value = chip.dataset.value;
      marcarChipAtivo(chip.dataset.value);
      limparErro(erroDiametroTubete);
      atualizarDiagramaComCamposAtuais();
    });
  });

  // Se o usuário digitar manualmente um valor que bate com um chip, ativa o chip;
  // caso contrário, desmarca todos.
  inputDiametroTubete.addEventListener('input', function () {
    marcarChipAtivo(inputDiametroTubete.value);
    limparErro(erroDiametroTubete);
    atualizarDiagramaComCamposAtuais();
  });

  function marcarChipAtivo(valor) {
    tubeteChips.forEach(function (chip) {
      chip.classList.toggle('is-active', chip.dataset.value === String(valor));
    });
  }

  // Espessura: exibe campo customizado quando "Outro..." é selecionado
  espessuraSelect.addEventListener('change', function () {
    const ehOutro = espessuraSelect.value === 'outro';
    campoEspessuraCustom.classList.toggle('hidden', !ehOutro);
    limparErro(erroEspessura);
    if (ehOutro) {
      inputEspessuraCustom.focus();
    }
  });
  inputEspessuraCustom.addEventListener('input', limparErro.bind(null, erroEspessura));

  // Diâmetro externo: atualiza o diagrama ao digitar
  inputDiametroExterno.addEventListener('input', function () {
    limparErro(erroDiametroExterno);
    atualizarDiagramaComCamposAtuais();
  });

  // Seletor de precisão (casas decimais)
  precisionButtons.forEach(function (btn) {
    btn.addEventListener('click', function () {
      precisionButtons.forEach(function (b) { b.classList.remove('is-active'); });
      btn.classList.add('is-active');
      precisaoAtual = parseInt(btn.dataset.precision, 10);
      // Se já existe um resultado calculado, reformata com a nova precisão.
      if (ultimoResultado) {
        exibirResultado(ultimoResultado);
      }
    });
  });

  function limparErro(elemento) {
    elemento.textContent = '';
  }

  function mostrarErro(elemento, mensagem) {
    elemento.textContent = mensagem;
  }

  /**
   * Lê e valida a espessura atualmente selecionada (select ou campo customizado).
   * @returns {{ valor: number, texto: string }|null}
   */
  function obterEspessuraSelecionada() {
    if (espessuraSelect.value === 'outro') {
      const valor = parseFlexibleNumber(inputEspessuraCustom.value);
      if (!isPositiveNumber(valor)) return null;
      return { valor: valor, texto: formatNumberBR(valor, 2).replace(/\.?0+$/, '') + ' mm' };
    }
    const valor = parseFlexibleNumber(espessuraSelect.value);
    return { valor: valor, texto: espessuraSelect.options[espessuraSelect.selectedIndex].text };
  }

  /**
   * Valida todos os campos do formulário principal.
   * Preenche mensagens de erro amigáveis quando necessário.
   * @returns {{ D: number, d: number, e: number }|null}
   */
  function validarFormularioPrincipal() {
    let valido = true;

    const D = parseFlexibleNumber(inputDiametroExterno.value);
    if (inputDiametroExterno.value.trim() === '') {
      mostrarErro(erroDiametroExterno, 'Informe o diâmetro externo do rolo.');
      valido = false;
    } else if (!isPositiveNumber(D)) {
      mostrarErro(erroDiametroExterno, 'Digite um número maior que zero.');
      valido = false;
    } else {
      limparErro(erroDiametroExterno);
    }

    const d = parseFlexibleNumber(inputDiametroTubete.value);
    if (inputDiametroTubete.value.trim() === '') {
      mostrarErro(erroDiametroTubete, 'Informe o diâmetro do tubete.');
      valido = false;
    } else if (!isPositiveNumber(d)) {
      mostrarErro(erroDiametroTubete, 'Digite um número maior que zero.');
      valido = false;
    } else {
      limparErro(erroDiametroTubete);
    }

    if (valido && D <= d) {
      mostrarErro(erroDiametroExterno, 'O diâmetro externo deve ser maior que o do tubete.');
      valido = false;
    }

    const espessuraInfo = obterEspessuraSelecionada();
    if (!espessuraInfo) {
      mostrarErro(erroEspessura, 'Informe uma espessura válida, maior que zero.');
      valido = false;
    } else {
      limparErro(erroEspessura);
    }

    if (!valido) return null;

    return { D: D, d: d, e: espessuraInfo.valor, eTexto: espessuraInfo.texto };
  }

  /* ------------------------------------------------------------------------
     5. DIAGRAMA TÉCNICO (SVG)
     ------------------------------------------------------------------------ */

  const svgDiagrama = document.getElementById('rollDiagram');
  const NS = 'http://www.w3.org/2000/svg';

  /**
   * Lê os valores atuais de D e d (sem exigir validação completa) e redesenha o diagrama.
   * Usado para atualização "ao vivo" enquanto o usuário digita.
   */
  function atualizarDiagramaComCamposAtuais() {
    const D = parseFlexibleNumber(inputDiametroExterno.value);
    const d = parseFlexibleNumber(inputDiametroTubete.value);
    desenharDiagrama(
      isPositiveNumber(D) ? D : null,
      isPositiveNumber(d) ? D && isPositiveNumber(d) ? d : null : null
    );
  }

  /**
   * Desenha o corte transversal do rolo como um desenho técnico (estilo CAD),
   * com linhas de cota (dimension lines) indicando D e d.
   * @param {number|null} D - diâmetro externo em mm (null = usa placeholder)
   * @param {number|null} d - diâmetro do tubete em mm (null = usa placeholder)
   */
  function desenharDiagrama(D, d) {
    const view = 320;
    const center = view / 2;
    const maxRadiusPx = 118; // raio máximo em pixels para o diâmetro externo

    const temD = typeof D === 'number' && D > 0;
    const temD_e_d = temD && typeof d === 'number' && d > 0 && d < D;

    // Valores de exibição: usa placeholders elegantes quando ainda não há dados
    const Dexib = temD ? D : 145;
    const dexib = temD_e_d ? d : 38;

    const scale = maxRadiusPx / Dexib;
    const rExterno = Dexib * scale;
    const rInterno = Math.max(dexib * scale, 10);

    // Limpa o SVG
    while (svgDiagrama.firstChild) svgDiagrama.removeChild(svgDiagrama.firstChild);
    svgDiagrama.setAttribute('viewBox', '0 0 ' + view + ' ' + view);

    const style = getComputedStyle(document.documentElement);
    const corMaterial = style.getPropertyValue('--accent').trim() || '#FF6A2B';
    const corTubete = style.getPropertyValue('--ink-faint').trim() || '#8993A3';
    const corDim = style.getPropertyValue('--teal').trim() || '#0C9AA0';
    const corTexto = style.getPropertyValue('--ink').trim() || '#10151F';
    const opacidade = temD ? '1' : '0.45';

    const g = criarElementoSVG('g', { opacity: opacidade });

    // --- Anel de material (hachura espiral simplificada com anéis concêntricos) ---
    const anelId = 'anelMaterial';
    const defs = criarElementoSVG('defs');
    const pattern = criarElementoSVG('pattern', {
      id: anelId, width: 6, height: 6, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(20)'
    });
    pattern.appendChild(criarElementoSVG('rect', { width: 6, height: 6, fill: corMaterial, opacity: 0.16 }));
    pattern.appendChild(criarElementoSVG('line', { x1: 0, y1: 0, x2: 0, y2: 6, stroke: corMaterial, 'stroke-width': 1.4, opacity: 0.55 }));
    defs.appendChild(pattern);
    g.appendChild(defs);

    // Círculo externo (material)
    g.appendChild(criarElementoSVG('circle', {
      cx: center, cy: center, r: rExterno,
      fill: 'url(#' + anelId + ')', stroke: corMaterial, 'stroke-width': 2.5
    }));

    // Anéis concêntricos sutis, sugerindo o enrolamento
    const nAneis = 5;
    for (let i = 1; i < nAneis; i++) {
      const r = rInterno + (rExterno - rInterno) * (i / nAneis);
      g.appendChild(criarElementoSVG('circle', {
        cx: center, cy: center, r: r,
        fill: 'none', stroke: corMaterial, 'stroke-width': 0.8, opacity: 0.35
      }));
    }

    // Círculo interno (tubete)
    g.appendChild(criarElementoSVG('circle', {
      cx: center, cy: center, r: rInterno,
      fill: 'var(--surface)', stroke: corTubete, 'stroke-width': 2.5
    }));
    // Hachura do tubete (indicação técnica de corte)
    g.appendChild(criarElementoSVG('circle', {
      cx: center, cy: center, r: rInterno * 0.55,
      fill: 'none', stroke: corTubete, 'stroke-width': 1, opacity: 0.4, 'stroke-dasharray': '3 3'
    }));

    svgDiagrama.appendChild(g);

    // --- Linha de cota do diâmetro externo (D) ---
    const yDimD = center + rExterno + 26;
    desenharLinhaCota(svgDiagrama, center - rExterno, center + rExterno, yDimD, corDim,
      'D = ' + (temD ? formatNumberBR(D, 1) : '—') + ' mm', corTexto);

    // --- Linha de cota do diâmetro do tubete (d) ---
    const yDimD2 = center - rExterno - 16;
    desenharLinhaCota(svgDiagrama, center - rInterno, center + rInterno, yDimD2, corDim,
      'd = ' + (temD_e_d ? formatNumberBR(d, 1) : '—') + ' mm', corTexto);

    // Linhas de extensão conectando os círculos às cotas
    [-1, 1].forEach(function (sign) {
      svgDiagrama.appendChild(criarElementoSVG('line', {
        x1: center + sign * rExterno, y1: center, x2: center + sign * rExterno, y2: yDimD,
        stroke: corDim, 'stroke-width': 1, 'stroke-dasharray': '2 3', opacity: 0.5
      }));
      svgDiagrama.appendChild(criarElementoSVG('line', {
        x1: center + sign * rInterno, y1: center, x2: center + sign * rInterno, y2: yDimD2,
        stroke: corDim, 'stroke-width': 1, 'stroke-dasharray': '2 3', opacity: 0.5
      }));
    });
  }

  /**
   * Desenha uma linha de cota horizontal estilo desenho técnico, com setas nas pontas e rótulo central.
   */
  function desenharLinhaCota(svg, x1, x2, y, cor, texto, corTexto) {
    const marker = criarElementoSVG('line', { x1: x1, y1: y, x2: x2, y2: y, stroke: cor, 'stroke-width': 1.4 });
    svg.appendChild(marker);

    [x1, x2].forEach(function (x, i) {
      const dir = i === 0 ? 1 : -1;
      const seta = criarElementoSVG('polyline', {
        points: (x + dir * 7) + ',' + (y - 4) + ' ' + x + ',' + y + ' ' + (x + dir * 7) + ',' + (y + 4),
        fill: 'none', stroke: cor, 'stroke-width': 1.4, 'stroke-linecap': 'round', 'stroke-linejoin': 'round'
      });
      svg.appendChild(seta);
    });

    const label = criarElementoSVG('text', {
      x: (x1 + x2) / 2, y: y - 8, 'text-anchor': 'middle',
      'font-family': 'JetBrains Mono, monospace', 'font-size': 12, 'font-weight': 600, fill: corTexto
    });
    label.textContent = texto;
    svg.appendChild(label);
  }

  /**
   * Cria um elemento SVG com os atributos fornecidos.
   */
  function criarElementoSVG(tag, atributos) {
    const el = document.createElementNS(NS, tag);
    if (atributos) {
      Object.keys(atributos).forEach(function (key) {
        el.setAttribute(key, atributos[key]);
      });
    }
    return el;
  }

  /* ------------------------------------------------------------------------
     6. RESULTADO (EXIBIÇÃO, COPIAR, IMPRIMIR)
     ------------------------------------------------------------------------ */

  const resultEmpty = document.getElementById('resultEmpty');
  const resultContent = document.getElementById('resultContent');
  const resultMetros = document.getElementById('resultMetros');
  const resultMm = document.getElementById('resultMm');
  const resultDiametro = document.getElementById('resultDiametro');
  const resultTubete = document.getElementById('resultTubete');
  const resultEspessura = document.getElementById('resultEspessura');
  const copyFeedback = document.getElementById('copyFeedback');

  let ultimoResultado = null; // guarda os dados do último cálculo válido para reformatação/cópia/histórico

  function exibirResultado(dados) {
    resultEmpty.classList.add('hidden');
    resultContent.classList.remove('hidden');

    resultMetros.textContent = formatNumberBR(dados.metros, precisaoAtual);
    resultMm.textContent = formatNumberBR(dados.mm, precisaoAtual) + ' mm';
    resultDiametro.textContent = formatNumberBR(dados.D, 1) + ' mm';
    resultTubete.textContent = formatNumberBR(dados.d, 1) + ' mm';
    resultEspessura.textContent = dados.eTexto;
  }

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    const entrada = validarFormularioPrincipal();
    if (!entrada) return;

    const calculo = calcularMetragem(entrada.D, entrada.d, entrada.e);

    ultimoResultado = {
      D: entrada.D,
      d: entrada.d,
      e: entrada.e,
      eTexto: entrada.eTexto,
      mm: calculo.mm,
      metros: calculo.metros
    };

    exibirResultado(ultimoResultado);
    desenharDiagrama(entrada.D, entrada.d);
    adicionarAoHistorico(ultimoResultado);
    copyFeedback.textContent = '';

    resultContent.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });

  // Botão "Exemplo": preenche com valores plausíveis e calcula automaticamente
  document.getElementById('btnExemplo').addEventListener('click', function () {
    inputDiametroExterno.value = 145;
    inputDiametroTubete.value = 76;
    marcarChipAtivo('76');
    espessuraSelect.value = '0.10';
    campoEspessuraCustom.classList.add('hidden');
    limparErro(erroDiametroExterno);
    limparErro(erroDiametroTubete);
    limparErro(erroEspessura);
    atualizarDiagramaComCamposAtuais();
    form.requestSubmit();
  });

  // Botão "Limpar": reseta o formulário e o resultado
  document.getElementById('btnLimpar').addEventListener('click', function () {
    form.reset();
    marcarChipAtivo(null);
    campoEspessuraCustom.classList.add('hidden');
    limparErro(erroDiametroExterno);
    limparErro(erroDiametroTubete);
    limparErro(erroEspessura);
    resultEmpty.classList.remove('hidden');
    resultContent.classList.add('hidden');
    ultimoResultado = null;
    copyFeedback.textContent = '';
    desenharDiagrama(null, null);
  });

  // Botão "Copiar Resultado"
  document.getElementById('btnCopiar').addEventListener('click', function () {
    if (!ultimoResultado) return;
    const texto =
      'Metragem aproximada: ' + formatNumberBR(ultimoResultado.metros, precisaoAtual) + ' metros\n' +
      'Comprimento em mm: ' + formatNumberBR(ultimoResultado.mm, precisaoAtual) + ' mm\n' +
      'Diâmetro utilizado: ' + formatNumberBR(ultimoResultado.D, 1) + ' mm\n' +
      'Tubete utilizado: ' + formatNumberBR(ultimoResultado.d, 1) + ' mm\n' +
      'Espessura utilizada: ' + ultimoResultado.eTexto;

    navigator.clipboard.writeText(texto).then(function () {
      copyFeedback.textContent = 'Resultado copiado para a área de transferência.';
      setTimeout(function () { copyFeedback.textContent = ''; }, 3000);
    }).catch(function () {
      copyFeedback.textContent = 'Não foi possível copiar automaticamente. Selecione o texto manualmente.';
    });
  });

  // Botão "Imprimir"
  document.getElementById('btnImprimir').addEventListener('click', function () {
    window.print();
  });

  /* ------------------------------------------------------------------------
     7. HISTÓRICO (localStorage)
     ------------------------------------------------------------------------ */

  const HISTORICO_KEY = 'rolometro_historico';
  const HISTORICO_MAX = 30;

  const corpoTabela = document.getElementById('tabelaHistoricoBody');
  const historicoVazio = document.getElementById('historicoVazio');
  const templateLinha = document.getElementById('templateLinhaHistorico');

  function carregarHistorico() {
    try {
      const dados = localStorage.getItem(HISTORICO_KEY);
      return dados ? JSON.parse(dados) : [];
    } catch (erro) {
      return [];
    }
  }

  function salvarHistorico(lista) {
    localStorage.setItem(HISTORICO_KEY, JSON.stringify(lista));
  }

  function adicionarAoHistorico(dados) {
    const lista = carregarHistorico();
    lista.unshift({
      data: new Date().toLocaleString('pt-BR'),
      diametro: formatNumberBR(dados.D, 1) + ' mm',
      tubete: formatNumberBR(dados.d, 1) + ' mm',
      espessura: dados.eTexto,
      resultado: formatNumberBR(dados.metros, precisaoAtual) + ' m'
    });
    salvarHistorico(lista.slice(0, HISTORICO_MAX));
    renderizarHistorico();
  }

  function renderizarHistorico() {
    const lista = carregarHistorico();
    corpoTabela.innerHTML = '';

    if (lista.length === 0) {
      historicoVazio.classList.remove('hidden');
      return;
    }
    historicoVazio.classList.add('hidden');

    lista.forEach(function (item) {
      const linha = templateLinha.content.cloneNode(true);
      linha.querySelector('[data-col="data"]').textContent = item.data;
      linha.querySelector('[data-col="diametro"]').textContent = item.diametro;
      linha.querySelector('[data-col="tubete"]').textContent = item.tubete;
      linha.querySelector('[data-col="espessura"]').textContent = item.espessura;
      linha.querySelector('[data-col="resultado"]').textContent = item.resultado;
      corpoTabela.appendChild(linha);
    });
  }

  document.getElementById('btnLimparHistorico').addEventListener('click', function () {
    if (!confirm('Tem certeza que deseja apagar todo o histórico de cálculos?')) return;
    localStorage.removeItem(HISTORICO_KEY);
    renderizarHistorico();
  });

  /* ------------------------------------------------------------------------
     8. COMPARADOR DE ROLOS
     ------------------------------------------------------------------------ */

  const compA = {
    D: document.getElementById('compA_D'),
    d: document.getElementById('compA_d'),
    e: document.getElementById('compA_e'),
    resultado: document.getElementById('compA_result')
  };
  const compB = {
    D: document.getElementById('compB_D'),
    d: document.getElementById('compB_d'),
    e: document.getElementById('compB_e'),
    resultado: document.getElementById('compB_result')
  };

  const compareSummary = document.getElementById('compareSummary');
  const compDiffMetros = document.getElementById('compDiffMetros');
  const compDiffPercent = document.getElementById('compDiffPercent');
  const compWinner = document.getElementById('compWinner');

  /**
   * Lê e valida os três campos de um rolo do comparador.
   * @param {{D: HTMLInputElement, d: HTMLInputElement, e: HTMLInputElement}} campos
   * @returns {{D: number, d: number, e: number}|null}
   */
  function lerRoloComparador(campos) {
    const D = parseFlexibleNumber(campos.D.value);
    const d = parseFlexibleNumber(campos.d.value);
    const e = parseFlexibleNumber(campos.e.value);
    if (!isPositiveNumber(D) || !isPositiveNumber(d) || !isPositiveNumber(e) || D <= d) {
      return null;
    }
    return { D: D, d: d, e: e };
  }

  document.getElementById('btnComparar').addEventListener('click', function () {
    const roloA = lerRoloComparador(compA);
    const roloB = lerRoloComparador(compB);

    if (!roloA || !roloB) {
      alert('Preencha corretamente todos os campos dos dois rolos (valores maiores que zero e diâmetro externo maior que o do tubete).');
      return;
    }

    const resultA = calcularMetragem(roloA.D, roloA.d, roloA.e);
    const resultB = calcularMetragem(roloB.D, roloB.d, roloB.e);

    compA.resultado.textContent = formatNumberBR(resultA.metros, precisaoAtual) + ' m';
    compB.resultado.textContent = formatNumberBR(resultB.metros, precisaoAtual) + ' m';

    const diferencaMetros = Math.abs(resultA.metros - resultB.metros);
    const maior = Math.max(resultA.metros, resultB.metros);
    const menor = Math.min(resultA.metros, resultB.metros);
    const diferencaPercentual = menor === 0 ? 0 : (diferencaMetros / menor) * 100;

    compDiffMetros.textContent = formatNumberBR(diferencaMetros, precisaoAtual) + ' m';
    compDiffPercent.textContent = formatNumberBR(diferencaPercentual, 1) + '%';
    compWinner.textContent = resultA.metros === resultB.metros
      ? 'Empate'
      : (resultA.metros > resultB.metros ? 'Rolo A' : 'Rolo B');

    compareSummary.classList.remove('hidden');
  });

  /* ------------------------------------------------------------------------
     9. INICIALIZAÇÃO
     ------------------------------------------------------------------------ */

  document.getElementById('themeToggle').addEventListener('click', toggleTheme);

  function init() {
    initTheme();
    renderizarHistorico();
    desenharDiagrama(null, null); // desenho inicial (placeholder)
  }

  document.addEventListener('DOMContentLoaded', init);
})();
