import type { Venda, VendaItem, VendaPagamento } from '@/services/vendas'

export interface DadosImpressaoVenda {
  venda: Venda
  itens: VendaItem[]
  pagamentos?: VendaPagamento[]
  empresa: {
    razao_social?: string
    nome_fantasia?: string
    cnpj?: string
    telefone?: string
    email?: string
    logradouro?: string
    numero?: string
    bairro?: string
    cidade?: string
    uf?: string
  }
  cliente?: {
    nome_razao_social?: string
    nome?: string
    cpf_cnpj?: string
    telefone?: string
    celular?: string
    email?: string
    logradouro?: string
    numero?: string
    bairro?: string
    cidade?: string
    uf?: string
  }
  vendedorNome?: string
  condicaoNome?: string
  mensagemRodape?: string
}

/**
 * Abre janela de impressão/PDF estilizada para Orçamento ou Pedido de Venda Comercial.
 */
export function imprimirOrcamentoOuPedido(dados: DadosImpressaoVenda) {
  const janela = window.open('', '_blank', 'width=850,height=950')
  if (!janela) {
    alert('Por favor, permita pop-ups no seu navegador para imprimir a venda.')
    return
  }

  const { venda, itens, empresa, cliente } = dados
  const ehOrcamento = venda.tipo === 'Orçamento'
  const tituloDoc = ehOrcamento ? 'ORÇAMENTO DE VENDA' : 'PEDIDO DE VENDA'

  const dataEmissaoFmt = venda.data_emissao
    ? new Date(venda.data_emissao + 'T00:00:00').toLocaleDateString('pt-BR')
    : '-'
  const dataValidadeFmt = venda.data_validade
    ? new Date(venda.data_validade + 'T00:00:00').toLocaleDateString('pt-BR')
    : ''

  const subtotalProdutos = Number(venda.valor_produtos || 0)
  const descontoItens = Number(venda.valor_desconto_itens || 0)
  const descontoTotal = Number(venda.valor_desconto_total || 0)
  const descontoGeral = descontoItens + descontoTotal
  const acrescimo = Number(venda.valor_acrescimo || 0)
  const frete = Number(venda.valor_frete || 0)
  const totalGeral = Number(venda.valor_total || 0)

  const nomeEmpresa = empresa.nome_fantasia || empresa.razao_social || 'ERP Comercial'
  const endEmpresa = [
    empresa.logradouro && `${empresa.logradouro}, ${empresa.numero || 'S/N'}`,
    empresa.bairro,
    empresa.cidade && `${empresa.cidade}-${empresa.uf || ''}`,
  ]
    .filter(Boolean)
    .join(' - ')

  const nomeCliente =
    cliente?.nome_razao_social || cliente?.nome || venda.cpf_cnpj_consumidor || 'Consumidor Final'
  const docCliente = cliente?.cpf_cnpj || venda.cpf_cnpj_consumidor || ''
  const telCliente = cliente?.celular || cliente?.telefone || ''
  const endCliente = [
    cliente?.logradouro && `${cliente.logradouro}, ${cliente.numero || 'S/N'}`,
    cliente?.bairro,
    cliente?.cidade && `${cliente.cidade}-${cliente?.uf || ''}`,
  ]
    .filter(Boolean)
    .join(' - ')

  const html = `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="utf-8">
      <title>${tituloDoc} #${venda.numero}</title>
      <style>
        @page {
          size: A4 portrait;
          margin: 12mm 15mm;
        }
        body {
          font-family: Arial, Helvetica, sans-serif;
          font-size: 11px;
          line-height: 1.35;
          color: #1e293b;
          margin: 0;
          padding: 16px;
        }
        .header {
          border-bottom: 2px solid #2563eb;
          padding-bottom: 10px;
          margin-bottom: 14px;
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
        }
        .empresa-box h1 {
          font-size: 16px;
          font-weight: bold;
          color: #0f172a;
          margin: 0 0 2px 0;
        }
        .empresa-box p {
          margin: 1px 0;
          color: #475569;
          font-size: 10px;
        }
        .doc-badge {
          text-align: right;
          background: #eff6ff;
          border: 1px solid #bfdbfe;
          border-radius: 6px;
          padding: 8px 12px;
          min-width: 170px;
        }
        .doc-badge .titulo {
          font-size: 13px;
          font-weight: bold;
          color: #1e40af;
          text-transform: uppercase;
        }
        .doc-badge .numero {
          font-size: 18px;
          font-weight: bold;
          color: #0f172a;
          margin: 2px 0;
        }
        .doc-badge .status {
          font-size: 10px;
          font-weight: 600;
          text-transform: uppercase;
          color: #3b82f6;
        }
        .info-grid {
          display: grid;
          grid-template-columns: 2fr 1fr;
          gap: 12px;
          margin-bottom: 12px;
        }
        .card {
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          padding: 8px 10px;
          background: #f8fafc;
        }
        .card-title {
          font-size: 10px;
          font-weight: bold;
          color: #475569;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          border-bottom: 1px solid #e2e8f0;
          padding-bottom: 3px;
          margin-bottom: 6px;
        }
        .card p {
          margin: 2px 0;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 10px;
          font-size: 10.5px;
        }
        th, td {
          border: 1px solid #cbd5e1;
          padding: 6px 8px;
          text-align: left;
        }
        th {
          background: #f1f5f9;
          color: #334155;
          font-weight: 600;
          text-transform: uppercase;
          font-size: 9.5px;
        }
        td.num, th.num {
          text-align: right;
          font-family: 'Courier New', Courier, monospace;
        }
        .totais-container {
          margin-top: 12px;
          display: flex;
          justify-content: flex-end;
        }
        .totais-table {
          width: 300px;
          border-collapse: collapse;
        }
        .totais-table td {
          padding: 4px 8px;
          border: 1px solid #cbd5e1;
        }
        .totais-table .destaque {
          font-size: 13px;
          font-weight: bold;
          background: #eff6ff;
          color: #1e3a8a;
        }
        .obs-box {
          margin-top: 14px;
          padding: 8px 10px;
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          background: #fafafa;
          font-size: 10px;
        }
        .assinaturas {
          margin-top: 40px;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 50px;
          padding-top: 10px;
        }
        .campo-assinatura {
          text-align: center;
        }
        .linha-assinatura {
          border-top: 1px solid #334155;
          padding-top: 4px;
          font-size: 10px;
          color: #334155;
        }
        .footer {
          margin-top: 24px;
          border-top: 1px solid #e2e8f0;
          padding-top: 8px;
          font-size: 9px;
          color: #64748b;
          text-align: center;
        }
        @media print {
          body { padding: 0; }
          .no-print { display: none; }
        }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="empresa-box">
          <h1>${nomeEmpresa}</h1>
          ${empresa.cnpj ? `<p><strong>CNPJ:</strong> ${empresa.cnpj}</p>` : ''}
          ${endEmpresa ? `<p>${endEmpresa}</p>` : ''}
          ${empresa.telefone ? `<p><strong>Fone:</strong> ${empresa.telefone}</p>` : ''}
          ${empresa.email ? `<p><strong>E-mail:</strong> ${empresa.email}</p>` : ''}
        </div>
        <div class="doc-badge">
          <div class="titulo">${tituloDoc}</div>
          <div class="numero">Nº ${venda.numero}</div>
          <div class="status">${venda.status}</div>
        </div>
      </div>

      <div class="info-grid">
        <div class="card">
          <div class="card-title">Dados do Cliente</div>
          <p><strong>Nome/Razão:</strong> ${nomeCliente}</p>
          ${docCliente ? `<p><strong>CPF/CNPJ:</strong> ${docCliente}</p>` : ''}
          ${endCliente ? `<p><strong>Endereço:</strong> ${endCliente}</p>` : ''}
          ${telCliente ? `<p><strong>Telefone/WhatsApp:</strong> ${telCliente}</p>` : ''}
        </div>

        <div class="card">
          <div class="card-title">Dados Comerciais</div>
          <p><strong>Emissão:</strong> ${dataEmissaoFmt}</p>
          ${dataValidadeFmt ? `<p><strong>Validade:</strong> ${dataValidadeFmt}</p>` : ''}
          ${dados.vendedorNome ? `<p><strong>Vendedor:</strong> ${dados.vendedorNome}</p>` : ''}
          ${dados.condicaoNome ? `<p><strong>Condição:</strong> ${dados.condicaoNome}</p>` : ''}
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th style="width: 30px;">#</th>
            <th>Descrição do Item</th>
            <th style="width: 50px;">UN</th>
            <th class="num" style="width: 70px;">Qtd.</th>
            <th class="num" style="width: 80px;">Unitário</th>
            <th class="num" style="width: 70px;">Desc.</th>
            <th class="num" style="width: 90px;">Total</th>
          </tr>
        </thead>
        <tbody>
          ${itens
            .map(
              (it, i) => `
            <tr>
              <td style="text-align: center;">${it.item || i + 1}</td>
              <td>
                <strong>${it.descricao}</strong>
                ${it.expand?.produto_id?.codigo ? `<span style="color:#64748b; font-size:9px;"> (Cód: ${it.expand.produto_id.codigo})</span>` : ''}
              </td>
              <td style="text-align: center;">${it.unidade}</td>
              <td class="num">${Number(it.quantidade).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 3 })}</td>
              <td class="num">R$ ${Number(it.preco_unitario).toFixed(2)}</td>
              <td class="num">${Number(it.desconto_valor || 0) > 0 ? `R$ ${Number(it.desconto_valor).toFixed(2)}` : '-'}</td>
              <td class="num font-bold">R$ ${Number(it.valor_total).toFixed(2)}</td>
            </tr>
          `,
            )
            .join('')}
        </tbody>
      </table>

      <div class="totais-container">
        <table class="totais-table">
          <tr>
            <td>Subtotal dos Produtos:</td>
            <td class="num">R$ ${subtotalProdutos.toFixed(2)}</td>
          </tr>
          ${
            descontoGeral > 0
              ? `<tr>
                  <td>Descontos Concedidos:</td>
                  <td class="num text-red-600">- R$ ${descontoGeral.toFixed(2)}</td>
                </tr>`
              : ''
          }
          ${
            acrescimo > 0
              ? `<tr>
                  <td>Acréscimos:</td>
                  <td class="num">+ R$ ${acrescimo.toFixed(2)}</td>
                </tr>`
              : ''
          }
          ${
            frete > 0
              ? `<tr>
                  <td>Valor do Frete:</td>
                  <td class="num">+ R$ ${frete.toFixed(2)}</td>
                </tr>`
              : ''
          }
          <tr class="destaque">
            <td>VALOR TOTAL:</td>
            <td class="num">R$ ${totalGeral.toFixed(2)}</td>
          </tr>
        </table>
      </div>

      ${
        venda.observacao_cliente || venda.observacao
          ? `<div class="obs-box">
              <strong>Observações / Condições:</strong><br>
              ${venda.observacao_cliente || venda.observacao}
            </div>`
          : ''
      }

      <div class="assinaturas">
        <div class="campo-assinatura">
          <div class="linha-assinatura">${nomeEmpresa}</div>
        </div>
        <div class="campo-assinatura">
          <div class="linha-assinatura">De acordo: ${nomeCliente}</div>
        </div>
      </div>

      <div class="footer">
        ${dados.mensagemRodape || 'Obrigado pela preferência! Volte sempre.'}<br>
        Documento gerado em ${new Date().toLocaleString('pt-BR')} via ERP de Gestão Comercial
      </div>

      <script>
        window.onload = function() {
          window.print();
        }
      </script>
    </body>
    </html>
  `

  janela.document.open()
  janela.document.write(html)
  janela.document.close()
}

/**
 * Abre janela para impressão do Comprovante Não Fiscal (80mm térmica ou A4) após finalizar a venda.
 */
export function imprimirComprovanteNaoFiscal(dados: DadosImpressaoVenda) {
  const janela = window.open('', '_blank', 'width=420,height=700')
  if (!janela) {
    alert('Por favor, permita pop-ups no seu navegador para imprimir o comprovante.')
    return
  }

  const { venda, itens, pagamentos = [], empresa, cliente } = dados
  const nomeEmpresa = empresa.nome_fantasia || empresa.razao_social || 'ERP Comercial'
  const dataFinal = venda.data_finalizacao || venda.data_emissao
  const dataFmt = dataFinal
    ? new Date(dataFinal).toLocaleString('pt-BR')
    : new Date().toLocaleString('pt-BR')
  const nomeCliente =
    cliente?.nome_razao_social || cliente?.nome || venda.cpf_cnpj_consumidor || 'Consumidor Final'

  const html = `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="utf-8">
      <title>Comprovante Não Fiscal - Venda #${venda.numero}</title>
      <style>
        @page {
          size: 80mm auto;
          margin: 3mm;
        }
        body {
          font-family: 'Courier New', Courier, monospace;
          font-size: 11px;
          line-height: 1.25;
          color: #000;
          margin: 0;
          padding: 6px;
        }
        .header {
          text-align: center;
          border-bottom: 1px dashed #000;
          padding-bottom: 6px;
          margin-bottom: 6px;
        }
        .empresa {
          font-weight: bold;
          font-size: 13px;
        }
        .titulo {
          font-weight: bold;
          font-size: 12px;
          margin-top: 3px;
        }
        .linha {
          display: flex;
          justify-content: space-between;
          margin: 2px 0;
        }
        .divisor {
          border-top: 1px dashed #000;
          margin: 6px 0;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          font-size: 10px;
        }
        th, td {
          padding: 2px 0;
        }
        th {
          border-bottom: 1px solid #000;
          text-align: left;
        }
        .num {
          text-align: right;
        }
        .destaque {
          font-size: 14px;
          font-weight: bold;
          margin: 6px 0;
        }
        .footer {
          margin-top: 12px;
          font-size: 9px;
          text-align: center;
          border-top: 1px dashed #000;
          padding-top: 6px;
        }
        @media print {
          body { padding: 0; }
          .no-print { display: none; }
        }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="empresa">${nomeEmpresa}</div>
        ${empresa.cnpj ? `<div>CNPJ: ${empresa.cnpj}</div>` : ''}
        <div class="titulo">COMPROVANTE NÃO FISCAL</div>
        <div>Venda Nº ${venda.numero} - ${venda.tipo}</div>
      </div>

      <div class="linha">
        <span>Data/Hora:</span>
        <span>${dataFmt}</span>
      </div>
      <div class="linha">
        <span>Cliente:</span>
        <span style="max-width: 180px; text-align: right; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${nomeCliente}</span>
      </div>
      ${venda.cpf_cnpj_consumidor ? `<div class="linha"><span>CPF/CNPJ:</span><span>${venda.cpf_cnpj_consumidor}</span></div>` : ''}
      ${dados.vendedorNome ? `<div class="linha"><span>Vendedor:</span><span>${dados.vendedorNome}</span></div>` : ''}

      <div class="divisor"></div>

      <table>
        <thead>
          <tr>
            <th>ITEM DESCRIÇÃO</th>
            <th class="num">QTD</th>
            <th class="num">UNIT</th>
            <th class="num">TOTAL</th>
          </tr>
        </thead>
        <tbody>
          ${itens
            .map(
              (it, idx) => `
            <tr>
              <td colspan="4" style="padding-top: 3px;"><strong>${idx + 1}. ${it.descricao}</strong></td>
            </tr>
            <tr>
              <td></td>
              <td class="num">${Number(it.quantidade).toFixed(2)} ${it.unidade}</td>
              <td class="num">R$ ${Number(it.preco_unitario).toFixed(2)}</td>
              <td class="num font-bold">R$ ${Number(it.valor_total).toFixed(2)}</td>
            </tr>
          `,
            )
            .join('')}
        </tbody>
      </table>

      <div class="divisor"></div>

      <div class="linha">
        <span>Subtotal Produtos:</span>
        <span>R$ ${Number(venda.valor_produtos).toFixed(2)}</span>
      </div>
      ${
        Number(venda.valor_desconto_itens || 0) + Number(venda.valor_desconto_total || 0) > 0
          ? `<div class="linha"><span>Descontos:</span><span>- R$ ${(Number(venda.valor_desconto_itens || 0) + Number(venda.valor_desconto_total || 0)).toFixed(2)}</span></div>`
          : ''
      }
      ${
        Number(venda.valor_acrescimo || 0) > 0
          ? `<div class="linha"><span>Acréscimos:</span><span>+ R$ ${Number(venda.valor_acrescimo).toFixed(2)}</span></div>`
          : ''
      }
      ${
        Number(venda.valor_frete || 0) > 0
          ? `<div class="linha"><span>Frete:</span><span>+ R$ ${Number(venda.valor_frete).toFixed(2)}</span></div>`
          : ''
      }

      <div class="linha destaque">
        <span>TOTAL:</span>
        <span>R$ ${Number(venda.valor_total).toFixed(2)}</span>
      </div>

      ${
        pagamentos.length > 0
          ? `
        <div class="divisor"></div>
        <div style="font-weight: bold; margin-bottom: 2px;">PAGAMENTOS:</div>
        ${pagamentos
          .map(
            (p) => `
          <div class="linha">
            <span>${p.expand?.forma_pagamento_id?.descricao || 'Forma de Pagto'}${p.parcelas && p.parcelas > 1 ? ` (${p.parcelas}x)` : ''}:</span>
            <span>R$ ${Number(p.valor).toFixed(2)}</span>
          </div>
        `,
          )
          .join('')}
        ${Number(venda.valor_troco || 0) > 0 ? `<div class="linha"><span>Troco:</span><span>R$ ${Number(venda.valor_troco).toFixed(2)}</span></div>` : ''}
      `
          : ''
      }

      <div class="footer">
        ${dados.mensagemRodape || 'Obrigado pela preferência! Volte sempre.'}<br>
        * NÃO É DOCUMENTO FISCAL *
      </div>

      <script>
        window.onload = function() {
          window.print();
        }
      </script>
    </body>
    </html>
  `

  janela.document.open()
  janela.document.write(html)
  janela.document.close()
}

/**
 * Monta o link para envio direto de resumo via WhatsApp.
 * Abre https://wa.me/55... com texto resumido e sem anexos.
 */
export function abrirEnvioWhatsApp(dados: {
  telefone?: string
  numeroVenda: number
  tipo: string
  clienteNome?: string
  valorTotal: number
  empresaNome?: string
  dataValidade?: string
}) {
  const telLimpo = (dados.telefone || '').replace(/\D/g, '')
  if (!telLimpo || telLimpo.length < 10) {
    alert('O cliente não possui um telefone ou celular válido informado no cadastro.')
    return
  }

  // Se não tiver DDI 55
  const ddi = telLimpo.length === 10 || telLimpo.length === 11 ? `55${telLimpo}` : telLimpo

  const saudacao = `Olá${dados.clienteNome ? `, *${dados.clienteNome}*` : ''}!`
  const empresaTxt = dados.empresaNome ? ` da *${dados.empresaNome}*` : ''
  const validadeTxt = dados.dataValidade
    ? `\nValidade da proposta: ${new Date(dados.dataValidade + 'T00:00:00').toLocaleDateString('pt-BR')}`
    : ''

  const texto = encodeURIComponent(
    `${saudacao}\nSegue o resumo do seu *${dados.tipo} #${dados.numeroVenda}*${empresaTxt}.\n\n` +
      `*Valor Total: R$ ${dados.valorTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}*${validadeTxt}\n\n` +
      `Qualquer dúvida estamos à disposição!`,
  )

  const url = `https://wa.me/${ddi}?text=${texto}`
  window.open(url, '_blank')
}
