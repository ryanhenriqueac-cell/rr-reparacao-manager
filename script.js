const STORAGE_KEYS = {
  clientes: "rr_clientes",
  veiculos: "rr_veiculos",
  servicos: "rr_servicos",
  orcamentos: "rr_orcamentos",
  financeiro: "rr_financeiro"
};

const legacyKeys = {
  clientes: "clientes"
};

const VALOR_HORA_PADRAO = 120;
const PIX_CONFIG = {
  chave: "b1b2ecb6-a8f1-41b5-a705-7f5b375b1395",
  nome: "Ryan Henrique Alves Costa",
  cidade: "Belo Horizonte"
};

const formatCurrency = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL"
});

const page = document.body.dataset.page;
let clienteCarrosDraft = [];
let orcamentoPecasDraft = [];
let orcamentoServicosDraft = [];
let ultimoRelatorioFinanceiro = null;

document.addEventListener("DOMContentLoaded", () => {
  migrateLegacyData();
  setActiveMenu();
  bindClearButtons();

  if (page === "dashboard") initDashboard();
  if (page === "clientes") initClientes();
  if (page === "orcamentos") initOrcamentos();
  if (page === "financeiro") initFinanceiro();
  if (page === "orcamento-print") initOrcamentoPrint();
  if (page === "orcamento-publico") initOrcamentoPublico();
  if (page === "financeiro-print") initFinanceiroPrint();
});

function readData(type) {
  return JSON.parse(localStorage.getItem(STORAGE_KEYS[type])) || [];
}

function writeData(type, data) {
  localStorage.setItem(STORAGE_KEYS[type], JSON.stringify(data));
}

function createId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function money(value) {
  return formatCurrency.format(parseDecimal(value));
}

function parseDecimal(value) {
  const text = String(value ?? "").trim();
  if (!text) return 0;
  const normalized = text.includes(",") ? text.replace(/\./g, "").replace(",", ".") : text;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseInteger(value) {
  return Math.max(0, Math.trunc(parseDecimal(value)));
}

function formatDateBR(value) {
  if (!value) return "";
  const [year, month, day] = value.split("-");
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
}

function sanitizePrintTitle(value) {
  return String(value || "")
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function getMonthNameBR(date) {
  const [, month] = String(date || "").split("-");
  const months = [
    "JANEIRO",
    "FEVEREIRO",
    "MARÇO",
    "ABRIL",
    "MAIO",
    "JUNHO",
    "JULHO",
    "AGOSTO",
    "SETEMBRO",
    "OUTUBRO",
    "NOVEMBRO",
    "DEZEMBRO"
  ];
  return months[Number(month) - 1] || "GERAL";
}

function formatPhoneBR(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length === 11) return `(${digits.slice(0, 2)})${digits.slice(2, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `(${digits.slice(0, 2)})${digits.slice(2, 6)}-${digits.slice(6)}`;
  return value || "";
}

function formatPlateBR(value) {
  const text = String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 7);
  if (text.length <= 3) return text;
  return `${text.slice(0, 3)}-${text.slice(3)}`;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function byId(id) {
  return document.getElementById(id);
}

function setValue(id, value) {
  const element = byId(id);
  if (element) element.value = value ?? "";
}

function getValue(id) {
  return byId(id)?.value.trim() || "";
}

function setText(id, value) {
  const element = byId(id);
  if (element) element.textContent = value;
}

function normalizeCarro(carro) {
  return {
    id: carro.id || createId("car"),
    marca: carro.marca || "",
    modelo: carro.modelo || carro.nome || "",
    motor: carro.motor || "",
    ano: carro.ano || "",
    placa: formatPlateBR(carro.placa),
    obs: carro.obs || ""
  };
}

function migrateLegacyData() {
  const clientesAtuais = readData("clientes");
  let precisaSalvar = false;

  if (!clientesAtuais.length && localStorage.getItem(legacyKeys.clientes)) {
    const clientesAntigos = JSON.parse(localStorage.getItem(legacyKeys.clientes)) || [];
    const clientes = clientesAntigos.map((cliente) => ({
      id: createId("cli"),
      nome: cliente.nome || "",
      telefone: cliente.telefone || "",
      email: "",
      documento: "",
      endereco: "",
      obs: cliente.obs || "",
      carros: cliente.veiculo || cliente.placa ? [normalizeCarro({ modelo: cliente.veiculo, placa: cliente.placa })] : []
    }));
    writeData("clientes", clientes);
  }

  const clientesDepois = readData("clientes").map((cliente) => {
    if (Array.isArray(cliente.carros)) return cliente;
    precisaSalvar = true;
    return { ...cliente, carros: [] };
  });

  const veiculosSoltos = readData("veiculos");
  if (veiculosSoltos.length) {
    veiculosSoltos.forEach((veiculo) => {
      const cliente = clientesDepois.find((item) => item.id === veiculo.clienteId);
      if (!cliente) return;
      const jaExiste = cliente.carros.some((carro) => carro.id === veiculo.id || carro.placa === veiculo.placa);
      if (!jaExiste) {
        cliente.carros.push(normalizeCarro({ ...veiculo, id: veiculo.id }));
        precisaSalvar = true;
      }
    });
  }

  if (precisaSalvar) writeData("clientes", clientesDepois);

  const orcamentos = readData("orcamentos");
  let maiorNumero = 0;
  let precisaSalvarOrcamentos = false;
  orcamentos.forEach((orcamento) => {
    if (Number(orcamento.numero) > maiorNumero) maiorNumero = Number(orcamento.numero);
  });
  orcamentos.forEach((orcamento) => {
    if (!orcamento.numero) {
      maiorNumero += 1;
      orcamento.numero = maiorNumero;
      precisaSalvarOrcamentos = true;
    }
  });
  if (precisaSalvarOrcamentos) writeData("orcamentos", orcamentos);
}

function setActiveMenu() {
  document.querySelectorAll("[data-nav]").forEach((link) => {
    link.classList.toggle("active", link.dataset.nav === page);
  });
}

function bindClearButtons() {
  document.querySelectorAll("[data-clear-form]").forEach((button) => {
    button.addEventListener("click", () => {
      const form = byId(button.dataset.clearForm);
      form.reset();
      form.querySelectorAll("input[type='hidden']").forEach((input) => (input.value = ""));
      if (button.dataset.clearForm === "clienteForm") {
        clienteCarrosDraft = [];
        renderClienteCarrosDraft();
      }
      if (button.dataset.clearForm === "orcamentoForm") {
        resetOrcamentoDrafts();
      }
    });
  });
}

function fillSelect(id, items, placeholder, getLabel) {
  const select = byId(id);
  if (!select) return;

  select.innerHTML = `<option value="">${placeholder}</option>`;
  items.forEach((item) => {
    select.innerHTML += `<option value="${item.id}">${escapeHtml(getLabel(item))}</option>`;
  });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getCliente(id) {
  return readData("clientes").find((item) => item.id === id);
}

function getClienteNome(id) {
  return getCliente(id)?.nome || "Cliente não informado";
}

function getCarro(clienteId, carroId) {
  return getCliente(clienteId)?.carros?.find((carro) => carro.id === carroId);
}

function getCarroNome(clienteId, carroId) {
  const carro = getCarro(clienteId, carroId);
  if (!carro) return "Carro não informado";
  return [carro.marca, carro.modelo, carro.motor, carro.ano].filter(Boolean).join(" ") || "Carro sem descrição";
}

function getCarroDetalhes(clienteId, carroId) {
  const carro = getCarro(clienteId, carroId);
  if (!carro) return "Carro não informado";
  return [getCarroNome(clienteId, carroId), carro.placa ? `Placa ${carro.placa}` : ""].filter(Boolean).join(" | ");
}

function getWhatsAppPhone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits.length >= 12 ? digits : "";
}

function onlyAscii(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, "")
    .trim();
}

function pixTlv(id, value) {
  const text = String(value ?? "");
  return `${id}${String(text.length).padStart(2, "0")}${text}`;
}

function pixCrc16(payload) {
  let crc = 0xffff;
  for (let index = 0; index < payload.length; index += 1) {
    crc ^= payload.charCodeAt(index) << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

function buildPixPayload(value, txid = "***") {
  const merchantAccount = pixTlv("00", "br.gov.bcb.pix") + pixTlv("01", PIX_CONFIG.chave);
  const amount = parseDecimal(value).toFixed(2);
  const payloadSemCrc = [
    pixTlv("00", "01"),
    pixTlv("26", merchantAccount),
    pixTlv("52", "0000"),
    pixTlv("53", "986"),
    pixTlv("54", amount),
    pixTlv("58", "BR"),
    pixTlv("59", onlyAscii(PIX_CONFIG.nome).slice(0, 25).toUpperCase()),
    pixTlv("60", onlyAscii(PIX_CONFIG.cidade).slice(0, 15).toUpperCase()),
    pixTlv("62", pixTlv("05", onlyAscii(txid).replace(/\W/g, "").slice(0, 25) || "***")),
    "6304"
  ].join("");
  return `${payloadSemCrc}${pixCrc16(payloadSemCrc)}`;
}

function buildPixPaymentHtml(orcamento, totalFinal) {
  const podeMostrarPix = orcamento.publicCliente ? orcamento.pixEnabled === true : orcamento.status === "Aprovado";
  if (!podeMostrarPix) return "";

  const numero = String(orcamento.numero || "").padStart(4, "0");
  const payload = buildPixPayload(totalFinal, `ORC${numero}`);
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=170x170&margin=8&data=${encodeURIComponent(payload)}`;

  return `
    <aside class="pix-payment">
      <div>
        <span>Pagamento Pix</span>
        <strong>${money(totalFinal)}</strong>
        <small>Escaneie o QR Code ou use o Pix copia e cola.</small>
      </div>
      <img src="${qrUrl}" alt="QR Code Pix para pagamento do orçamento ${numero}">
      <p>${escapeHtml(payload)}</p>
      <small>Chave Pix: ${escapeHtml(PIX_CONFIG.chave)}</small>
    </aside>
  `;
}

function encodePublicPayload(data) {
  const bytes = new TextEncoder().encode(JSON.stringify(data));
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function decodePublicPayload(value) {
  const base64 = String(value || "").replaceAll("-", "+").replaceAll("_", "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

function buildPublicOrcamentoData(orcamento) {
  const cliente = getCliente(orcamento.clienteId) || {};
  const carro = getCarro(orcamento.clienteId, orcamento.carroId || orcamento.veiculoId) || {};
  const pecas = Array.isArray(orcamento.pecas) ? orcamento.pecas : [];
  const servicos = Array.isArray(orcamento.servicos) ? orcamento.servicos : [];

  return {
    c: {
      n: cliente.nome || "",
      t: cliente.telefone || "",
      e: cliente.email || ""
    },
    v: {
      m: carro.marca || "",
      o: carro.modelo || "",
      r: carro.motor || "",
      a: carro.ano || "",
      p: carro.placa || ""
    },
    o: {
      n: orcamento.numero,
      d: orcamento.data,
      st: orcamento.status,
      p: pecas.map((peca) => ({
        n: peca.nome || "",
        q: parseInteger(peca.quantidade),
        v: parseDecimal(peca.valorUnitario)
      })),
      s: servicos.map((servico) => ({
        d: servico.descricao || "",
        h: parseDecimal(servico.horas),
        v: parseDecimal(servico.valorHora)
      })),
      f: parseDecimal(orcamento.valorFinalManual),
      t: getOrcamentoTotal(orcamento),
      pg: orcamento.status === "Aprovado"
    }
  };
}

function normalizePublicOrcamentoData(data) {
  if (data.orcamento) {
    return {
      cliente: data.cliente || {},
      carro: data.carro || {},
      orcamento: data.orcamento || {}
    };
  }

  return {
    cliente: {
      nome: data.c?.n || "",
      telefone: data.c?.t || "",
      email: data.c?.e || ""
    },
    carro: {
      marca: data.v?.m || "",
      modelo: data.v?.o || "",
      motor: data.v?.r || "",
      ano: data.v?.a || "",
      placa: data.v?.p || ""
    },
    orcamento: {
      numero: data.o?.n,
      data: data.o?.d,
      status: data.o?.st,
      pecas: (data.o?.p || []).map((peca) => ({
        nome: peca.n || "",
        quantidade: parseInteger(peca.q),
        valorUnitario: parseDecimal(peca.v)
      })),
      servicos: (data.o?.s || []).map((servico) => ({
        descricao: servico.d || "",
        horas: parseDecimal(servico.h),
        valorHora: parseDecimal(servico.v)
      })),
      valorFinalManual: parseDecimal(data.o?.f),
      total: parseDecimal(data.o?.t),
      pixEnabled: data.o?.pg === true
    }
  };
}

function buildOrcamentoWhatsAppMessage(orcamento, publicUrl) {
  const clienteNome = getClienteNome(orcamento.clienteId);
  const carro = getCarroDetalhes(orcamento.clienteId, orcamento.carroId || orcamento.veiculoId);
  const numero = String(orcamento.numero || "").padStart(4, "0");
  const total = money(getOrcamentoTotal(orcamento));
  const message = [
    `Olá, ${clienteNome}!`,
    "",
    `Segue o pré-orçamento #${numero} da RR Reparação Automotiva:`,
    `Veículo: ${carro}`,
    `Valor total: ${total}`,
    "Parcelado em até 3x NO CARTÃO SEM JUROS",
    "Á vista 3% de DESCONTO",
    "Aguardo 😉👍",
    "Não trabalho com peças fornecidas",
    ""
  ];

  if (publicUrl) {
    message.push("Visualizar orçamento:", publicUrl, "");
  }

  message.push("Qualquer dúvida, fico à disposição.");
  return message.join("\n");
}

function getOrcamentoWhatsAppButton(orcamento) {
  const cliente = getCliente(orcamento.clienteId);
  if (!getWhatsAppPhone(cliente?.telefone)) return `<button class="btn btn-muted" type="button" disabled title="Cadastre um telefone válido no cliente">WhatsApp</button>`;
  return `<button class="btn btn-whatsapp" type="button" onclick="sendOrcamentoWhatsApp('${orcamento.id}')">WhatsApp</button>`;
}

function waitForPublicOrcamentoPublisher(timeout = 6000) {
  if (window.rrPublishPublicOrcamento) return Promise.resolve(window.rrPublishPublicOrcamento);

  return new Promise((resolve) => {
    const startedAt = Date.now();
    const timer = setInterval(() => {
      if (window.rrPublishPublicOrcamento) {
        clearInterval(timer);
        resolve(window.rrPublishPublicOrcamento);
        return;
      }

      if (Date.now() - startedAt >= timeout) {
        clearInterval(timer);
        resolve(null);
      }
    }, 150);
  });
}

function publicOrcamentoErrorMessage(error) {
  const code = error?.code || "";
  if (code.includes("permission-denied")) {
    return "O Firebase bloqueou a criação do link curto. Libere a coleção public_orcamentos nas regras do Firestore.";
  }
  if (code.includes("network") || code.includes("unavailable")) {
    return "Falha de internet ao gerar o link curto. Confira a conexão e tente novamente.";
  }
  return "Não consegui gerar o link curto do orçamento. Tente novamente em alguns segundos.";
}

async function sendOrcamentoWhatsApp(id) {
  const whatsappWindow = window.open("about:blank", "_blank");
  const orcamento = readData("orcamentos").find((item) => item.id === id);
  if (!orcamento) {
    whatsappWindow?.close();
    return;
  }

  const cliente = getCliente(orcamento.clienteId);
  const phone = getWhatsAppPhone(cliente?.telefone);
  if (!phone) {
    whatsappWindow?.close();
    alert("Cadastre um telefone válido no cliente antes de enviar pelo WhatsApp.");
    return;
  }

  let publicUrl = "";
  let publishError = null;
  try {
    const publishPublicOrcamento = await waitForPublicOrcamentoPublisher();
    if (publishPublicOrcamento) {
      const publicId = await publishPublicOrcamento(buildPublicOrcamentoData(orcamento));
      publicUrl = new URL(`orcamento-publico.html?id=${encodeURIComponent(publicId)}`, window.location.href).href;
    }
  } catch (error) {
    console.error("Erro ao publicar link curto do orçamento:", error);
    publishError = error;
  }

  if (!publicUrl) {
    whatsappWindow?.close();
    alert(publicOrcamentoErrorMessage(publishError));
    return;
  }

  const message = buildOrcamentoWhatsAppMessage(orcamento, publicUrl);
  const whatsappUrl = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
  if (whatsappWindow) {
    whatsappWindow.opener = null;
    whatsappWindow.location.href = whatsappUrl;
  } else {
    window.location.href = whatsappUrl;
  }
}

function badgeClass(status) {
  const value = String(status).toLowerCase();
  if (value.includes("aprovado") && !value.includes("não")) return "success";
  if (value.includes("não aprovado") || value.includes("recusado") || value.includes("despesa") || value.includes("custo")) return "danger";
  if (value.includes("receita") || value.includes("concluído") || value.includes("entregue")) return "success";
  return "warning";
}

function emptyRow(colspan, message) {
  return `<tr><td colspan="${colspan}" class="muted">${message}</td></tr>`;
}

function getApprovedOrcamentos() {
  return readData("orcamentos").filter((orcamento) => orcamento.status === "Aprovado");
}

function getPecasCusto(orcamento) {
  const pecas = Array.isArray(orcamento.pecas) ? orcamento.pecas : [];
  return pecas.reduce((sum, peca) => sum + parseInteger(peca.quantidade) * parseDecimal(peca.custoUnitario), 0);
}

function getFinancialSummary() {
  const manual = readData("financeiro");
  const aprovados = getApprovedOrcamentos();
  const receitasManuais = manual.filter((item) => item.tipo === "Receita");
  const despesasManuais = manual.filter((item) => item.tipo === "Despesa");
  const receitasAutomaticas = aprovados.reduce((sum, orcamento) => sum + getOrcamentoTotal(orcamento), 0);
  const receitasExtras = receitasManuais.reduce((sum, item) => sum + Number(item.valor || 0), 0);
  const custoPecas = aprovados.reduce((sum, orcamento) => sum + getPecasCusto(orcamento), 0);
  const despesas = despesasManuais.reduce((sum, item) => sum + Number(item.valor || 0), 0);
  const receitas = receitasAutomaticas + receitasExtras;
  return {
    receitas,
    receitasAutomaticas,
    receitasExtras,
    custoPecas,
    despesas,
    lucro: receitas - custoPecas - despesas
  };
}

function getNextOrcamentoNumber(orcamentos) {
  return orcamentos.reduce((max, orcamento) => Math.max(max, Number(orcamento.numero) || 0), 0) + 1;
}

function initDashboard() {
  const clientes = readData("clientes");
  const orcamentos = readData("orcamentos");
  const totalCarros = clientes.reduce((sum, cliente) => sum + (cliente.carros?.length || 0), 0);
  const aprovados = orcamentos.filter((item) => item.status === "Aprovado").length;
  const naoAprovados = orcamentos.filter((item) => item.status === "Não aprovado").length;
  const decididos = aprovados + naoAprovados;
  const pendentes = orcamentos.filter((item) => item.status === "Pré-orçamento");
  const financeiro = getFinancialSummary();

  setText("totalClientes", clientes.length);
  setText("totalCarros", totalCarros);
  setText("totalPreDashboard", pendentes.length);
  setText("saldoFinanceiro", money(financeiro.lucro));
  setText("orcamentosPre", orcamentos.filter((item) => item.status === "Pré-orçamento").length);
  setText("orcamentosAprovados", aprovados);
  setText("orcamentosNaoAprovados", naoAprovados);
  setText("taxaConversao", decididos ? `${Math.round((aprovados / decididos) * 100)}%` : "0%");

  renderDashboardOrcamentos(pendentes);
}

function renderDashboardOrcamentos(pendentes) {
  const container = byId("dashboardOrcamentos");
  if (!container) return;

  container.innerHTML = pendentes.length
    ? pendentes.map((orcamento) => `
      <div class="timeline-item action-item">
        <strong>${escapeHtml(getClienteNome(orcamento.clienteId))}</strong>
        <span>${escapeHtml(getCarroDetalhes(orcamento.clienteId, orcamento.carroId || orcamento.veiculoId))} | ${money(getOrcamentoTotal(orcamento))}</span>
        <div class="actions">
          <button class="btn btn-primary" type="button" onclick="updateOrcamentoStatus('${orcamento.id}', 'Aprovado')">Aprovar</button>
          <button class="btn btn-danger" type="button" onclick="updateOrcamentoStatus('${orcamento.id}', 'Não aprovado')">Não aprovado</button>
          ${getOrcamentoWhatsAppButton(orcamento)}
          <a class="btn btn-muted" href="orcamentos.html?editar=${orcamento.id}">Editar</a>
          <a class="btn btn-ghost" href="orcamento-imprimir.html?id=${orcamento.id}">Imprimir</a>
        </div>
      </div>
    `).join("")
    : `<div class="empty-state muted">Nenhum pré-orçamento aguardando decisão.</div>`;
}

function updateOrcamentoStatus(id, status) {
  const orcamentos = readData("orcamentos");
  const index = orcamentos.findIndex((orcamento) => orcamento.id === id);
  if (index < 0) return;

  orcamentos[index] = {
    ...orcamentos[index],
    status,
    decidedAt: new Date().toISOString()
  };
  writeData("orcamentos", orcamentos);
  initDashboard();
}

function initClientes() {
  clienteCarrosDraft = [blankCarro()];
  byId("addCarroCliente").addEventListener("click", () => {
    syncClienteCarrosDraft();
    clienteCarrosDraft.push(blankCarro());
    renderClienteCarrosDraft();
  });
  byId("clienteForm").addEventListener("submit", saveCliente);
  byId("clienteTelefone").addEventListener("input", (event) => {
    event.target.value = formatPhoneBR(event.target.value);
  });
  byId("buscaClientes").addEventListener("input", renderClientes);
  renderClienteCarrosDraft();
  renderClientes();
}

function blankCarro() {
  return { id: createId("car"), marca: "", modelo: "", motor: "", ano: "", placa: "", obs: "" };
}

function syncClienteCarrosDraft() {
  clienteCarrosDraft = [...document.querySelectorAll("[data-carro-index]")].map((row) => ({
    id: row.dataset.carroId || createId("car"),
    marca: row.querySelector("[data-field='marca']").value.trim(),
    modelo: row.querySelector("[data-field='modelo']").value.trim(),
    motor: row.querySelector("[data-field='motor']").value.trim(),
    ano: row.querySelector("[data-field='ano']").value.trim(),
    placa: formatPlateBR(row.querySelector("[data-field='placa']").value),
    obs: row.querySelector("[data-field='obs']").value.trim()
  }));
}

function renderClienteCarrosDraft() {
  const container = byId("clienteCarros");
  if (!container) return;

  container.innerHTML = clienteCarrosDraft.map((carro, index) => `
    <div class="nested-item" data-carro-index="${index}" data-carro-id="${escapeHtml(carro.id)}">
      <label>Marca<input data-field="marca" value="${escapeHtml(carro.marca)}" placeholder="Ex: Honda"></label>
      <label>Carro<input data-field="modelo" value="${escapeHtml(carro.modelo)}" placeholder="Ex: Civic"></label>
      <label>Motor<input data-field="motor" value="${escapeHtml(carro.motor)}" placeholder="Ex: 2.0 Flex"></label>
      <label>Ano<input data-field="ano" value="${escapeHtml(carro.ano)}" placeholder="Ex: 2019"></label>
      <label>Placa<input data-field="placa" value="${escapeHtml(formatPlateBR(carro.placa))}" placeholder="ABC-1D23" maxlength="8" oninput="this.value = formatPlateBR(this.value)"></label>
      <label>Observações<input data-field="obs" value="${escapeHtml(carro.obs)}" placeholder="Detalhes do carro"></label>
      <button class="btn btn-danger" type="button" onclick="removeCarroCliente(${index})">Remover</button>
    </div>
  `).join("");
}

function removeCarroCliente(index) {
  syncClienteCarrosDraft();
  clienteCarrosDraft.splice(index, 1);
  if (!clienteCarrosDraft.length) clienteCarrosDraft.push(blankCarro());
  renderClienteCarrosDraft();
}

function saveCliente(event) {
  event.preventDefault();
  syncClienteCarrosDraft();

  const clientes = readData("clientes");
  const id = getValue("clienteId") || createId("cli");
  const cliente = {
    id,
    nome: getValue("clienteNome"),
    telefone: formatPhoneBR(getValue("clienteTelefone")),
    email: getValue("clienteEmail"),
    documento: getValue("clienteDocumento"),
    endereco: getValue("clienteEndereco"),
    obs: getValue("clienteObs"),
    carros: clienteCarrosDraft.filter((carro) => carro.marca || carro.modelo || carro.motor || carro.ano || carro.placa || carro.obs).map(normalizeCarro)
  };

  const index = clientes.findIndex((item) => item.id === id);
  if (index >= 0) clientes[index] = cliente;
  else clientes.push(cliente);

  writeData("clientes", clientes);
  event.target.reset();
  setValue("clienteId", "");
  clienteCarrosDraft = [blankCarro()];
  renderClienteCarrosDraft();
  renderClientes();
}

function renderClientes() {
  const termo = getValue("buscaClientes").toLowerCase();
  const clientes = readData("clientes").filter((cliente) => JSON.stringify(cliente).toLowerCase().includes(termo));
  byId("clientesTabela").innerHTML = clientes.length ? clientes.map((cliente) => {
    const carros = cliente.carros?.length
      ? cliente.carros.map((carro) => `<span class="mini-line">${escapeHtml([carro.marca, carro.modelo, carro.motor, carro.ano].filter(Boolean).join(" "))}</span>`).join("")
      : `<span class="muted">Nenhum carro cadastrado</span>`;

    return `
      <tr>
        <td><strong>${escapeHtml(cliente.nome)}</strong><div class="muted">${escapeHtml(cliente.obs || "")}</div></td>
        <td>${escapeHtml(cliente.telefone)}<div class="muted">${escapeHtml(cliente.email || "")}</div></td>
        <td>${carros}</td>
        <td>${escapeHtml(cliente.endereco || "-")}</td>
        <td class="actions"><button class="btn btn-muted" onclick="editCliente('${cliente.id}')">Editar</button><button class="btn btn-danger" onclick="deleteItem('clientes','${cliente.id}', renderClientes)">Excluir</button></td>
      </tr>`;
  }).join("") : emptyRow(5, "Nenhum cliente encontrado.");
}

function editCliente(id) {
  const cliente = getCliente(id);
  if (!cliente) return;
  setValue("clienteId", cliente.id);
  setValue("clienteNome", cliente.nome);
  setValue("clienteTelefone", cliente.telefone);
  setValue("clienteEmail", cliente.email);
  setValue("clienteDocumento", cliente.documento);
  setValue("clienteEndereco", cliente.endereco);
  setValue("clienteObs", cliente.obs);
  clienteCarrosDraft = cliente.carros?.length ? cliente.carros.map(normalizeCarro) : [blankCarro()];
  renderClienteCarrosDraft();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function initOrcamentos() {
  hydrateClienteCarroSelects("orcamentoCliente", "orcamentoCarro");
  setValue("orcamentoData", today());
  resetOrcamentoDrafts();
  byId("orcamentoCliente").addEventListener("change", () => hydrateClienteCarroSelects("orcamentoCliente", "orcamentoCarro"));
  byId("addPeca").addEventListener("click", () => {
    syncOrcamentoDrafts();
    orcamentoPecasDraft.push(blankPeca());
    renderOrcamentoDrafts();
  });
  byId("addServicoOrcamento").addEventListener("click", () => {
    syncOrcamentoDrafts();
    orcamentoServicosDraft.push(blankServicoOrcamento());
    renderOrcamentoDrafts();
  });
  byId("orcamentoForm").addEventListener("input", updateOrcamentoPreview);
  byId("orcamentoForm").addEventListener("submit", saveOrcamento);
  byId("buscaOrcamentos").addEventListener("input", renderOrcamentos);
  renderOrcamentos();

  const editarId = new URLSearchParams(window.location.search).get("editar");
  if (editarId) editOrcamento(editarId);
}

function resetOrcamentoDrafts() {
  orcamentoPecasDraft = [blankPeca()];
  orcamentoServicosDraft = [blankServicoOrcamento()];
  renderOrcamentoDrafts();
}

function blankPeca() {
  return { id: createId("pec"), nome: "", quantidade: 1, custoUnitario: 0, valorUnitario: 0 };
}

function blankServicoOrcamento() {
  return { id: createId("mao"), descricao: "", horas: 1, valorHora: VALOR_HORA_PADRAO };
}

function zeroInputClass(value) {
  return parseDecimal(value) === 0 ? " zero-value" : "";
}

function moneyDraftInput(field, value) {
  const numericValue = parseDecimal(value);
  return `<input class="money-draft-input${zeroInputClass(numericValue)}" data-field="${field}" type="number" min="0" step="0.01" value="${numericValue}" onfocus="clearZeroInput(this)" onblur="restoreZeroInput(this)" oninput="markZeroInput(this)">`;
}

function clearZeroInput(input) {
  if (parseDecimal(input.value) !== 0) return;
  input.value = "";
  input.classList.remove("zero-value");
}

function restoreZeroInput(input) {
  if (String(input.value).trim()) {
    markZeroInput(input);
    return;
  }
  input.value = "0";
  input.classList.add("zero-value");
}

function markZeroInput(input) {
  input.classList.toggle("zero-value", parseDecimal(input.value) === 0);
}

function syncOrcamentoDrafts() {
  orcamentoPecasDraft = [...document.querySelectorAll("[data-peca-index]")].map((row) => ({
    id: row.dataset.pecaId || createId("pec"),
    nome: row.querySelector("[data-field='nome']").value.trim(),
    quantidade: parseInteger(row.querySelector("[data-field='quantidade']").value),
    custoUnitario: parseDecimal(row.querySelector("[data-field='custoUnitario']").value),
    valorUnitario: parseDecimal(row.querySelector("[data-field='valorUnitario']").value)
  }));

  orcamentoServicosDraft = [...document.querySelectorAll("[data-servico-orcamento-index]")].map((row) => ({
    id: row.dataset.servicoId || createId("mao"),
    descricao: row.querySelector("[data-field='descricao']").value.trim(),
    horas: parseDecimal(row.querySelector("[data-field='horas']").value),
    valorHora: parseDecimal(row.querySelector("[data-field='valorHora']").value) || VALOR_HORA_PADRAO
  }));
}

function renderOrcamentoDrafts() {
  const pecasContainer = byId("orcamentoPecasLista");
  const servicosContainer = byId("orcamentoServicosLista");
  if (!pecasContainer || !servicosContainer) return;

  pecasContainer.innerHTML = orcamentoPecasDraft.map((peca, index) => `
    <div class="nested-item peca-item" data-peca-index="${index}" data-peca-id="${escapeHtml(peca.id)}">
      <label>Peça<input data-field="nome" value="${escapeHtml(peca.nome)}" placeholder="Ex: Pastilha de freio"></label>
      <label>Qtd<input data-field="quantidade" type="number" min="0" step="1" value="${parseInteger(peca.quantidade)}"></label>
      <label>Custo unitário${moneyDraftInput("custoUnitario", peca.custoUnitario)}</label>
      <label>Venda unitária${moneyDraftInput("valorUnitario", peca.valorUnitario)}</label>
      <strong class="line-total">${money(parseInteger(peca.quantidade) * parseDecimal(peca.valorUnitario))}</strong>
      <button class="btn btn-danger" type="button" onclick="removePeca(${index})">Remover</button>
    </div>
  `).join("");

  servicosContainer.innerHTML = orcamentoServicosDraft.map((servico, index) => `
    <div class="nested-item servico-orcamento-item" data-servico-orcamento-index="${index}" data-servico-id="${escapeHtml(servico.id)}">
      <label>Serviço<input data-field="descricao" value="${escapeHtml(servico.descricao)}" placeholder="Ex: Revisão de freios"></label>
      <label>Horas<input data-field="horas" type="number" min="0" step="0.01" value="${parseDecimal(servico.horas)}"></label>
      <label>Valor/hora<input data-field="valorHora" type="number" min="0" step="0.01" value="${servico.valorHora}"></label>
      <strong class="line-total">${money(parseDecimal(servico.horas) * parseDecimal(servico.valorHora))}</strong>
      <button class="btn btn-danger" type="button" onclick="removeServicoOrcamento(${index})">Remover</button>
    </div>
  `).join("");

  updateOrcamentoPreview();
}

function removePeca(index) {
  syncOrcamentoDrafts();
  orcamentoPecasDraft.splice(index, 1);
  if (!orcamentoPecasDraft.length) orcamentoPecasDraft.push(blankPeca());
  renderOrcamentoDrafts();
}

function removeServicoOrcamento(index) {
  syncOrcamentoDrafts();
  orcamentoServicosDraft.splice(index, 1);
  if (!orcamentoServicosDraft.length) orcamentoServicosDraft.push(blankServicoOrcamento());
  renderOrcamentoDrafts();
}

function calculateOrcamentoTotals(pecas = orcamentoPecasDraft, servicos = orcamentoServicosDraft) {
  const totalPecas = pecas.reduce((sum, peca) => sum + parseInteger(peca.quantidade) * parseDecimal(peca.valorUnitario), 0);
  const totalCustoPecas = pecas.reduce((sum, peca) => sum + parseInteger(peca.quantidade) * parseDecimal(peca.custoUnitario), 0);
  const totalServicos = servicos.reduce((sum, servico) => sum + parseDecimal(servico.horas) * parseDecimal(servico.valorHora), 0);
  const total = totalPecas + totalServicos;
  return { totalPecas, totalCustoPecas, totalServicos, total, lucroEstimado: total - totalCustoPecas };
}

function updateOrcamentoPreview() {
  syncOrcamentoDrafts();
  const totals = calculateOrcamentoTotals();
  const valorFinal = parseDecimal(getValue("orcamentoValorFinal"));
  const totalFinal = valorFinal > 0 ? valorFinal : totals.total;
  setText("totalPecasPreview", money(totals.totalPecas));
  setText("totalCustoPecasPreview", money(totals.totalCustoPecas));
  setText("totalServicosPreview", money(totals.totalServicos));
  setText("totalOrcamentoPreview", money(totalFinal));
  setText("lucroOrcamentoPreview", money(totalFinal - totals.totalCustoPecas));
  document.querySelectorAll("[data-peca-index]").forEach((row, index) => {
    row.querySelector(".line-total").textContent = money(parseInteger(orcamentoPecasDraft[index].quantidade) * parseDecimal(orcamentoPecasDraft[index].valorUnitario));
  });
  document.querySelectorAll("[data-servico-orcamento-index]").forEach((row, index) => {
    row.querySelector(".line-total").textContent = money(parseDecimal(orcamentoServicosDraft[index].horas) * parseDecimal(orcamentoServicosDraft[index].valorHora));
  });
}

function saveOrcamento(event) {
  event.preventDefault();
  syncOrcamentoDrafts();
  const pecas = orcamentoPecasDraft.filter((peca) => peca.nome || peca.quantidade || peca.custoUnitario || peca.valorUnitario);
  const servicos = orcamentoServicosDraft.filter((servico) => servico.descricao || servico.horas || servico.valorHora);
  const totals = calculateOrcamentoTotals(pecas, servicos);
  const orcamentos = readData("orcamentos");
  const id = getValue("orcamentoId") || createId("orc");
  const existente = orcamentos.find((item) => item.id === id);
  const valorFinalManual = parseDecimal(getValue("orcamentoValorFinal"));
  const totalFinal = valorFinalManual > 0 ? valorFinalManual : totals.total;
  const status = existente?.status === "Aprovado" ? "Pré-orçamento" : existente?.status || "Pré-orçamento";
  const orcamento = {
    id,
    numero: existente?.numero || getNextOrcamentoNumber(orcamentos),
    clienteId: getValue("orcamentoCliente"),
    carroId: getValue("orcamentoCarro"),
    data: getValue("orcamentoData"),
    status,
    pecas,
    servicos,
    totalPecas: totals.totalPecas,
    totalCustoPecas: totals.totalCustoPecas,
    totalServicos: totals.totalServicos,
    totalCalculado: totals.total,
    valorFinalManual,
    total: totalFinal,
    lucroEstimado: totalFinal - totals.totalCustoPecas
  };
  if (existente?.status && existente.status !== "Aprovado") orcamento.decidedAt = existente.decidedAt;
  const index = orcamentos.findIndex((item) => item.id === id);
  if (index >= 0) orcamentos[index] = orcamento;
  else orcamentos.push(orcamento);
  writeData("orcamentos", orcamentos);
  event.target.reset();
  setValue("orcamentoId", "");
  setValue("orcamentoData", today());
  hydrateClienteCarroSelects("orcamentoCliente", "orcamentoCarro");
  resetOrcamentoDrafts();
  renderOrcamentos();
}

function renderOrcamentos() {
  const termo = getValue("buscaOrcamentos").toLowerCase();
  const orcamentos = readData("orcamentos").filter((orcamento) => `${JSON.stringify(orcamento)} ${getClienteNome(orcamento.clienteId)} ${getCarroNome(orcamento.clienteId, orcamento.carroId || orcamento.veiculoId)}`.toLowerCase().includes(termo));
  byId("orcamentosTabela").innerHTML = orcamentos.length ? orcamentos.map((orcamento) => `
    <tr>
      <td><strong>${String(orcamento.numero || "").padStart(4, "0")}</strong></td>
      <td>${escapeHtml(getClienteNome(orcamento.clienteId))}</td>
      <td>${escapeHtml(getCarroDetalhes(orcamento.clienteId, orcamento.carroId || orcamento.veiculoId))}</td>
      <td><span class="badge ${badgeClass(orcamento.status)}">${escapeHtml(orcamento.status)}</span></td>
      <td>${money(getOrcamentoTotal(orcamento))}</td>
      <td>${escapeHtml(formatDateBR(orcamento.data) || "-")}</td>
      <td class="actions">
        <button class="btn btn-muted" onclick="editOrcamento('${orcamento.id}')">Editar</button>
        <a class="btn btn-ghost" href="orcamento-imprimir.html?id=${orcamento.id}">Imprimir</a>
        <button class="btn btn-danger" onclick="deleteItem('orcamentos','${orcamento.id}', renderOrcamentos)">Excluir</button>
      </td>
    </tr>`).join("") : emptyRow(7, "Nenhum orçamento encontrado.");
}

function getOrcamentoTotal(orcamento) {
  if (orcamento.total !== undefined) return Number(orcamento.total) || 0;
  return (Number(orcamento.pecas) || 0) + (Number(orcamento.maoObra) || 0);
}

function editOrcamento(id) {
  const orcamento = readData("orcamentos").find((item) => item.id === id);
  if (!orcamento) return;
  setValue("orcamentoId", orcamento.id);
  setValue("orcamentoCliente", orcamento.clienteId);
  hydrateClienteCarroSelects("orcamentoCliente", "orcamentoCarro", orcamento.carroId || orcamento.veiculoId);
  setValue("orcamentoData", orcamento.data);
  setValue("orcamentoValorFinal", orcamento.valorFinalManual || "");
  orcamentoPecasDraft = Array.isArray(orcamento.pecas) ? orcamento.pecas.map((peca) => ({ custoUnitario: 0, ...peca })) : [{ ...blankPeca(), nome: "Peças", quantidade: 1, valorUnitario: Number(orcamento.pecas) || 0 }];
  orcamentoServicosDraft = Array.isArray(orcamento.servicos) ? orcamento.servicos : [{ ...blankServicoOrcamento(), descricao: "Mão de obra", horas: 1, valorHora: Number(orcamento.maoObra) || VALOR_HORA_PADRAO }];
  renderOrcamentoDrafts();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function printOrcamento(id) {
  window.location.href = `orcamento-imprimir.html?id=${encodeURIComponent(id)}`;
}

function initOrcamentoPrint() {
  const id = new URLSearchParams(window.location.search).get("id");
  const orcamento = readData("orcamentos").find((item) => item.id === id);
  const root = byId("printRoot");
  const printButton = byId("printButton");

  if (printButton) {
    const clienteNome = sanitizePrintTitle(getClienteNome(orcamento?.clienteId)).toUpperCase();
    const title = sanitizePrintTitle(`RR - Orçamento do Serviço Automotivo ${clienteNome}`);
    printButton.addEventListener("click", () => printDocument(title));
  }

  if (!orcamento) {
    root.innerHTML = `<section class="print-document"><h1>Orçamento não encontrado</h1><p>Volte para a lista e tente novamente.</p></section>`;
    return;
  }

  root.innerHTML = buildOrcamentoPrintHtml(orcamento);
}

function initOrcamentoPublico() {
  const root = byId("printRoot");
  const dataParam = new URLSearchParams(window.location.hash.slice(1)).get("d");
  const publicId = new URLSearchParams(window.location.search).get("id");

  window.renderPublicOrcamentoData = renderPublicOrcamentoData;
  window.showPublicOrcamentoError = showPublicOrcamentoError;

  if (dataParam) {
    try {
      renderPublicOrcamentoData(decodePublicPayload(dataParam));
    } catch (error) {
      showPublicOrcamentoError("Confira se o link recebido está completo.");
    }
    return;
  }

  if (publicId) {
    root.innerHTML = `<section class="print-document"><h1>Carregando orçamento...</h1><p>Aguarde um instante.</p></section>`;
    if (window.rrPendingPublicOrcamentoData) renderPublicOrcamentoData(window.rrPendingPublicOrcamentoData);
    window.addEventListener("rr-public-orcamento-loaded", (event) => renderPublicOrcamentoData(event.detail), { once: true });
    return;
  }

  showPublicOrcamentoError("Confira se o link recebido está completo.");
}

function renderPublicOrcamentoData(rawData) {
  const root = byId("printRoot");
  const printButton = byId("printButton");
  try {
    const data = normalizePublicOrcamentoData(rawData);
    const orcamento = {
      ...data.orcamento,
      publicCliente: data.cliente,
      publicCarro: data.carro
    };
    const clienteNome = sanitizePrintTitle(data.cliente?.nome).toUpperCase();
    const title = sanitizePrintTitle(`RR - Orçamento do Serviço Automotivo ${clienteNome}`);
    printButton?.addEventListener("click", () => printDocument(title));
    root.innerHTML = buildOrcamentoPrintHtml(orcamento);
  } catch (error) {
    showPublicOrcamentoError("Confira se o link recebido está completo.");
  }
}

function showPublicOrcamentoError(message) {
  const root = byId("printRoot");
  root.innerHTML = `<section class="print-document"><h1>Orçamento indisponível</h1><p>${escapeHtml(message)}</p></section>`;
}

function buildOrcamentoPrintHtml(orcamento) {
  const cliente = orcamento.publicCliente || getCliente(orcamento.clienteId);
  const carro = orcamento.publicCarro || getCarro(orcamento.clienteId, orcamento.carroId || orcamento.veiculoId);
  const pecas = Array.isArray(orcamento.pecas) ? orcamento.pecas : [];
  const servicos = Array.isArray(orcamento.servicos) ? orcamento.servicos : [];
  const totals = calculateOrcamentoTotals(pecas, servicos);
  const totalFinal = getOrcamentoTotal(orcamento);
  const logoUrl = new URL("assets/logo-rr.png", window.location.href).href;

  return `
    <article class="print-document">
      <header class="print-header">
        <img src="${logoUrl}" alt="RR Reparação Automotiva">
        <div>
          <h1>RR Reparação Automotiva</h1>
          <p>Manutenção especializada | Paixão por carros</p>
          <p>Status: <strong>${escapeHtml(orcamento.status)}</strong></p>
        </div>
      </header>

      <h2>Orçamento de Serviço Automotivo</h2>

      <section class="print-info-grid">
        <div><strong>Cliente</strong>${escapeHtml(cliente?.nome || "")}<br>${escapeHtml(formatPhoneBR(cliente?.telefone))}<br>${escapeHtml(cliente?.email || "")}</div>
        <div><strong>Carro</strong>${escapeHtml([carro?.marca, carro?.modelo, carro?.motor, carro?.ano].filter(Boolean).join(" "))}<br>${escapeHtml(carro?.placa ? `Placa: ${carro.placa}` : "")}</div>
        <div><strong>Data</strong>${escapeHtml(formatDateBR(orcamento.data))}</div>
        <div><strong>Número do orçamento</strong>${String(orcamento.numero || "").padStart(4, "0")}</div>
      </section>

      <section>
        <h3>Peças</h3>
        <table class="print-table">
          <thead><tr><th>Item</th><th>Qtd</th><th>Valor unit.</th><th>Total</th></tr></thead>
          <tbody>${pecas.map((peca) => `<tr><td>${escapeHtml(peca.nome)}</td><td class="right">${parseInteger(peca.quantidade)}</td><td class="right">${money(peca.valorUnitario)}</td><td class="right">${money(parseInteger(peca.quantidade) * parseDecimal(peca.valorUnitario))}</td></tr>`).join("") || `<tr><td colspan="4">Sem peças informadas.</td></tr>`}</tbody>
        </table>
      </section>

      <section>
        <h3>Serviços</h3>
        <table class="print-table">
          <thead><tr><th>Serviço</th><th>Horas</th><th>Valor/hora</th><th>Total</th></tr></thead>
          <tbody>${servicos.map((servico) => `<tr><td>${escapeHtml(servico.descricao)}</td><td class="right">${parseDecimal(servico.horas)}</td><td class="right">${money(servico.valorHora)}</td><td class="right">${money(parseDecimal(servico.horas) * parseDecimal(servico.valorHora))}</td></tr>`).join("") || `<tr><td colspan="4">Sem serviços informados.</td></tr>`}</tbody>
        </table>
      </section>

      <h3 class="print-payment-title">Resumo e pagamento</h3>
      <section class="print-payment-row">
        <div class="print-totals">
        <div><span>Total peças</span><strong>${money(totals.totalPecas)}</strong></div>
        <div><span>Total serviços</span><strong>${money(totals.totalServicos)}</strong></div>
        ${orcamento.valorFinalManual ? `<div><span>Total calculado</span><strong>${money(totals.total)}</strong></div>` : ""}
        <div><span>Total geral</span><strong>${money(totalFinal)}</strong></div>
        </div>
        ${buildPixPaymentHtml(orcamento, totalFinal)}
      </section>

      <footer class="print-footer">Orçamento sujeito à aprovação. Valores podem mudar após desmontagem ou diagnóstico complementar.</footer>
    </article>
  `;
}

function initFinanceiro() {
  setValue("financeiroData", today());
  setDefaultReportDates();
  byId("financeiroForm").addEventListener("submit", saveFinanceiro);
  byId("buscaFinanceiro").addEventListener("input", renderFinanceiro);
  byId("financeiroRelatorioForm").addEventListener("submit", (event) => {
    event.preventDefault();
    renderFinanceiroRelatorio();
  });
  byId("limparRelatorio").addEventListener("click", () => {
    setValue("relatorioInicio", "");
    setValue("relatorioFim", "");
    renderFinanceiroRelatorio();
  });
  byId("imprimirRelatorioFinanceiro").addEventListener("click", imprimirRelatorioFinanceiro);
  renderFinanceiro();
  renderFinanceiroRelatorio();
}

function saveFinanceiro(event) {
  event.preventDefault();
  const financeiro = readData("financeiro");
  const id = getValue("financeiroId") || createId("fin");
  const tipo = document.querySelector("input[name='financeiroTipo']:checked")?.value || "Despesa";
  const lancamento = {
    id,
    tipo,
    data: getValue("financeiroData"),
    descricao: getValue("financeiroDescricao"),
    categoria: getValue("financeiroCategoria"),
    valor: Number(getValue("financeiroValor")) || 0
  };
  const index = financeiro.findIndex((item) => item.id === id);
  if (index >= 0) financeiro[index] = lancamento;
  else financeiro.push(lancamento);
  writeData("financeiro", financeiro);
  event.target.reset();
  setValue("financeiroId", "");
  setValue("financeiroData", today());
  byId("financeiroTipoDespesa").checked = true;
  renderFinanceiro();
  renderFinanceiroRelatorio();
}

function renderFinanceiro() {
  const termo = getValue("buscaFinanceiro").toLowerCase();
  const resumo = getFinancialSummary();
  const financeiro = getFinanceiroLancamentos()
    .filter((item) => JSON.stringify(item).toLowerCase().includes(termo));

  setText("totalReceitas", money(resumo.receitas));
  setText("totalCustoPecas", money(resumo.custoPecas));
  setText("totalDespesas", money(resumo.despesas));
  setText("saldoFinanceiroPagina", money(resumo.lucro));

  byId("financeiroTabela").innerHTML = financeiro.length ? financeiro.map((item) => `
    <tr>
      <td><strong>${escapeHtml(item.descricao)}</strong></td>
      <td><span class="badge ${badgeClass(item.tipo)}">${escapeHtml(item.tipo)}</span></td>
      <td>${escapeHtml(item.categoria || "-")}</td>
      <td>${escapeHtml(formatDateBR(item.data) || "-")}</td>
      <td>${money(item.valor)}</td>
      <td class="actions">${item.automatico ? `<span class="muted">Automático</span>` : `<button class="btn btn-muted" onclick="editFinanceiro('${item.id}')">Editar</button><button class="btn btn-danger" onclick="deleteItem('financeiro','${item.id}', refreshFinanceiro)">Excluir</button>`}</td>
    </tr>`).join("") : emptyRow(6, "Nenhum lançamento encontrado.");
}

function getFinanceiroLancamentos() {
  const manuais = readData("financeiro");
  const aprovados = getApprovedOrcamentos();
  const receitasAutomaticas = aprovados.map((orcamento) => ({
    id: `receita_${orcamento.id}`,
    tipo: "Receita automática",
    data: orcamento.decidedAt?.slice(0, 10) || orcamento.data || "",
    descricao: `Orçamento aprovado - ${getClienteNome(orcamento.clienteId)}`,
    categoria: getCarroDetalhes(orcamento.clienteId, orcamento.carroId || orcamento.veiculoId),
    valor: getOrcamentoTotal(orcamento),
    automatico: true
  }));
  const custosAutomaticos = aprovados
    .map((orcamento) => ({
      id: `custo_${orcamento.id}`,
      tipo: "Custo de peças",
      data: orcamento.decidedAt?.slice(0, 10) || orcamento.data || "",
      descricao: `Custo de peças - ${getClienteNome(orcamento.clienteId)}`,
      categoria: getCarroDetalhes(orcamento.clienteId, orcamento.carroId || orcamento.veiculoId),
      valor: getPecasCusto(orcamento),
      automatico: true
    }))
    .filter((item) => item.valor > 0);

  return [...receitasAutomaticas, ...custosAutomaticos, ...manuais]
    .sort((a, b) => String(b.data || "").localeCompare(String(a.data || "")));
}

function setDefaultReportDates() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const lastDay = new Date(year, now.getMonth() + 1, 0).getDate();
  setValue("relatorioInicio", `${year}-${month}-01`);
  setValue("relatorioFim", `${year}-${month}-${String(lastDay).padStart(2, "0")}`);
}

function isDateInRange(date, start, end) {
  if (!date) return false;
  if (start && date < start) return false;
  if (end && date > end) return false;
  return true;
}

function getMonthLabel(date) {
  if (!date) return "Sem data";
  const [year, month] = date.split("-");
  if (!year || !month) return "Sem data";
  return `${month}/${year}`;
}

function getLancamentoImpacto(item) {
  if (item.tipo.includes("Receita")) return { receitas: Number(item.valor) || 0, custos: 0, despesas: 0 };
  if (item.tipo.includes("Custo")) return { receitas: 0, custos: Number(item.valor) || 0, despesas: 0 };
  return { receitas: 0, custos: 0, despesas: Number(item.valor) || 0 };
}

function getFinanceiroRelatorioData(startOverride = null, endOverride = null) {
  const start = startOverride ?? getValue("relatorioInicio");
  const end = endOverride ?? getValue("relatorioFim");
  const lancamentos = getFinanceiroLancamentos().filter((item) => isDateInRange(item.data, start, end));
  const resumo = lancamentos.reduce((acc, item) => {
    const impacto = getLancamentoImpacto(item);
    acc.receitas += impacto.receitas;
    acc.custos += impacto.custos;
    acc.despesas += impacto.despesas;
    return acc;
  }, { receitas: 0, custos: 0, despesas: 0 });
  resumo.lucro = resumo.receitas - resumo.custos - resumo.despesas;

  const meses = {};
  lancamentos.forEach((item) => {
    const key = item.data ? item.data.slice(0, 7) : "sem-data";
    const impacto = getLancamentoImpacto(item);
    meses[key] ||= { label: getMonthLabel(item.data), receitas: 0, custos: 0, despesas: 0 };
    meses[key].receitas += impacto.receitas;
    meses[key].custos += impacto.custos;
    meses[key].despesas += impacto.despesas;
  });

  const mesesLista = Object.entries(meses)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, valores]) => ({
      ...valores,
      lucro: valores.receitas - valores.custos - valores.despesas
    }));

  return { start, end, lancamentos, resumo, meses: mesesLista };
}

function renderFinanceiroRelatorio() {
  const relatorio = getFinanceiroRelatorioData();
  ultimoRelatorioFinanceiro = relatorio;
  const { start, end, lancamentos, resumo, meses } = relatorio;
  const periodo = start || end
    ? `${formatDateBR(start) || "Início"} até ${formatDateBR(end) || "hoje"}`
    : "Todo o histórico financeiro";

  setText("financeiroRelatorioStatus", `${periodo} | ${lancamentos.length} lançamento(s) analisado(s)`);

  byId("financeiroRelatorioResumo").innerHTML = `
    <article class="mini-stat"><span>Receitas</span><strong>${money(resumo.receitas)}</strong></article>
    <article class="mini-stat"><span>Custos</span><strong>${money(resumo.custos)}</strong></article>
    <article class="mini-stat"><span>Despesas</span><strong>${money(resumo.despesas)}</strong></article>
    <article class="mini-stat highlight"><span>Lucro</span><strong>${money(resumo.lucro)}</strong></article>
  `;

  byId("financeiroRelatorioMeses").innerHTML = meses.map((valores) => `
    <tr>
      <td><strong>${escapeHtml(valores.label)}</strong></td>
      <td>${money(valores.receitas)}</td>
      <td>${money(valores.custos)}</td>
      <td>${money(valores.despesas)}</td>
      <td>${money(valores.lucro)}</td>
    </tr>
  `).join("") || emptyRow(5, "Nenhum lançamento neste período.");

  renderFinanceiroGraficos(relatorio);
}

function renderFinanceiroGraficos(relatorio) {
  const { resumo, meses } = relatorio;
  const valoresDonut = [
    { label: "Receitas", valor: resumo.receitas, color: "#4fd1a1" },
    { label: "Custos", valor: resumo.custos, color: "#f1c75b" },
    { label: "Despesas", valor: resumo.despesas, color: "#ef6262" }
  ];
  const totalDonut = valoresDonut.reduce((sum, item) => sum + Math.max(item.valor, 0), 0);
  let acumulado = 0;
  const segmentos = valoresDonut.map((item) => {
    const inicio = totalDonut ? (acumulado / totalDonut) * 360 : 0;
    acumulado += Math.max(item.valor, 0);
    const fim = totalDonut ? (acumulado / totalDonut) * 360 : 0;
    return `${item.color} ${inicio}deg ${fim}deg`;
  }).join(", ");

  byId("financeiroDonut").style.background = totalDonut
    ? `conic-gradient(${segmentos})`
    : "conic-gradient(rgba(255,255,255,0.12) 0deg 360deg)";
  byId("financeiroDonut").innerHTML = `<span>${money(resumo.lucro)}<small>Lucro líquido</small></span>`;
  byId("financeiroLegenda").innerHTML = valoresDonut.map((item) => `
    <div>
      <i style="background:${item.color}"></i>
      <span>${item.label}</span>
      <strong>${money(item.valor)}</strong>
    </div>
  `).join("");

  const series = [
    { key: "receitas", label: "Receitas", colorClass: "income" },
    { key: "custos", label: "Custos", colorClass: "cost" },
    { key: "despesas", label: "Despesas", colorClass: "expense" },
    { key: "lucro", label: "Lucro", colorClass: "profit" }
  ];
  const maiorValor = Math.max(
    ...meses.flatMap((mes) => series.map((serie) => Math.abs(mes[serie.key]) || 0)),
    1
  );

  byId("financeiroBarras").innerHTML = meses.length ? `
    <div class="bar-legend">
      ${series.map((serie) => `<span><i class="${serie.colorClass}"></i>${serie.label}</span>`).join("")}
    </div>
    <div class="monthly-bars">
      ${meses.map((mes) => {
        const bars = series.map((serie) => {
          const value = Number(mes[serie.key]) || 0;
          const altura = value === 0 ? 4 : Math.max(12, Math.round((Math.abs(value) / maiorValor) * 150));
          const negative = value < 0 ? " negative" : "";
          return `<span class="${serie.colorClass}${negative}" style="height:${altura}px" title="${serie.label}: ${money(value)}"></span>`;
        }).join("");
        return `
          <div class="month-group">
            <div class="month-bars">${bars}</div>
            <strong>${escapeHtml(mes.label)}</strong>
            <small>${money(mes.lucro)}</small>
          </div>
        `;
      }).join("")}
    </div>
  ` : `<div class="chart-empty">Sem dados para gráfico neste período.</div>`;
}

function imprimirRelatorioFinanceiro() {
  const params = new URLSearchParams();
  const start = getValue("relatorioInicio");
  const end = getValue("relatorioFim");
  if (start) params.set("inicio", start);
  if (end) params.set("fim", end);
  window.location.href = `relatorio-financeiro.html${params.toString() ? `?${params}` : ""}`;
}

function printDocument(title) {
  const originalTitle = document.title;
  document.title = sanitizePrintTitle(title) || originalTitle;
  const restoreTitle = () => {
    document.title = originalTitle;
    window.removeEventListener("afterprint", restoreTitle);
  };
  window.addEventListener("afterprint", restoreTitle);
  window.print();
  setTimeout(restoreTitle, 30000);
}

function initFinanceiroPrint() {
  const root = byId("printRoot");
  const printButton = byId("printButton");
  const params = new URLSearchParams(window.location.search);
  const start = params.get("inicio") || "";
  const end = params.get("fim") || "";
  const relatorio = getFinanceiroRelatorioData(start, end);

  if (printButton) {
    const title = sanitizePrintTitle(`RR - Relatório financeiro mês ${getMonthNameBR(start || end)}`);
    printButton.addEventListener("click", () => printDocument(title));
  }
  root.innerHTML = buildFinanceiroReportHtml(relatorio);
}

function buildFinanceiroReportHtml(relatorio) {
  const { start, end, resumo, meses, lancamentos } = relatorio;
  const periodo = start || end
    ? `${formatDateBR(start) || "Início"} até ${formatDateBR(end) || "hoje"}`
    : "Todo o histórico financeiro";
  const logoUrl = "assets/logo-rr.png";
  const valoresDonut = [
    { label: "Receitas", valor: resumo.receitas, color: "#4fd1a1" },
    { label: "Custos", valor: resumo.custos, color: "#f1c75b" },
    { label: "Despesas", valor: resumo.despesas, color: "#ef6262" }
  ];
  const totalDonut = valoresDonut.reduce((sum, item) => sum + Math.max(item.valor, 0), 0);
  let acumulado = 0;
  const segmentos = valoresDonut.map((item) => {
    const inicio = totalDonut ? (acumulado / totalDonut) * 360 : 0;
    acumulado += Math.max(item.valor, 0);
    const fim = totalDonut ? (acumulado / totalDonut) * 360 : 0;
    return `${item.color} ${inicio}deg ${fim}deg`;
  }).join(", ");
  const series = [
    { key: "receitas", label: "Receitas", className: "income" },
    { key: "custos", label: "Custos", className: "cost" },
    { key: "despesas", label: "Despesas", className: "expense" },
    { key: "lucro", label: "Lucro", className: "profit" }
  ];
  const maiorValor = Math.max(
    ...meses.flatMap((mes) => series.map((serie) => Math.abs(mes[serie.key]) || 0)),
    1
  );

  return `
    <article class="finance-report-document">
      <header class="print-header report-print-header">
        <img src="${logoUrl}" alt="RR Reparação Automotiva">
        <div>
          <h1>RR Reparação Manager</h1>
          <p>Relatório financeiro</p>
          <p>Período: <strong>${escapeHtml(periodo)}</strong></p>
        </div>
      </header>

      <section class="report-print-summary">
        <div><span>Receitas</span><strong>${money(resumo.receitas)}</strong></div>
        <div><span>Custos</span><strong>${money(resumo.custos)}</strong></div>
        <div><span>Despesas</span><strong>${money(resumo.despesas)}</strong></div>
        <div class="highlight"><span>Lucro</span><strong>${money(resumo.lucro)}</strong></div>
      </section>

      <section class="report-print-charts">
        <div class="report-chart-card">
          <h2>Distribuição do período</h2>
          <div class="report-donut" style="background:${totalDonut ? `conic-gradient(${segmentos})` : "#edf2f7"}">
            <span>${money(resumo.lucro)}<small>Lucro líquido</small></span>
          </div>
          <div class="report-legend">
            ${valoresDonut.map((item) => `<div><i style="background:${item.color}"></i><span>${item.label}</span><strong>${money(item.valor)}</strong></div>`).join("")}
          </div>
        </div>

        <div class="report-chart-card">
          <h2>Evolução mensal</h2>
          <div class="report-bars-legend">
            ${series.map((serie) => `<span><i class="${serie.className}"></i>${serie.label}</span>`).join("")}
          </div>
          <div class="report-monthly-bars">
            ${meses.length ? meses.map((mes) => {
              const bars = series.map((serie) => {
                const value = Number(mes[serie.key]) || 0;
                const altura = value === 0 ? 4 : Math.max(10, Math.round((Math.abs(value) / maiorValor) * 112));
                return `<span class="${serie.className}" style="height:${altura}px" title="${serie.label}: ${money(value)}"></span>`;
              }).join("");
              return `<div class="report-month-group"><div>${bars}</div><strong>${escapeHtml(mes.label)}</strong><small>${money(mes.lucro)}</small></div>`;
            }).join("") : `<p class="muted">Sem dados no período.</p>`}
          </div>
        </div>
      </section>

      <section class="report-table-section">
        <h2>Resultado por mês</h2>
        <table class="print-table">
          <thead><tr><th>Mês</th><th>Receitas</th><th>Custos</th><th>Despesas</th><th>Lucro</th></tr></thead>
          <tbody>${meses.map((mes) => `<tr><td>${escapeHtml(mes.label)}</td><td>${money(mes.receitas)}</td><td>${money(mes.custos)}</td><td>${money(mes.despesas)}</td><td>${money(mes.lucro)}</td></tr>`).join("") || `<tr><td colspan="5">Sem lançamentos no período.</td></tr>`}</tbody>
        </table>
      </section>

      <section class="report-table-section report-transactions-section">
        <h2>Lançamentos analisados</h2>
        <table class="print-table">
          <thead><tr><th>Data</th><th>Tipo</th><th>Descrição</th><th>Categoria</th><th>Valor</th></tr></thead>
          <tbody>${lancamentos.map((item) => `<tr><td>${escapeHtml(formatDateBR(item.data))}</td><td>${escapeHtml(item.tipo)}</td><td>${escapeHtml(item.descricao)}</td><td>${escapeHtml(item.categoria || "-")}</td><td>${money(item.valor)}</td></tr>`).join("") || `<tr><td colspan="5">Sem lançamentos no período.</td></tr>`}</tbody>
        </table>
      </section>
    </article>
  `;
}

function editFinanceiro(id) {
  const item = readData("financeiro").find((lancamento) => lancamento.id === id);
  if (!item) return;
  setValue("financeiroId", item.id);
  setValue("financeiroData", item.data);
  setValue("financeiroDescricao", item.descricao);
  setValue("financeiroCategoria", item.categoria);
  setValue("financeiroValor", item.valor);
  byId(item.tipo === "Receita" ? "financeiroTipoReceita" : "financeiroTipoDespesa").checked = true;
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function refreshFinanceiro() {
  renderFinanceiro();
  renderFinanceiroRelatorio();
}

function hydrateClienteCarroSelects(clienteSelectId, carroSelectId, selectedCarroId = "") {
  const clientes = readData("clientes");
  const clienteSelect = byId(clienteSelectId);
  const selectedClienteId = clienteSelect?.value || "";
  fillSelect(clienteSelectId, clientes, "Selecione um cliente", (cliente) => cliente.nome);
  setValue(clienteSelectId, selectedClienteId);

  const cliente = getCliente(getValue(clienteSelectId));
  const carros = cliente?.carros || [];
  fillSelect(carroSelectId, carros, "Selecione um carro", (carro) => [carro.marca, carro.modelo, carro.motor, carro.ano, carro.placa].filter(Boolean).join(" "));
  if (selectedCarroId) setValue(carroSelectId, selectedCarroId);
}

function deleteItem(type, id, callback) {
  const confirmed = confirm("Deseja excluir este registro?");
  if (!confirmed) return;
  writeData(type, readData(type).filter((item) => item.id !== id));
  callback();
}
