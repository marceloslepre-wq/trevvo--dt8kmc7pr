import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowLeft,
  Camera,
  CheckCircle,
  Clock,
  Loader2,
  Minus,
  Package,
  Plus,
  ScanLine,
  ShoppingCart,
  Trash2,
  User,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { AcessoNegado } from '@/components/AcessoNegado'
import ErrorBoundaryGlobal from '@/components/ErrorBoundaryGlobal'
import { useAuth } from '@/contexts/AuthContext'
import { useEmpresaAtiva } from '@/contexts/EmpresaContext'
import { usePermissoes } from '@/contexts/PermissoesContext'
import { useToast } from '@/hooks/use-toast'
import { useCameraLeitor } from '@/pages/movel/useCameraLeitor'
import { listarProdutos, type Produto } from '@/services/produtos'
import pb from '@/lib/pocketbase/client'
import { obterSessaoAbertaOperador, abrirSessaoCaixa, type CaixaSessao } from '@/services/caixa'
import { listarTerminais, type PdvTerminal } from '@/services/terminais'
import { resolverOperadorErpId } from '@/services/operadorErp'
import {
  obterOuCriarConfigVendasEmpresa,
  obterOuCriarConsumidorFinal,
  type ConfigVendasEmpresa,
} from '@/services/configVendas'
import { listarFormasPagamento, type FormaPagamento } from '@/services/formasPagamento'
import { listarContasFinanceiras, type ContaFinanceira } from '@/services/contasFinanceiras'
import { listarTodasCondicoesAtivas, type CondicaoPagamento } from '@/services/condicoesPagamento'
import {
  salvarVenda,
  finalizarVenda,
  type SalvarVendaInput,
  type ItemCarrinhoPDV,
} from '@/services/vendas'
import type { ConfigEmissaoFiscal } from '@/services/configEmissaoFiscal'
import { obterConfigFiscalEmpresa } from '@/services/configEmissaoFiscal'
import { emitirNFCeVenda } from '@/services/fiscalIntegracao'
import { ModalPagamentoPDV } from '@/pages/vendas/pdv/ModalPagamentoPDV'

type PagamentoPDV = Array<{
  forma_pagamento_id: string
  valor: number
  parcelas?: number
  bandeira?: string
  nsu?: string
  codigo_autorizacao?: string
  conta_financeira_id?: string
  condicao_pagamento_id?: string
}>

type StatusNfce = 'Autorizada' | 'Processando' | 'Rejeitada' | 'NaoEmitida'

const formatarMoeda = (v: unknown) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
    Number.isFinite(Number(v)) ? Number(v) : 0,
  )

const urlFoto = (p: Produto): string | null => {
  if (!p.foto) return null
  try {
    return pb.files.getURL(p, p.foto, { thumb: '200x200' })
  } catch {
    return null
  }
}

const precoVendaProduto = (p: Produto) =>
  p.preco_promocional && p.preco_promocional > 0 ? p.preco_promocional : p.preco_venda || 0

/** Venda pelo celular (Trevvo Móvel, parte 2a): carrinho + pagamento + NFC-e. */
export default function MovelVendaPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { usuarioERP, pode } = usePermissoes()
  const { empresaAtiva, assinanteId, empresas, selecionarEmpresa } = useEmpresaAtiva()
  const { toast } = useToast()

  // ---- Caixa / terminais ----
  const [faseCaixa, setFaseCaixa] = useState<'carregando' | 'semCaixa' | 'pronto'>('carregando')
  const [sessaoCaixa, setSessaoCaixa] = useState<CaixaSessao | null>(null)
  const [terminais, setTerminais] = useState<PdvTerminal[]>([])
  const [ocupados, setOcupados] = useState<Array<{ terminal: string; usuario: string }>>([])
  const [terminalLivreId, setTerminalLivreId] = useState('')
  const [fundoTrocoStr, setFundoTrocoStr] = useState('0,00')
  const [abrindoCaixa, setAbrindoCaixa] = useState(false)

  // ---- Configurações (mesmas do PDV) ----
  const [configVendas, setConfigVendas] = useState<ConfigVendasEmpresa | null>(null)
  const [configFiscal, setConfigFiscal] = useState<ConfigEmissaoFiscal | null>(null)
  const [formas, setFormas] = useState<FormaPagamento[]>([])
  const [contas, setContas] = useState<ContaFinanceira[]>([])
  const [condicoes, setCondicoes] = useState<CondicaoPagamento[]>([])

  // ---- Busca (igual à de /movel/consulta) ----
  const [termo, setTermo] = useState('')
  const [resultados, setResultados] = useState<Produto[]>([])
  const [buscando, setBuscando] = useState(false)
  const [erroBusca, setErroBusca] = useState<string | null>(null)
  const [avisoCamera, setAvisoCamera] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const timerBuscaRef = useRef<number | null>(null)
  const seqBuscaRef = useRef(0)
  const montadoRef = useRef(true)
  const timerAddRef = useRef<number | null>(null)
  const resultadosRef = useRef<Produto[]>([])
  resultadosRef.current = resultados

  // ---- Carrinho / venda ----
  const [carrinho, setCarrinho] = useState<ItemCarrinhoPDV[]>([])
  const [cpfCnpjCupom, setCpfCnpjCupom] = useState('')
  const [erroCpf, setErroCpf] = useState<string | null>(null)
  const [modalPagamentoAberto, setModalPagamentoAberto] = useState(false)
  const [finalizando, setFinalizando] = useState(false)
  const [concluida, setConcluida] = useState<{
    numero: number
    total: number
    status: StatusNfce
    mensagem: string
  } | null>(null)

  const permitido = pode('pdv', 'criar')

  useEffect(() => {
    montadoRef.current = true
    return () => {
      montadoRef.current = false
      if (timerBuscaRef.current) window.clearTimeout(timerBuscaRef.current)
      if (timerAddRef.current) window.clearTimeout(timerAddRef.current)
    }
  }, [])

  // Totais derivados — useMemo, sem efeito que escreva estado.
  const subtotal = useMemo(
    () => Number(carrinho.reduce((acc, it) => acc + it.valor_total, 0).toFixed(2)),
    [carrinho],
  )
  const totalItens = useMemo(() => carrinho.reduce((acc, it) => acc + it.quantidade, 0), [carrinho])
  const terminaisLivres = useMemo(() => {
    const nomesOcupados = new Set(ocupados.map((o) => o.terminal))
    return terminais.filter((t) => t.ativo && !nomesOcupados.has(t.nome))
  }, [terminais, ocupados])

  // ---- Carrega caixa, terminais e configurações (mesmas funções do PDV) ----
  const carregarTudo = useCallback(
    async (forcarSessao = false) => {
      if (!empresaAtiva?.id) return
      setFaseCaixa('carregando')
      try {
        const operadorErpId = usuarioERP?.id || (await resolverOperadorErpId()) || ''
        if (!operadorErpId) {
          setFaseCaixa('semCaixa')
          return
        }
        let sessao = await obterSessaoAbertaOperador(empresaAtiva.id, operadorErpId).catch(
          () => null,
        )
        // Alinha a empresa ativa à empresa do caixa já aberto (mesma regra do PDV).
        if (!sessao && !forcarSessao) {
          for (const emp of empresas) {
            if (emp.id === empresaAtiva.id) continue
            const s = await obterSessaoAbertaOperador(emp.id, operadorErpId).catch(() => null)
            if (s) {
              selecionarEmpresa(emp.id)
              return
            }
          }
        }
        const [terms, cfg, cfgFiscal, formasPg, contasFin, conds] = await Promise.all([
          listarTerminais(empresaAtiva.id),
          obterOuCriarConfigVendasEmpresa(empresaAtiva.id),
          obterConfigFiscalEmpresa(empresaAtiva.id).catch(() => null),
          listarFormasPagamento(empresaAtiva.id),
          listarContasFinanceiras(empresaAtiva.id),
          listarTodasCondicoesAtivas('Vendas'),
        ])
        if (!montadoRef.current) return
        setTerminais(terms)
        setConfigVendas(cfg)
        setConfigFiscal(cfgFiscal)
        setFormas(formasPg)
        setContas(contasFin)
        setCondicoes(conds)
        setSessaoCaixa(sessao)
        setFaseCaixa(sessao ? 'pronto' : 'semCaixa')
      } catch (err) {
        console.error('Erro ao carregar dados da venda móvel:', err)
        if (montadoRef.current) setFaseCaixa('semCaixa')
      }
    },
    [empresaAtiva?.id, usuarioERP?.id, empresas, selecionarEmpresa],
  )

  useEffect(() => {
    void carregarTudo()
  }, [carregarTudo])

  // Terminais ocupados: sessões abertas da empresa, com o nome de quem está nelas.
  useEffect(() => {
    if (!empresaAtiva?.id || faseCaixa !== 'semCaixa') return
    let cancelado = false
    const carregarOcupados = async () => {
      try {
        const sessoes = await pb.collection('caixa_sessoes').getFullList<{
          pdv_terminal_id?: string
          expand?: {
            pdv_terminal_id?: { nome?: string }
            operador_id?: { nome?: string }
          }
        }>({
          filter: `empresa_id = '${empresaAtiva.id}' && status = 'Aberto' && ativo = true`,
          expand: 'pdv_terminal_id,operador_id',
        })
        if (cancelado) return
        const lista = sessoes
          .filter((s) => s.pdv_terminal_id) // sessão própria já foi descartada acima
          .map((s) => ({
            terminal: s.expand?.pdv_terminal_id?.nome || 'Terminal',
            usuario: s.expand?.operador_id?.nome || 'outro usuário',
          }))
        setOcupados(lista)
      } catch {
        if (!cancelado) setOcupados([])
      }
    }
    void carregarOcupados()
    return () => {
      cancelado = true
    }
  }, [empresaAtiva?.id, faseCaixa, sessaoCaixa])

  // ---- Busca de produtos com debounce (mesma chamada da consulta) ----
  const buscar = useCallback(
    async (texto: string) => {
      const bus = texto.trim()
      if (!bus) {
        setResultados([])
        setErroBusca(null)
        return
      }
      if (!assinanteId || !empresaAtiva) {
        setErroBusca('Empresa não carregada; aguarde ou recarregue a página.')
        return
      }
      seqBuscaRef.current += 1
      const seq = seqBuscaRef.current
      setBuscando(true)
      setErroBusca(null)
      try {
        const res = await listarProdutos({
          busca: bus,
          situacao: 'ativos',
          itensPorPagina: 30,
          ordenacao: 'descricao',
          assinante_id: assinanteId,
        })
        if (seq !== seqBuscaRef.current || !montadoRef.current) return
        setResultados(res.items)
      } catch {
        if (seq === seqBuscaRef.current && montadoRef.current) {
          setResultados([])
          setErroBusca('Não foi possível buscar produtos; tente novamente.')
        }
      } finally {
        if (seq === seqBuscaRef.current && montadoRef.current) setBuscando(false)
      }
    },
    [assinanteId, empresaAtiva?.id],
  )

  const aoDigitar = (texto: string) => {
    setTermo(texto)
    if (timerBuscaRef.current) window.clearTimeout(timerBuscaRef.current)
    timerBuscaRef.current = window.setTimeout(() => void buscar(texto), 300)
  }

  // ---- Carrinho ----
  const adicionarProduto = useCallback((produto: Produto, quantidade = 1) => {
    setCarrinho((prev) => {
      const existente = prev.find((it) => it.produto_id === produto.id)
      if (existente) {
        return prev.map((it) => {
          if (it.produto_id !== produto.id) return it
          const qtd = it.quantidade + quantidade
          return {
            ...it,
            quantidade: qtd,
            valor_total: Number((it.preco_unitario * qtd).toFixed(2)),
          }
        })
      }
      const precoUnit = precoVendaProduto(produto)
      const item: ItemCarrinhoPDV = {
        tempId: Math.random().toString(36).substring(2, 9),
        item: prev.length + 1,
        produto_id: produto.id,
        codigo: produto.codigo,
        descricao: produto.descricao,
        unidade: produto.expand?.unidade_id?.sigla || 'UN',
        quantidade,
        preco_unitario: precoUnit,
        preco_tabela: produto.preco_venda || precoUnit,
        desconto_percentual: 0,
        desconto_valor: 0,
        acrescimo_valor: 0,
        valor_total: Number((precoUnit * quantidade).toFixed(2)),
        foto: produto.foto ? pb.files.getURL(produto, produto.foto) : undefined,
        saldo_estoque: undefined,
        eh_balanca: false,
        ncm: produto.ncm,
        cest: produto.cest,
        cfop: produto.cfop_venda_interna || undefined,
      }
      return [...prev, item]
    })
  }, [])

  const alterarQuantidade = (tempId: string, delta: number) => {
    setCarrinho((prev) =>
      prev
        .map((it) => {
          if (it.tempId !== tempId) return it
          const qtd = it.quantidade + delta
          if (qtd <= 0) return null
          return {
            ...it,
            quantidade: qtd,
            valor_total: Number((it.preco_unitario * qtd).toFixed(2)),
          }
        })
        .filter((it): it is ItemCarrinhoPDV => it !== null),
    )
  }

  const removerItem = (tempId: string) => {
    setCarrinho((prev) => prev.filter((it) => it.tempId !== tempId))
  }

  // ---- Câmera: todo o motor vive no useCameraLeitor (igual à consulta) ----
  const camera = useCameraLeitor({
    aoLer: (codigo) => {
      setAvisoCamera(null)
      setTermo(codigo)
      void buscar(codigo)
      if (timerAddRef.current) window.clearTimeout(timerAddRef.current)
      timerAddRef.current = window.setTimeout(() => {
        if (montadoRef.current && resultadosRef.current.length === 1) {
          adicionarProduto(resultadosRef.current[0], 1)
          setTermo('')
          setResultados([])
        }
      }, 700)
    },
  })
  const { ativa: cameraAtiva, iniciar: abrirCamera, aviso: avisoCameraHook } = camera

  // ---- Abrir caixa (mesma função do PDV/ModalAbrirCaixa) ----
  const abrirCaixa = async () => {
    if (!empresaAtiva?.id) return
    if (!terminalLivreId) {
      toast({
        title: 'Atenção',
        description: 'Selecione um terminal livre para abrir o caixa.',
        variant: 'destructive',
      })
      return
    }
    const fundo = Number(fundoTrocoStr.replace(/\./g, '').replace(',', '.')) || 0
    if (fundo < 0) {
      toast({
        title: 'Atenção',
        description: 'O fundo de troco não pode ser negativo.',
        variant: 'destructive',
      })
      return
    }
    setAbrindoCaixa(true)
    try {
      const sessao = await abrirSessaoCaixa({
        empresa_id: empresaAtiva.id,
        pdv_terminal_id: terminalLivreId,
        valor_abertura: fundo,
      })
      if (!montadoRef.current) return
      setSessaoCaixa(sessao)
      setFaseCaixa('pronto')
      toast({ title: 'Caixa aberto com sucesso' })
    } catch (err) {
      toast({
        title: 'Falha ao abrir o caixa',
        description: err instanceof Error ? err.message : 'Erro ao abrir caixa.',
        variant: 'destructive',
      })
    } finally {
      if (montadoRef.current) setAbrindoCaixa(false)
    }
  }

  // ---- CPF/CNPJ opcional (validação leve: 11 ou 14 dígitos) ----
  const validarCpfCnpj = (valor: string): string | null => {
    const digitos = valor.replace(/\D/g, '')
    if (!digitos) return null
    if (digitos.length !== 11 && digitos.length !== 14) {
      return 'CPF deve ter 11 dígitos e CNPJ, 14.'
    }
    return null
  }

  // ---- FINALIZAR: mesmas funções do PDV (salvarVenda → finalizarVenda → NFC-e) ----
  const concluirVenda = async (pagamentos: PagamentoPDV, troco: number) => {
    if (!empresaAtiva?.id) return
    if (!sessaoCaixa?.id) throw new Error('Não há sessão de caixa aberta.')
    setFinalizando(true)
    try {
      let clienteIdFinal = ''
      try {
        const consumidor = await obterOuCriarConsumidorFinal(usuarioERP?.assinante_id || undefined)
        clienteIdFinal = consumidor.id
      } catch (errCons) {
        console.warn('Não foi possível resolver o Consumidor Final:', errCons)
      }
      if (!clienteIdFinal) throw new Error('Cliente é obrigatório para registrar a venda.')

      const inputSalvar: SalvarVendaInput = {
        empresa_id: empresaAtiva.id,
        tipo: 'PDV',
        cliente_id: clienteIdFinal,
        cpf_cnpj_consumidor: cpfCnpjCupom || undefined,
        operador_id: usuarioERP?.id || undefined,
        pdv_terminal_id: sessaoCaixa.pdv_terminal_id,
        caixa_sessao_id: sessaoCaixa.id,
        valor_desconto_total: 0,
        itens: carrinho.map((it) => ({
          produto_id: it.produto_id,
          item: it.item,
          descricao: it.descricao,
          unidade: it.unidade,
          quantidade: it.quantidade,
          preco_unitario: it.preco_unitario,
          preco_tabela: it.preco_tabela,
          desconto_percentual: it.desconto_percentual,
          desconto_valor: it.desconto_valor,
          acrescimo_valor: it.acrescimo_valor,
          valor_total: it.valor_total,
          ncm: it.ncm,
          cest: it.cest,
          cfop: it.cfop,
        })),
      }

      const vendaSalva = await salvarVenda(inputSalvar)
      const vendaFinalizada = await finalizarVenda({
        venda_id: vendaSalva.id,
        pagamentos: pagamentos.map((p) => ({
          forma_pagamento_id: p.forma_pagamento_id,
          valor: p.valor,
          parcelas: p.parcelas,
          bandeira: p.bandeira,
          nsu: p.nsu,
          codigo_autorizacao: p.codigo_autorizacao,
          conta_financeira_id: p.conta_financeira_id,
          condicao_pagamento_id: p.condicao_pagamento_id,
        })),
      })

      // NFC-e automática, quando a loja emite no PDV (mesmo critério do PDV)
      const podeEmitirNfce =
        configFiscal &&
        configFiscal.emite_documentos_fiscais &&
        configFiscal.emite_nfce &&
        configFiscal.emitir_nfce_automaticamente_no_pdv

      let status: StatusNfce = 'NaoEmitida'
      let mensagem = ''
      if (podeEmitirNfce) {
        if (!configFiscal.csc_configurado) {
          status = 'Rejeitada'
          mensagem = 'CSC da NFC-e não configurado para esta loja.'
        } else {
          try {
            const resp = await emitirNFCeVenda({ vendaId: vendaSalva.id })
            if (resp.sucesso && resp.status === 'Autorizada') {
              status = 'Autorizada'
            } else if (resp.sucesso) {
              status = 'Processando'
              mensagem = resp.message || 'NFC-e em processamento na SEFAZ.'
            } else {
              status = 'Rejeitada'
              mensagem = resp.message || 'Rejeição na SEFAZ'
            }
          } catch (errNfce) {
            console.error('Erro ao emitir NFC-e no Móvel:', errNfce)
            status = 'Rejeitada'
            mensagem =
              (errNfce as { data?: { message?: string }; message?: string })?.data?.message ||
              (errNfce as { message?: string })?.message ||
              'Falha na emissão da NFC-e.'
          }
        }
      }

      if (!montadoRef.current) return
      setModalPagamentoAberto(false)
      setConcluida({
        numero: vendaFinalizada.numero || 0,
        total: vendaFinalizada.valor_total ?? subtotal,
        status,
        mensagem,
      })
    } finally {
      if (montadoRef.current) setFinalizando(false)
    }
  }

  const novaVenda = () => {
    setConcluida(null)
    setCarrinho([])
    setCpfCnpjCupom('')
    setErroCpf(null)
    setTermo('')
    setResultados([])
    window.setTimeout(() => inputRef.current?.focus(), 60)
  }

  const iniciarPagamento = () => {
    if (carrinho.length === 0) return
    const v = validarCpfCnpj(cpfCnpjCupom)
    if (v) {
      setErroCpf(v)
      return
    }
    setErroCpf(null)
    setModalPagamentoAberto(true)
  }

  const nomeEmpresa = empresaAtiva?.nome_fantasia || empresaAtiva?.razao_social || 'Empresa'

  if (!permitido) return <AcessoNegado />

  // ---------- Concluída ----------
  if (concluida) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col">
        <header className="sticky top-0 z-10 border-b border-slate-200 bg-white">
          <div className="mx-auto flex h-14 max-w-xl items-center gap-2 px-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-slate-900">Venda concluída</p>
              <p className="truncate text-xs text-slate-500">{nomeEmpresa}</p>
            </div>
          </div>
        </header>
        <main className="mx-auto w-full max-w-xl flex-1 px-4 py-6 space-y-4">
          <Card>
            <CardContent className="space-y-3 p-5">
              <div className="flex items-center gap-3">
                {concluida.status === 'Autorizada' ? (
                  <CheckCircle className="h-8 w-8 text-emerald-600" />
                ) : (
                  <AlertTriangle
                    className={`h-8 w-8 ${concluida.status === 'Rejeitada' ? 'text-red-600' : 'text-amber-600'}`}
                  />
                )}
                <div>
                  <p className="text-lg font-bold text-slate-900">
                    Venda nº {concluida.numero} concluída
                  </p>
                  <p className="text-sm text-slate-500">Total: {formatarMoeda(concluida.total)}</p>
                </div>
              </div>
              <div
                className={`rounded-lg border p-3 text-sm ${
                  concluida.status === 'Autorizada'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                    : concluida.status === 'Rejeitada'
                      ? 'border-red-200 bg-red-50 text-red-800'
                      : concluida.status === 'Processando'
                        ? 'border-amber-200 bg-amber-50 text-amber-800'
                        : 'border-slate-200 bg-slate-50 text-slate-700'
                }`}
              >
                <p className="font-semibold">
                  NFC-e:{' '}
                  {concluida.status === 'Autorizada'
                    ? 'Autorizada'
                    : concluida.status === 'Processando'
                      ? 'Processando'
                      : concluida.status === 'Rejeitada'
                        ? 'Rejeitada'
                        : 'Não emitida'}
                </p>
                {concluida.mensagem && <p className="mt-1 text-xs">{concluida.mensagem}</p>}
              </div>
            </CardContent>
          </Card>
          <Button className="h-14 w-full text-base" onClick={novaVenda}>
            <ShoppingCart className="h-5 w-5" /> Nova venda
          </Button>
        </main>
      </div>
    )
  }

  // ---------- Sem caixa aberto: abrir na própria tela ----------
  if (faseCaixa === 'semCaixa') {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col">
        <header className="sticky top-0 z-10 border-b border-slate-200 bg-white">
          <div className="mx-auto flex h-14 max-w-xl items-center gap-2 px-3">
            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10 shrink-0"
              onClick={() => navigate('/movel')}
              aria-label="Voltar"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-slate-900">Abrir caixa</p>
              <p className="truncate text-xs text-slate-500">{nomeEmpresa}</p>
            </div>
          </div>
        </header>
        <main className="mx-auto w-full max-w-xl flex-1 px-4 py-6">
          <ErrorBoundaryGlobal titulo="Não foi possível exibir a abertura de caixa">
            <Card>
              <CardContent className="space-y-4 p-4">
                <div className="space-y-1.5">
                  <label htmlFor="terminal_livre" className="text-sm font-semibold text-slate-700">
                    Terminal livre *
                  </label>
                  <select
                    id="terminal_livre"
                    value={terminalLivreId}
                    onChange={(e) => setTerminalLivreId(e.target.value)}
                    className="h-12 w-full rounded-md border border-slate-300 bg-white px-3 text-base text-slate-900"
                    required
                  >
                    <option value="">Selecione…</option>
                    {terminaisLivres.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.nome}
                      </option>
                    ))}
                  </select>
                  {terminaisLivres.length === 0 && (
                    <p className="text-xs text-amber-700">Nenhum terminal livre nesta empresa.</p>
                  )}
                </div>
                {ocupados.length > 0 && (
                  <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                    {ocupados.map((o, i) => (
                      <p key={i}>
                        <strong>{o.terminal}</strong> está com {o.usuario}.
                      </p>
                    ))}
                  </div>
                )}
                <div className="space-y-1.5">
                  <label htmlFor="fundo_troco" className="text-sm font-semibold text-slate-700">
                    Fundo de troco (R$) *
                  </label>
                  <Input
                    id="fundo_troco"
                    inputMode="decimal"
                    value={fundoTrocoStr}
                    onChange={(e) => setFundoTrocoStr(e.target.value)}
                    onBlur={() =>
                      setFundoTrocoStr(
                        (
                          Number(fundoTrocoStr.replace(/\./g, '').replace(',', '.')) || 0
                        ).toLocaleString('pt-BR', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        }),
                      )
                    }
                    className="h-12 text-base font-mono font-bold"
                    placeholder="0,00"
                  />
                </div>
                <Button
                  className="h-14 w-full text-base"
                  onClick={() => void abrirCaixa()}
                  disabled={abrindoCaixa || terminaisLivres.length === 0}
                >
                  {abrindoCaixa ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Abrir caixa'}
                </Button>
              </CardContent>
            </Card>
          </ErrorBoundaryGlobal>
        </main>
      </div>
    )
  }

  // ---------- Carregando ----------
  if (faseCaixa === 'carregando' || !sessaoCaixa) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    )
  }

  // ---------- Venda ----------
  const avisoCameraFinal = avisoCamera || avisoCameraHook

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-14 max-w-xl items-center gap-2 px-3">
          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10 shrink-0"
            onClick={() => navigate('/movel')}
            aria-label="Voltar"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-slate-900">Nova venda</p>
            <p className="flex items-center gap-1 truncate text-xs text-slate-500">
              <User className="h-3 w-3" /> {user?.name || 'Usuário'} · {nomeEmpresa}
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-xl flex-1 px-3 pb-40 pt-3">
        <ErrorBoundaryGlobal titulo="Não foi possível exibir a busca de produtos">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <ScanLine className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  ref={inputRef}
                  value={termo}
                  onChange={(e) => aoDigitar(e.target.value)}
                  placeholder="Buscar produto (nome, código, EAN)…"
                  className="h-12 pl-9 text-base"
                  inputMode="search"
                />
              </div>
              <Button
                type="button"
                size="icon"
                className="h-12 w-12 shrink-0"
                onClick={() => (cameraAtiva ? undefined : abrirCamera())}
                aria-label="Ler código com a câmera"
              >
                <Camera className="h-5 w-5" />
              </Button>
            </div>

            {(buscando || erroBusca || avisoCameraFinal) && (
              <div className="space-y-1">
                {buscando && (
                  <p className="flex items-center gap-2 px-1 text-xs text-slate-500">
                    <Loader2 className="h-3 w-3 animate-spin" /> Buscando…
                  </p>
                )}
                {erroBusca && <p className="px-1 text-xs text-red-600">{erroBusca}</p>}
                {avisoCameraFinal && (
                  <p className="px-1 text-xs text-amber-700">{avisoCameraFinal}</p>
                )}
              </div>
            )}

            {resultados.length > 0 && (
              <div className="space-y-2">
                <p className="px-1 text-xs font-medium uppercase tracking-wide text-slate-500">
                  Toque no produto para adicionar
                </p>
                {resultados.map((p) => (
                  <Card key={p.id}>
                    <CardContent className="p-0">
                      <button
                        type="button"
                        onClick={() => {
                          adicionarProduto(p, 1)
                          setTermo('')
                          setResultados([])
                          window.setTimeout(() => inputRef.current?.focus(), 50)
                        }}
                        className="flex w-full items-center gap-3 p-3 text-left"
                      >
                        {urlFoto(p) ? (
                          <img
                            src={urlFoto(p) || ''}
                            alt=""
                            className="h-12 w-12 shrink-0 rounded-md object-cover"
                          />
                        ) : (
                          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-slate-100">
                            <Package className="h-5 w-5 text-slate-400" />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-slate-900">
                            {p.descricao}
                          </p>
                          <p className="truncate text-xs text-slate-500">
                            Ref.: {p.referencia || '—'} · EAN: {p.gtin || '—'}
                          </p>
                        </div>
                        <span className="shrink-0 text-sm font-bold text-emerald-700">
                          {formatarMoeda(precoVendaProduto(p))}
                        </span>
                      </button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            <div className="space-y-2">
              <p className="px-1 text-xs font-medium uppercase tracking-wide text-slate-500">
                Carrinho ({totalItens} {totalItens === 1 ? 'item' : 'itens'})
              </p>
              {carrinho.length === 0 ? (
                <Card>
                  <CardContent className="p-4 text-center text-xs text-slate-500">
                    Nenhum item ainda. Busque e toque no produto para adicionar.
                  </CardContent>
                </Card>
              ) : (
                carrinho.map((it) => (
                  <Card key={it.tempId}>
                    <CardContent className="flex items-center gap-2 p-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-900">
                          {it.descricao}
                        </p>
                        <p className="text-xs text-slate-500">
                          {formatarMoeda(it.preco_unitario)} / {it.unidade} ·{' '}
                          <span className="font-semibold text-slate-700">
                            {formatarMoeda(it.valor_total)}
                          </span>
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <Button
                          type="button"
                          size="icon"
                          variant="outline"
                          className="h-10 w-10"
                          aria-label="Diminuir quantidade"
                          onClick={() => alterarQuantidade(it.tempId, -1)}
                        >
                          <Minus className="h-4 w-4" />
                        </Button>
                        <span className="w-8 text-center text-sm font-bold text-slate-900">
                          {it.quantidade}
                        </span>
                        <Button
                          type="button"
                          size="icon"
                          variant="outline"
                          className="h-10 w-10"
                          aria-label="Aumentar quantidade"
                          onClick={() => alterarQuantidade(it.tempId, 1)}
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-10 w-10 text-red-600"
                          aria-label="Remover item"
                          onClick={() => removerItem(it.tempId)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </div>
        </ErrorBoundaryGlobal>
      </main>

      {/* Rodapé fixo: CPF opcional + total + FINALIZAR */}
      <footer className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white">
        <div className="mx-auto w-full max-w-xl space-y-2 px-3 py-3">
          <div>
            <Input
              value={cpfCnpjCupom}
              onChange={(e) => {
                setCpfCnpjCupom(e.target.value)
                if (erroCpf) setErroCpf(null)
              }}
              placeholder="CPF/CNPJ do cliente (opcional)"
              className="h-12 text-base"
              inputMode="numeric"
            />
            {erroCpf && <p className="mt-1 px-1 text-xs text-red-600">{erroCpf}</p>}
          </div>
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Total ({totalItens} un)
              </p>
              <p className="truncate text-2xl font-black text-emerald-700">
                {formatarMoeda(subtotal)}
              </p>
            </div>
            <Button
              className="h-14 w-40 shrink-0 text-base font-extrabold"
              onClick={iniciarPagamento}
              disabled={carrinho.length === 0}
            >
              FINALIZAR
            </Button>
          </div>
        </div>
      </footer>

      {/* Pagamento: o MESMO modal/validações do PDV */}
      {modalPagamentoAberto && (
        <ModalPagamentoPDV
          aberto={modalPagamentoAberto}
          onOpenChange={(ab) => {
            setModalPagamentoAberto(ab)
          }}
          totalVenda={subtotal}
          cliente={null}
          formas={formas}
          contas={contas}
          condicoes={condicoes}
          contaPadraoCaixaId={undefined}
          empresaId={empresaAtiva?.id || ''}
          onConfirmar={async (pagamentos, troco) => {
            await concluirVenda(pagamentos, troco)
          }}
        />
      )}

      {/* Overlay de carregamento sobre o modal durante a finalização */}
      {finalizando && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30">
          <div className="flex items-center gap-2 rounded-lg bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-lg">
            <Clock className="h-4 w-4 animate-pulse text-blue-600" />
            Concluindo venda…
          </div>
        </div>
      )}
    </div>
  )
}
