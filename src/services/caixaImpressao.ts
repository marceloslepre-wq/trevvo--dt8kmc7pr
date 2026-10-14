import type { CaixaSessao, CaixaSessaoMovimento, TotalPorForma } from '@/services/caixa'

export function imprimirComprovanteSangria(dados: {
  movimentoId: string
  transferenciaId?: string
  valor: number
  motivo: string
  dataHora: string
  operadorNome: string
  terminalNome: string
  empresaNome: string
  novoSaldoCaixa?: number
}) {
  const janela = window.open('', '_blank', 'width=420,height=600')
  if (!janela) {
    alert('Por favor, permita pop-ups no seu navegador para imprimir o comprovante.')
    return
  }

  const dataFormatada = new Date(dados.dataHora).toLocaleString('pt-BR')

  const html = `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="utf-8">
      <title>Comprovante de Sangria de Caixa</title>
      <style>
        @page {
          size: 80mm auto;
          margin: 4mm;
        }
        body {
          font-family: 'Courier New', Courier, monospace;
          font-size: 12px;
          line-height: 1.3;
          color: #000;
          margin: 0;
          padding: 8px;
        }
        .header {
          text-align: center;
          border-bottom: 1px dashed #000;
          padding-bottom: 8px;
          margin-bottom: 8px;
        }
        .empresa {
          font-weight: bold;
          font-size: 14px;
        }
        .titulo {
          font-weight: bold;
          font-size: 13px;
          margin-top: 4px;
          text-transform: uppercase;
        }
        .linha {
          display: flex;
          justify-content: space-between;
          margin: 4px 0;
        }
        .destaque {
          font-size: 16px;
          font-weight: bold;
          text-align: center;
          margin: 12px 0;
          padding: 6px;
          border-top: 1px solid #000;
          border-bottom: 1px solid #000;
        }
        .motivo-box {
          margin: 8px 0;
          padding: 6px;
          background: #f4f4f4;
          border: 1px solid #ccc;
          font-size: 11px;
        }
        .assinaturas {
          margin-top: 30px;
          border-top: 1px dashed #000;
          padding-top: 12px;
        }
        .campo-assinatura {
          margin-top: 28px;
          text-align: center;
        }
        .linha-assinatura {
          border-top: 1px solid #000;
          margin: 0 10px;
          padding-top: 3px;
          font-size: 11px;
        }
        .footer {
          margin-top: 16px;
          font-size: 10px;
          text-align: center;
          color: #555;
        }
        @media print {
          body { padding: 0; }
          .no-print { display: none; }
        }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="empresa">${dados.empresaNome}</div>
        <div class="titulo">Comprovante de Sangria</div>
        <div style="font-size: 11px; margin-top: 2px;">Controle de Frente de Caixa</div>
      </div>

      <div class="linha">
        <span>Terminal:</span>
        <strong>${dados.terminalNome}</strong>
      </div>
      <div class="linha">
        <span>Operador:</span>
        <strong>${dados.operadorNome}</strong>
      </div>
      <div class="linha">
        <span>Data/Hora:</span>
        <span>${dataFormatada}</span>
      </div>
      ${
        dados.transferenciaId
          ? `<div class="linha"><span>Documento:</span><span style="font-size:10px;">${dados.transferenciaId}</span></div>`
          : ''
      }

      <div class="destaque">
        VALOR: R$ ${dados.valor.toFixed(2)}
      </div>

      <div><strong>Motivo / Destino:</strong></div>
      <div class="motivo-box">
        ${dados.motivo}
      </div>

      ${
        dados.novoSaldoCaixa !== undefined
          ? `<div class="linha" style="font-size: 11px; margin-top: 6px;">
              <span>Saldo restante no caixa:</span>
              <strong>R$ ${dados.novoSaldoCaixa.toFixed(2)}</strong>
            </div>`
          : ''
      }

      <div class="assinaturas">
        <div class="campo-assinatura">
          <div class="linha-assinatura">Operador de Caixa (${dados.operadorNome})</div>
        </div>
        <div class="campo-assinatura">
          <div class="linha-assinatura">Supervisor / Responsável pelo Recolhimento</div>
        </div>
      </div>

      <div class="footer">
        Via de Sangria impressa em ${new Date().toLocaleString('pt-BR')}
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

export function imprimirRelatorioFechamentoPdf(dados: {
  sessao: CaixaSessao
  movimentos: CaixaSessaoMovimento[]
  empresaNome: string
  terminalNome: string
  operadorNome: string
  supervisorNome?: string
}) {
  const janela = window.open('', '_blank', 'width=800,height=900')
  if (!janela) {
    alert('Por favor, permita pop-ups no seu navegador para imprimir o relatório de fechamento.')
    return
  }

  const s = dados.sessao
  const aberturaData = s.data_abertura ? new Date(s.data_abertura).toLocaleString('pt-BR') : '-'
  const fechamentoData = s.data_fechamento
    ? new Date(s.data_fechamento).toLocaleString('pt-BR')
    : '-'
  const conferenciaData = s.data_conferencia
    ? new Date(s.data_conferencia).toLocaleString('pt-BR')
    : '-'

  let formasArr: TotalPorForma[] = []
  if (Array.isArray(s.totais_por_forma)) {
    formasArr = s.totais_por_forma
  } else if (typeof s.totais_por_forma === 'string') {
    try {
      formasArr = JSON.parse(s.totais_por_forma)
    } catch {
      formasArr = []
    }
  }

  const valorAbertura = Number(s.valor_abertura || 0)
  const valorSuprimentos = Number(s.valor_suprimentos || 0)
  const valorSangrias = Number(s.valor_sangrias || 0)
  const valorVendas = Number(s.valor_vendas || 0)
  const valorCancelado = Number(s.valor_cancelado || 0)
  const qtdVendas = Number(s.quantidade_vendas || 0)

  const esperadoDinheiro = Number(s.valor_esperado_dinheiro || 0)
  const contadoDinheiro = Number(s.valor_contado_dinheiro || 0)
  const diferencaDinheiro = Number(s.diferenca_dinheiro || 0)

  const temDiferenca = Math.abs(diferencaDinheiro) >= 0.01

  const html = `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="utf-8">
      <title>Relatório de Fechamento de Caixa - Sessão #${s.id.slice(-6)}</title>
      <style>
        body {
          font-family: Arial, Helvetica, sans-serif;
          font-size: 12px;
          line-height: 1.4;
          color: #333;
          margin: 0;
          padding: 24px;
        }
        .header {
          border-bottom: 2px solid #0284c7;
          padding-bottom: 12px;
          margin-bottom: 16px;
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
        }
        .empresa {
          font-size: 16px;
          font-weight: bold;
          color: #0f172a;
        }
        .subtitulo {
          font-size: 13px;
          color: #475569;
          margin-top: 2px;
        }
        .sessao-badge {
          background: #f1f5f9;
          border: 1px solid #cbd5e1;
          padding: 6px 12px;
          border-radius: 6px;
          text-align: right;
        }
        .section-title {
          font-size: 13px;
          font-weight: bold;
          color: #0f172a;
          border-bottom: 1px solid #e2e8f0;
          padding-bottom: 4px;
          margin: 16px 0 8px 0;
          text-transform: uppercase;
        }
        .grid-info {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 12px;
          margin-bottom: 12px;
        }
        .info-card {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          padding: 8px 10px;
          border-radius: 6px;
        }
        .info-card .label {
          font-size: 10px;
          text-transform: uppercase;
          color: #64748b;
          font-weight: 600;
        }
        .info-card .val {
          font-size: 13px;
          font-weight: bold;
          color: #0f172a;
          margin-top: 2px;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 8px;
        }
        th, td {
          border: 1px solid #e2e8f0;
          padding: 6px 10px;
          text-align: left;
        }
        th {
          background: #f1f5f9;
          color: #334155;
          font-size: 11px;
          font-weight: 600;
        }
        td.num, th.num {
          text-align: right;
          font-family: 'Courier New', Courier, monospace;
        }
        .total-row {
          font-weight: bold;
          background: #f8fafc;
        }
        .box-fechamento {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          gap: 12px;
          margin-top: 12px;
          padding: 12px;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
        }
        .box-destaque {
          text-align: center;
          padding: 8px;
          border-radius: 6px;
        }
        .diferenca-zero {
          background: #f0fdf4;
          border: 1px solid #86efac;
          color: #166534;
        }
        .diferenca-falta {
          background: #fef2f2;
          border: 1px solid #fca5a5;
          color: #991b1b;
        }
        .diferenca-sobra {
          background: #eff6ff;
          border: 1px solid #93c5fd;
          color: #1e40af;
        }
        .assinaturas {
          margin-top: 36px;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 40px;
          padding-top: 20px;
          border-top: 1px dashed #cbd5e1;
        }
        .campo-assinatura {
          text-align: center;
        }
        .linha-assinatura {
          border-top: 1px solid #334155;
          padding-top: 4px;
          font-size: 11px;
          color: #334155;
        }
        .footer {
          margin-top: 24px;
          font-size: 10px;
          color: #94a3b8;
          text-align: center;
        }
        @media print {
          body { padding: 8px; }
          .no-print { display: none; }
        }
      </style>
    </head>
    <body>
      <div class="header">
        <div>
          <div class="empresa">${dados.empresaNome}</div>
          <div class="subtitulo">Fechamento de Caixa - Resumo e Conferência</div>
        </div>
        <div class="sessao-badge">
          <div><strong>Sessão #${s.id.slice(-6).toUpperCase()}</strong></div>
          <div style="font-size: 11px; color: ${s.status === 'Fechado' ? '#047857' : '#b45309'}; font-weight: bold;">Status: ${s.status}</div>
        </div>
      </div>

      <div class="grid-info">
        <div class="info-card">
          <div class="label">Terminal</div>
          <div class="val">${dados.terminalNome}</div>
        </div>
        <div class="info-card">
          <div class="label">Operador do Caixa</div>
          <div class="val">${dados.operadorNome}</div>
        </div>
        <div class="info-card">
          <div class="label">Conferido por</div>
          <div class="val">${dados.supervisorNome || (s.conferido_por_id ? 'Supervisor' : 'Pendente de Conferência')}</div>
        </div>
        <div class="info-card">
          <div class="label">Data Abertura</div>
          <div class="val">${aberturaData}</div>
        </div>
        <div class="info-card">
          <div class="label">Data Fechamento</div>
          <div class="val">${fechamentoData}</div>
        </div>
        <div class="info-card">
          <div class="label">Data Conferência</div>
          <div class="val">${conferenciaData}</div>
        </div>
      </div>

      <div class="section-title">1. Resumo da Movimentação Física (Dinheiro)</div>
      <div class="grid-info">
        <div class="info-card">
          <div class="label">(+) Fundo de Troco (Abertura)</div>
          <div class="val">R$ ${valorAbertura.toFixed(2)}</div>
        </div>
        <div class="info-card">
          <div class="label">(+) Suprimentos Realizados</div>
          <div class="val">R$ ${valorSuprimentos.toFixed(2)}</div>
        </div>
        <div class="info-card">
          <div class="label">(-) Sangrias Realizadas</div>
          <div class="val">R$ ${valorSangrias.toFixed(2)}</div>
        </div>
        <div class="info-card">
          <div class="label">Vendas Finalizadas (${qtdVendas} atendimentos)</div>
          <div class="val">R$ ${valorVendas.toFixed(2)}</div>
        </div>
        <div class="info-card">
          <div class="label">Vendas Canceladas</div>
          <div class="val" style="color: #dc2626;">R$ ${valorCancelado.toFixed(2)}</div>
        </div>
        <div class="info-card">
          <div class="label">Saldo em Caixa Esperado</div>
          <div class="val" style="color: #0284c7;">R$ ${esperadoDinheiro.toFixed(2)}</div>
        </div>
      </div>

      <div class="section-title">2. Apuração e Fechamento de Dinheiro</div>
      <div class="box-fechamento">
        <div class="box-destaque" style="background: #f1f5f9; border: 1px solid #cbd5e1;">
          <div style="font-size: 11px; text-transform: uppercase; color: #475569; font-weight: 600;">Saldo Esperado (Sistema)</div>
          <div style="font-size: 18px; font-weight: bold; margin-top: 4px; font-family: monospace;">R$ ${esperadoDinheiro.toFixed(2)}</div>
        </div>
        <div class="box-destaque" style="background: #f1f5f9; border: 1px solid #cbd5e1;">
          <div style="font-size: 11px; text-transform: uppercase; color: #475569; font-weight: 600;">Contado pelo Operador</div>
          <div style="font-size: 18px; font-weight: bold; margin-top: 4px; font-family: monospace;">R$ ${contadoDinheiro.toFixed(2)}</div>
        </div>
        <div class="box-destaque ${!temDiferenca ? 'diferenca-zero' : diferencaDinheiro < 0 ? 'diferenca-falta' : 'diferenca-sobra'}">
          <div style="font-size: 11px; text-transform: uppercase; font-weight: 600;">
            ${!temDiferenca ? 'Diferença: Caixa Exato' : diferencaDinheiro < 0 ? 'Falta / Quebra de Caixa' : 'Sobra de Caixa'}
          </div>
          <div style="font-size: 18px; font-weight: bold; margin-top: 4px; font-family: monospace;">
            R$ ${Math.abs(diferencaDinheiro).toFixed(2)} ${diferencaDinheiro < 0 ? '(-)' : diferencaDinheiro > 0 ? '(+)' : ''}
          </div>
        </div>
      </div>

      <div class="section-title">3. Vendas por Forma de Pagamento (Esperado x Informado)</div>
      <table>
        <thead>
          <tr>
            <th>Forma de Pagamento</th>
            <th>Tipo</th>
            <th class="num">Qtd Vendas</th>
            <th class="num">Valor Esperado</th>
            <th class="num">Valor Informado</th>
            <th class="num">Diferença</th>
          </tr>
        </thead>
        <tbody>
          ${formasArr
            .map(
              (f) => `
            <tr>
              <td><strong>${f.forma_descricao}</strong></td>
              <td>${f.tipo || '-'}</td>
              <td class="num">${f.quantidade_vendas}</td>
              <td class="num">R$ ${(f.valor_esperado || 0).toFixed(2)}</td>
              <td class="num">R$ ${(f.valor_informado || 0).toFixed(2)}</td>
              <td class="num" style="color: ${
                Math.abs(f.diferenca || 0) < 0.01
                  ? '#166534'
                  : (f.diferenca || 0) < 0
                    ? '#dc2626'
                    : '#2563eb'
              }; font-weight: bold;">
                R$ ${(f.diferenca || 0).toFixed(2)}
              </td>
            </tr>
          `,
            )
            .join('')}
          ${
            formasArr.length === 0
              ? '<tr><td colspan="6" style="text-align: center; color: #94a3b8; padding: 12px;">Nenhum pagamento registrado nesta sessão.</td></tr>'
              : ''
          }
        </tbody>
      </table>

      ${
        dados.movimentos && dados.movimentos.length > 0
          ? `
        <div class="section-title">4. Histórico de Sangrias e Suprimentos da Sessão</div>
        <table>
          <thead>
            <tr>
              <th>Hora</th>
              <th>Tipo</th>
              <th>Motivo</th>
              <th class="num">Valor</th>
              <th>Doc / Transferência</th>
            </tr>
          </thead>
          <tbody>
            ${dados.movimentos
              .map(
                (m) => `
              <tr>
                <td>${m.data_hora ? new Date(m.data_hora).toLocaleTimeString('pt-BR') : '-'}</td>
                <td><strong style="color: ${m.tipo === 'Sangria' ? '#dc2626' : '#166534'}">${m.tipo}</strong></td>
                <td>${m.motivo || '-'}</td>
                <td class="num">R$ ${Number(m.valor || 0).toFixed(2)}</td>
                <td style="font-family: monospace; font-size: 10px;">${m.transferencia_id || '-'}</td>
              </tr>
            `,
              )
              .join('')}
          </tbody>
        </table>
      `
          : ''
      }

      ${
        s.observacao_fechamento
          ? `
        <div class="section-title">5. Observações do Fechamento / Conferência</div>
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 8px 12px; border-radius: 6px; font-size: 11px;">
          ${s.observacao_fechamento}
        </div>
      `
          : ''
      }

      <div class="assinaturas">
        <div class="campo-assinatura">
          <div class="linha-assinatura">
            <strong>${dados.operadorNome}</strong><br>
            Operador do Caixa
          </div>
        </div>
        <div class="campo-assinatura">
          <div class="linha-assinatura">
            <strong>${dados.supervisorNome || 'Supervisor / Conferência'}</strong><br>
            Responsável pela Auditoria
          </div>
        </div>
      </div>

      <div class="footer">
        Relatório gerado em ${new Date().toLocaleString('pt-BR')} pelo Sistema ERP Comercial.
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
