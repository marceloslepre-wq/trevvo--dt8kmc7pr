import pb from '@/lib/pocketbase/client'
import {
  CanalMargem,
  FaixaMargem,
  IMPOSTOS_PADRAO,
  ImpostosVendaPerfil,
  RegraPerfilVenda,
  ResultadoMargemCanal,
  calcularMargemCanal,
  faixaMargem,
  impostosDasRegras,
  listarCanaisMargem,
} from '@/services/canaisMargem'
import { calcularCustoFinal } from '@/services/produtos'

/**
 * Relatório "Margem por canal" (Relatórios) e aviso do Painel.
 * Mesmo cálculo da aba Preços do produto (MargemPorCanal): preço no canal = preço próprio
 * gravado no canal ou (preço da loja do canal, ou preço geral) + acréscimo do canal; valor
 * recebido gravado (importação Amazon/Shopee, Preencher do Mercado Livre ou digitado).
 * A margem usada nas faixas é a margem líquida sobre o valor recebido, como na aba Preços.
 */

export interface ProdutoMargem {
  id: string
  codigo: number
  descricao: string
  ativo: boolean
  custo: number
  precoGeral: number
  perfilId: string
  grupoId: string
  categoriaId: string
  marcaId: string
}

export interface CelulaMargem {
  canalId: string
  /** true = o produto tem preço ou valor recebido gravado neste canal. */
  temDados: boolean
  precoProprio: boolean
  r: ResultadoMargemCanal
  /** null quando o produto não tem custo ou preço (margem sem sentido). */
  faixa: FaixaMargem | null
  unidades: number
  faturamento: number
  vendasEm: string
}

export interface LinhaMargem {
  produto: ProdutoMargem
  celulas: Record<string, CelulaMargem>
  semCusto: boolean
  /** Nenhuma nota de entrada lançada no Trevvo atualizou o custo (custo veio do cadastro/importação). */
  custoSemEntrada: boolean
  unidadesTotal: number
  faturamentoTotal: number
}

export interface BaseMargens {
  canais: CanalMargem[]
  linhas: LinhaMargem[]
}

type RegistroProduto = {
  id: string
  codigo?: number
  descricao?: string
  ativo?: boolean
  preco_venda?: number
  custo_final?: number
  preco_custo?: number
  outras_despesas_percentual?: number
  rebaixa_percentual?: number
  perfil_tributario_id?: string
  grupo_id?: string
  categoria_id?: string
  marca_id?: string
}

const CAMPOS_PRODUTO =
  'id,codigo,descricao,ativo,preco_venda,custo_final,preco_custo,outras_despesas_percentual,rebaixa_percentual,perfil_tributario_id,grupo_id,categoria_id,marca_id'

function paraProduto(p: RegistroProduto): ProdutoMargem {
  const custo =
    Number(p.custo_final) ||
    calcularCustoFinal(
      Number(p.preco_custo) || 0,
      Number(p.outras_despesas_percentual) || 0,
      Number(p.rebaixa_percentual) || 0,
    )
  return {
    id: p.id,
    codigo: Number(p.codigo) || 0,
    descricao: p.descricao || '',
    ativo: p.ativo !== false,
    custo,
    precoGeral: Number(p.preco_venda) || 0,
    perfilId: p.perfil_tributario_id || '',
    grupoId: p.grupo_id || '',
    categoriaId: p.categoria_id || '',
    marcaId: p.marca_id || '',
  }
}

type LinhaPrecoCanal = {
  produto_id: string
  canal_id: string
  preco?: number
  valor_recebido?: number
  unidades_vendidas?: number
  vendas_atualizadas_em?: string
  expand?: { produto_id?: RegistroProduto }
}

export async function carregarBaseMargens(params: {
  assinanteId: string | null
  /** Inclui produtos ativos sem preço/recebido gravado em nenhum canal (margem só pela regra). */
  incluirAtivosSemDados?: boolean
  /** Verifica se o custo já foi atualizado por nota de entrada (consulta a mais). */
  verificarEntradas?: boolean
}): Promise<BaseMargens> {
  const { assinanteId, incluirAtivosSemDados = false, verificarEntradas = false } = params
  const filtroAssinante = assinanteId ? pb.filter('assinante_id = {:a}', { a: assinanteId }) : ''

  const canais = (await listarCanaisMargem(assinanteId, true)).filter((c) => !!c.id)

  const camposExpand = CAMPOS_PRODUTO.split(',')
    .map((c) => 'expand.produto_id.' + c)
    .join(',')
  const precosCanal = await pb.collection('produtos_precos_canal').getFullList<LinhaPrecoCanal>({
    filter: filtroAssinante,
    expand: 'produto_id',
    fields:
      'produto_id,canal_id,preco,valor_recebido,unidades_vendidas,vendas_atualizadas_em,' +
      camposExpand,
    batch: 500,
    requestKey: null,
  })

  const produtos = new Map<string, ProdutoMargem>()
  for (const l of precosCanal) {
    const p = l.expand?.produto_id
    if (p?.id && !produtos.has(p.id)) produtos.set(p.id, paraProduto(p))
  }
  if (incluirAtivosSemDados) {
    const ativos = await pb.collection('produtos').getFullList<RegistroProduto>({
      filter: [filtroAssinante, 'ativo = true'].filter(Boolean).join(' && '),
      fields: CAMPOS_PRODUTO,
      batch: 1000,
      requestKey: null,
    })
    for (const p of ativos) if (!produtos.has(p.id)) produtos.set(p.id, paraProduto(p))
  }

  const precosLoja = new Map<string, number>()
  try {
    const lista = await pb.collection('produtos_precos_empresa').getFullList<{
      produto_id: string
      empresa_id: string
      preco_venda: number
    }>({
      filter: filtroAssinante,
      fields: 'produto_id,empresa_id,preco_venda',
      batch: 1000,
      requestKey: null,
    })
    for (const x of lista)
      if (Number(x.preco_venda) > 0)
        precosLoja.set(x.produto_id + '|' + x.empresa_id, Number(x.preco_venda))
  } catch {
    /* sem preços por loja */
  }

  const impostosPerfil = new Map<string, ImpostosVendaPerfil>()
  try {
    const regras = await pb.collection('perfis_tributarios_regras').getFullList<RegraPerfilVenda>({
      fields:
        'perfil_id,cenario,cst_icms,aliquota_icms,aliquota_fcp,reducao_bc_icms_percentual,aliquota_pis,aliquota_cofins,ativo',
      batch: 1000,
      requestKey: null,
    })
    const porPerfil = new Map<string, RegraPerfilVenda[]>()
    for (const r of regras) {
      if (!r.perfil_id) continue
      const l = porPerfil.get(r.perfil_id) || []
      l.push(r)
      porPerfil.set(r.perfil_id, l)
    }
    for (const [id, l] of Array.from(porPerfil.entries()))
      impostosPerfil.set(id, impostosDasRegras(l))
  } catch {
    /* usa o padrão */
  }

  const comEntrada = new Set<string>()
  if (verificarEntradas) {
    try {
      const pf = await pb.collection('produtos_fornecedores').getFullList<{ produto_id: string }>({
        filter: "data_ultima_compra != ''",
        fields: 'produto_id',
        batch: 1000,
        requestKey: null,
      })
      for (const x of pf) comEntrada.add(x.produto_id)
    } catch {
      /* sem a informação: não marca nada */
    }
  }

  const gravados = new Map<string, LinhaPrecoCanal>()
  for (const l of precosCanal) gravados.set(l.produto_id + '|' + l.canal_id, l)

  const linhas: LinhaMargem[] = []
  for (const produto of Array.from(produtos.values())) {
    const impostos = (produto.perfilId && impostosPerfil.get(produto.perfilId)) || IMPOSTOS_PADRAO
    const celulas: Record<string, CelulaMargem> = {}
    let unidadesTotal = 0
    let faturamentoTotal = 0
    for (const canal of canais) {
      const canalId = canal.id as string
      const g = gravados.get(produto.id + '|' + canalId)
      const precoGravado = Number(g?.preco) > 0 ? Number(g?.preco) : null
      const recebido = Number(g?.valor_recebido) > 0 ? Number(g?.valor_recebido) : null
      const loja = canal.empresa_id
        ? precosLoja.get(produto.id + '|' + canal.empresa_id)
        : undefined
      const base = loja !== undefined ? loja : produto.precoGeral
      const regra = Number(
        (base * (1 + (Number(canal.acrescimo_percentual) || 0) / 100)).toFixed(2),
      )
      const preco = precoGravado !== null ? precoGravado : regra
      const r = calcularMargemCanal(preco, produto.custo, canal, impostos, recebido)
      const unidades = Number(g?.unidades_vendidas) || 0
      const faturamento = unidades * preco
      unidadesTotal += unidades
      faturamentoTotal += faturamento
      celulas[canalId] = {
        canalId,
        temDados: !!g && (precoGravado !== null || recebido !== null),
        precoProprio: precoGravado !== null,
        r,
        faixa: produto.custo > 0 && preco > 0 ? faixaMargem(r.margemSobreRecebido) : null,
        unidades,
        faturamento,
        vendasEm: g?.vendas_atualizadas_em || '',
      }
    }
    linhas.push({
      produto,
      celulas,
      semCusto: !(produto.custo > 0),
      custoSemEntrada: verificarEntradas && !comEntrada.has(produto.id),
      unidadesTotal,
      faturamentoTotal,
    })
  }
  return { canais, linhas }
}

export interface ResumoCanal {
  canal: CanalMargem
  produtos: number
  vermelha: number
  amarela: number
  verde: number
  semCusto: number
  margemMedia: number
}

/** Contagem por canal, só dos produtos com preço/recebido gravado no canal. */
export function resumirPorCanal(base: BaseMargens): ResumoCanal[] {
  return base.canais.map((canal) => {
    const id = canal.id as string
    let produtos = 0
    let vermelha = 0
    let amarela = 0
    let verde = 0
    let semCusto = 0
    let soma = 0
    let comFaixa = 0
    for (const l of base.linhas) {
      const c = l.celulas[id]
      if (!c || !c.temDados) continue
      produtos++
      if (!c.faixa) {
        semCusto++
        continue
      }
      comFaixa++
      soma += c.r.margemSobreRecebido
      if (c.faixa === 'vermelha') vermelha++
      else if (c.faixa === 'amarela') amarela++
      else verde++
    }
    return {
      canal,
      produtos,
      vermelha,
      amarela,
      verde,
      semCusto,
      margemMedia: comFaixa ? soma / comFaixa : 0,
    }
  })
}
