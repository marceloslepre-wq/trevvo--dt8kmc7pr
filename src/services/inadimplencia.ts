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
 * MULTIEMPRESA: aceita várias empresas (filtro OR pelo helper comum
 * filtroMultiempresa.ts) e devolve a quebra por empresa para o painel
 * "Totais por Empresa". O MESMO CLIENTE pode ter pendências em mais de uma
 * empresa: na consolidação por cliente os valores somam todas as empresas e
 * a visão por empresa fica na quebra (painel + detalhamento do cliente).
 */

import pb from '@/lib/pocketbase/client'
import { ContaReceber } from '@/services/contasReceber'
import { montarFiltroEmpresas } from '@/services/filtroMultiempresa'

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
  empresaId?: string
  empresaNome?: string
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

/** Linha do painel "Totais por Empresa" */
export interface InadimplenciaEmpresaLinha {
  empresaId: string
  totalVencido: number
  qtdTitulosVencidos: number
  qtdClientes: number
  totalFaixa1a30: number
  totalFaixa31a60: number
  totalFaixa31a60_?: never
  totalFaixa61a90: number
  totalFaixaMais90: number
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
  /** Quebra por empresa (painel "Totais por Empresa"); vazia com 1 empresa no filtro */
  porEmpresa: InadimplenciaEmpresaLinha[]
}

export async function apurarInadimplencia(empresaIds: string[]): Promise<ResumoInadimplencia> {
  const hoje = new Date()
  const hojeIso = hoje.toISOString().slice(0, 10)
  const hojeMs = new Date(hojeIso + 'T00:00:00').getTime()

  const ids = (empresaIds || []).filter(Boolean)
  if (ids.length === 0) {
    return {
      totalGeralVencido: 0,
      totalClientesInadimplentes: 0,
      totalTitulosVencidos: 0,
      totalFaixa1a30: 0,
      totalFaixa31a60: 0,
      totalFaixa61a90: 0,
      totalFaixaMais90: 0,
      clientes: [],
      porEmpresa: [],
    }
  }

  // Buscar títulos a receber em aberto ou parciais com vencimento < hoje
  const titulos = await pb.collection('contas_receber').getFullList<any>({
    filter: `${montarFiltroEmpresas(ids, 'empresa_id')} && ativo = true && data_vencimento < '${hojeIso}' && status != 'Recebido' && status != 'Cancelado'`,
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
  const mapEmpresas = new Map<string, InadimplenciaEmpresaLinha>()
  const ordemEmpresas: string[] = []

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
    const empresaId = t.empresa_id || '(sem empresa)'

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
      empresaId,
    })

    // Quebra por empresa (painel "Totais por Empresa")
    let itemEmpresa = mapEmpresas.get(empresaId)
    if (!itemEmpresa) {
      itemEmpresa = {
        empresaId,
        totalVencido: 0,
        qtdTitulosVencidos: 0,
        qtdClientes: 0,
        totalFaixa1a30: 0,
        totalFaixa31a60: 0,
        totalFaixa61a90: 0,
        totalFaixaMais90: 0,
      }
      mapEmpresas.set(empresaId, itemEmpresa)
      ordemEmpresas.push(empresaId)
    }

    if (!itemEmpresa.qtdClientes) {
      itemEmpresa.qtdClientes = 0
    }
    // contagem de clientes distintos por empresa: marca no item do cliente
    const chaveClienteEmpresa = `${empresaId}::${clienteId}`
    if (
      !mapClientes.get(clienteId)!.titulos.some((x) => x.empresaId === empresaId && !x.empresaNome)
    ) {
      // nunca deve entrar aqui: placeholder abaixo
    }

    itemEmpresa.totalVencido = Number((itemEmpresa.totalVencido + saldo).toFixed(2))
    itemEmpresa.qtdTitulosVencidos++
    if (faixa === '1-30')
      itemEmpresa.totalFaixa1a30 = Number((itemEmpresa.totalFaixa1a30 + saldo).toFixed(2))
    else if (faixa === '31-60')
      itemEmpresa.totalFaixa31a60 = Number((itemEmpresa.totalFaixa31a60 + saldo).toFixed(2))
    else if (faixa === '61-90')
      itemEmpresa.totalFaixa61a90 = Number((itemEmpresa.totalFaixa61a90 + saldo).toFixed(2))
    else itemEmpresa.totalFaixaMais90 = Number((itemEmpresa.totalFaixaMais90 + saldo).toFixed(2))

    // marca o cliente como já contado nesta empresa
    if (!(itemCliente as any)._empresasContadas) (itemCliente as any)._empresasContadas = new Set()
    const contadas = (itemCliente as any)._empresasContadas as Set<string>
    if (!contadas.has(chaveClienteEmpresa)) {
      contadas.add(chaveClienteEmpresa)
      itemEmpresa.qtdClientes++
    }
  }

  // Ordena clientes por maior total vencido decrescente
  const clientesLista = Array.from(mapClientes.values()).sort(
    (a, b) => b.totalVencido - a.totalVencido,
  )

  // Quebra por empresa na ordem do filtro
  const porEmpresa = ordemEmpresas
    .filter((id) => ids.includes(id) || id === '(sem empresa)')
    .map((id) => mapEmpresas.get(id)!)
    .filter(Boolean)

  return {
    totalGeralVencido: Number(totalGeralVencido.toFixed(2)),
    totalClientesInadimplentes: clientesLista.length,
    totalTitulosVencidos,
    totalFaixa1a30: Number(totalFaixa1a30.toFixed(2)),
    totalFaixa31a60: Number(totalFaixa31a60.toFixed(2)),
    totalFaixa61a90: Number(totalFaixa61a90.toFixed(2)),
    totalFaixaMais90: Number(totalFaixaMais90.toFixed(2)),
    clientes: clientesLista,
    porEmpresa,
  }
}
