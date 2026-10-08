/**
 * Serviço de Apuração de Inadimplência de Clientes
 * Módulo: financeiro_receber
 *
 * Faixas de atraso:
 * - 1 a 30 dias
 * - 31 a 60 dias
 * - 61 a 90 dias
 * - Mais de 90 dias
 *
 * Agrupado por cliente, trazendo dados de contato (telefone, e-mail) e totais.
 */

import pb from '@/lib/pocketbase/client'
import { ContaReceber } from '@/services/contasReceber'

export interface TituloVencidoCliente {
  id: string
  numeroDocumento: string
  parcela: string
  descricao: string
  dataVencimento: string
  diasAtraso: number
  valorOriginal: number
  saldoDevedor: number
  faixa: '1-30' | '31-60' | '61-90' | 'mais_90'
}

export interface InadimplenciaClienteItem {
  clienteId: string
  codigoCliente?: number
  nomeCliente: string
  cpfCnpj?: string
  telefone?: string
  celular?: string
  email?: string
  emailNfe?: string
  totalVencido: number
  qtdTitulosVencidos: number
  faixa1a30: number
  faixa31a60: number
  faixa61a90: number
  faixaMais90: number
  maiorAtrasoDias: number
  titulos: TituloVencidoCliente[]
}

export interface ResumoInadimplencia {
  totalGeralVencido: number
  totalClientesInadimplentes: number
  totalTitulosVencidos: number
  totalFaixa1a30: number
  totalFaixa31a60: number
  totalFaixa61a90: number
  totalFaixaMais90: number
  clientes: InadimplenciaClienteItem[]
}

export async function apurarInadimplencia(empresaId: string): Promise<ResumoInadimplencia> {
  const hoje = new Date()
  const hojeIso = hoje.toISOString().slice(0, 10)
  const hojeMs = new Date(hojeIso + 'T00:00:00').getTime()

  // Buscar títulos a receber em aberto ou parciais com vencimento < hoje
  const titulos = await pb.collection('contas_receber').getFullList<any>({
    filter: `empresa_id = '${empresaId}' && ativo = true && data_vencimento < '${hojeIso}' && status != 'Recebido' && status != 'Cancelado'`,
    sort: 'data_vencimento',
    expand: 'cliente_id',
    requestKey: null,
  })

  let totalGeralVencido = 0
  let totalTitulosVencidos = 0
  let totalFaixa1a30 = 0
  let totalFaixa31a60 = 0
  let totalFaixa61a90 = 0
  let totalFaixaMais90 = 0

  const mapClientes = new Map<string, InadimplenciaClienteItem>()

  for (const t of titulos) {
    const saldo = Number(t.saldo) || 0
    if (saldo <= 0) continue

    const vencIso = (t.data_vencimento || '').slice(0, 10)
    const vencMs = new Date(vencIso + 'T00:00:00').getTime()
    const diffDias = Math.max(1, Math.floor((hojeMs - vencMs) / (1000 * 60 * 60 * 24)))

    let faixa: '1-30' | '31-60' | '61-90' | 'mais_90' = '1-30'
    if (diffDias <= 30) {
      faixa = '1-30'
      totalFaixa1a30 += saldo
    } else if (diffDias <= 60) {
      faixa = '31-60'
      totalFaixa31a60 += saldo
    } else if (diffDias <= 90) {
      faixa = '61-90'
      totalFaixa61a90 += saldo
    } else {
      faixa = 'mais_90'
      totalFaixaMais90 += saldo
    }

    totalGeralVencido += saldo
    totalTitulosVencidos++

    const clienteId = t.cliente_id || 'sem_cliente'
    const clienteExpand = t.expand?.cliente_id

    let itemCliente = mapClientes.get(clienteId)
    if (!itemCliente) {
      itemCliente = {
        clienteId,
        codigoCliente: clienteExpand?.codigo,
        nomeCliente: clienteExpand?.nome_razao_social || 'Cliente não identificado',
        cpfCnpj: clienteExpand?.cpf_cnpj || '',
        telefone: clienteExpand?.telefone || '',
        celular: clienteExpand?.celular || '',
        email: clienteExpand?.email || '',
        emailNfe: clienteExpand?.email_nfe || '',
        totalVencido: 0,
        qtdTitulosVencidos: 0,
        faixa1a30: 0,
        faixa31a60: 0,
        faixa61a90: 0,
        faixaMais90: 0,
        maiorAtrasoDias: 0,
        titulos: [],
      }
      mapClientes.set(clienteId, itemCliente)
    }

    itemCliente.totalVencido = Number((itemCliente.totalVencido + saldo).toFixed(2))
    itemCliente.qtdTitulosVencidos++
    if (diffDias > itemCliente.maiorAtrasoDias) {
      itemCliente.maiorAtrasoDias = diffDias
    }

    if (faixa === '1-30') itemCliente.faixa1a30 = Number((itemCliente.faixa1a30 + saldo).toFixed(2))
    else if (faixa === '31-60')
      itemCliente.faixa31a60 = Number((itemCliente.faixa31a60 + saldo).toFixed(2))
    else if (faixa === '61-90')
      itemCliente.faixa61a90 = Number((itemCliente.faixa61a90 + saldo).toFixed(2))
    else itemCliente.faixaMais90 = Number((itemCliente.faixaMais90 + saldo).toFixed(2))

    itemCliente.titulos.push({
      id: t.id,
      numeroDocumento: t.numero_documento || t.id,
      parcela: t.parcela || '1',
      descricao: t.descricao || 'Título a receber',
      dataVencimento: vencIso,
      diasAtraso: diffDias,
      valorOriginal: Number(t.valor_nominal || t.valor || 0),
      saldoDevedor: saldo,
      faixa,
    })
  }

  // Ordena clientes por maior total vencido decrescente
  const clientesLista = Array.from(mapClientes.values()).sort(
    (a, b) => b.totalVencido - a.totalVencido,
  )

  return {
    totalGeralVencido: Number(totalGeralVencido.toFixed(2)),
    totalClientesInadimplentes: clientesLista.length,
    totalTitulosVencidos,
    totalFaixa1a30: Number(totalFaixa1a30.toFixed(2)),
    totalFaixa31a60: Number(totalFaixa31a60.toFixed(2)),
    totalFaixa61a90: Number(totalFaixa61a90.toFixed(2)),
    totalFaixaMais90: Number(totalFaixaMais90.toFixed(2)),
    clientes: clientesLista,
  }
}
