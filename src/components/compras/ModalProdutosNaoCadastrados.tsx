import { useState, useEffect } from 'react'
import { NotaEntradaItem } from '@/services/notasEntrada'
import { Empresa } from '@/services/empresas'
import {
  ItemNaoCadastradoInput,
  processarCadastroAutomaticoProdutos,
  resolverUnidadeMedida,
} from '@/services/cadastroAutomaticoProdutos'
import {
  listarTodosGruposAtivos,
  listarCategoriasPorGrupo,
  Grupo,
  Categoria,
} from '@/services/gruposCategorias'
import { listarTodasUnidadesMedidaAtivas, UnidadeMedida } from '@/services/unidadesMedida'
import { obterConfigFiscalEmpresa } from '@/services/configFiscal'
import { buscarProdutosParaVinculo, Produto } from '@/services/produtos'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Sparkles,
  ShoppingBag,
  Loader2,
  Search,
  Link as LinkIcon,
  PlusCircle,
  HelpCircle,
  AlertCircle,
} from 'lucide-react'

export interface ModalProdutosNaoCadastradosProps {
  aberto: boolean
  onOpenChange: (aberto: boolean) => void
  notaId: string
  notaInfo: {
    modelo?: string
    serie?: string
    numero?: string
    fornecedorNome?: string
    dataEmissao?: string
  }
  fornecedorId: string
  empresa: Partial<Empresa>
  itensSemProduto: NotaEntradaItem[]
  tipoEntrada?: string
  ufFornecedor?: string
  onConcluido: () => void
}

export function ModalProdutosNaoCadastrados({
  aberto,
  onOpenChange,
  notaId,
  notaInfo,
  fornecedorId,
  empresa,
  itensSemProduto,
  tipoEntrada,
  ufFornecedor,
  onConcluido,
}: ModalProdutosNaoCadastradosProps) {
  const [carregando, setCarregando] = useState(false)
  const [processando, setProcessando] = useState(false)

  // Configurações globais do lote
  const [grupos, setGrupos] = useState<Grupo[]>([])
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [unidades, setUnidades] = useState<UnidadeMedida[]>([])
  const [grupoPadraoId, setGrupoPadraoId] = useState<string>('')
  const [categoriaPadraoId, setCategoriaPadraoId] = useState<string>('')
  const [margemPadrao, setMargemPadrao] = useState<string>('50')
  const [aplicarFiscal, setAplicarFiscal] = useState<boolean>(true)

  // Itens na tabela
  const [itens, setItens] = useState<ItemNaoCadastradoInput[]>([])

  // Busca de produto existente para vincular em linha específica
  const [buscaProdutoTexto, setBuscaProdutoTexto] = useState<Record<string, string>>({})
  const [produtosEncontrados, setProdutosEncontrados] = useState<Record<string, Produto[]>>({})
  const [buscandoProduto, setBuscandoProduto] = useState<Record<string, boolean>>({})

  useEffect(() => {
    if (aberto) {
      inicializarDados()
    }
  }, [aberto, itensSemProduto])

  async function inicializarDados() {
    setCarregando(true)
    try {
      const [gruposList, unidadesList, config] = await Promise.all([
        listarTodosGruposAtivos(),
        listarTodasUnidadesMedidaAtivas(),
        empresa.id ? obterConfigFiscalEmpresa(empresa.id) : null,
      ])

      setGrupos(gruposList)
      setUnidades(unidadesList)

      const margem =
        config?.margem_padrao_percentual !== undefined
          ? String(config.margem_padrao_percentual)
          : '50'
      setMargemPadrao(margem)

      if (config?.grupo_padrao_id) {
        setGrupoPadraoId(config.grupo_padrao_id)
        const cats = await listarCategoriasPorGrupo(config.grupo_padrao_id)
        setCategorias(cats)
        if (config?.categoria_padrao_id) {
          setCategoriaPadraoId(config.categoria_padrao_id)
        }
      }

      // Monta as linhas
      const linhas: ItemNaoCadastradoInput[] = []
      for (const item of itensSemProduto) {
        const uResolvida = await resolverUnidadeMedida(
          item.unidade_fornecedor || item.unidade_xml || 'UN',
          unidadesList,
        )
        const custo =
          item.custo_unitario_estoque ||
          item.valor_unitario_fornecedor ||
          item.valor_unitario_xml ||
          0
        const margemNum = parseFloat(margem) || 50
        const precoVenda = custo > 0 ? Number((custo * (1 + margemNum / 100)).toFixed(2)) : 0

        linhas.push({
          itemNota: item,
          criar: true,
          descricao: (item.descricao_fornecedor || '').slice(0, 120),
          unidadeCompra: item.unidade_fornecedor || item.unidade_xml || 'UN',
          unidadeVendaId: uResolvida ? uResolvida.id : unidadesList[0]?.id || '',
          fatorConversao: 1,
          precoCusto: custo,
          margemPercentual: margemNum,
          precoVenda,
          ncm: item.ncm_fornecedor || item.ncm_xml || '',
          cest: item.cest_fornecedor || item.cest_xml || '',
          gtin: item.gtin_fornecedor || item.codigo_barras_xml || '',
        })
      }
      setItens(linhas)
    } finally {
      setCarregando(false)
    }
  }

  async function handleGrupoChange(novoGrupoId: string) {
    setGrupoPadraoId(novoGrupoId)
    setCategoriaPadraoId('')
    if (novoGrupoId) {
      try {
        const cats = await listarCategoriasPorGrupo(novoGrupoId)
        setCategorias(cats)
      } catch {
        setCategorias([])
      }
    } else {
      setCategorias([])
    }
  }

  function handleMargemPadraoChange(novaMargemStr: string) {
    setMargemPadrao(novaMargemStr)
    const margemNum = parseFloat(novaMargemStr) || 0
    // Recalcula precoVenda de todos os itens com criar = true
    setItens((prev) =>
      prev.map((it) => {
        const novoPreco =
          it.precoCusto > 0 ? Number((it.precoCusto * (1 + margemNum / 100)).toFixed(2)) : 0
        return {
          ...it,
          margemPercentual: margemNum,
          precoVenda: novoPreco,
        }
      }),
    )
  }

  function toggleSelecionarTodos(checked: boolean) {
    setItens((prev) => prev.map((it) => ({ ...it, criar: checked })))
  }

  function atualizarItem(index: number, campos: Partial<ItemNaoCadastradoInput>) {
    setItens((prev) => {
      const clone = [...prev]
      clone[index] = { ...clone[index], ...campos }
      return clone
    })
  }

  async function handleBuscarProdutoExistente(itemId: string, termo: string) {
    setBuscaProdutoTexto((prev) => ({ ...prev, [itemId]: termo }))
    if (!termo || termo.trim().length < 2) {
      setProdutosEncontrados((prev) => ({ ...prev, [itemId]: [] }))
      return
    }

    setBuscandoProduto((prev) => ({ ...prev, [itemId]: true }))
    try {
      const res = await buscarProdutosParaVinculo(termo)
      setProdutosEncontrados((prev) => ({ ...prev, [itemId]: res }))
    } catch {
      setProdutosEncontrados((prev) => ({ ...prev, [itemId]: [] }))
    } finally {
      setBuscandoProduto((prev) => ({ ...prev, [itemId]: false }))
    }
  }

  async function handleConfirmarCriacao() {
    const selecionados = itens.filter((it) => it.criar || it.vincularProdutoId)
    if (selecionados.length === 0) {
      onOpenChange(false)
      return
    }

    setProcessando(true)
    try {
      await processarCadastroAutomaticoProdutos({
        notaId,
        notaInfo,
        fornecedorId,
        empresa,
        itensParaProcessar: itens,
        grupoId: grupoPadraoId || undefined,
        categoriaId: categoriaPadraoId || undefined,
        margemPadrao: parseFloat(margemPadrao) || 50,
        aplicarClassificacaoFiscal: aplicarFiscal,
        tipoEntrada,
        ufFornecedor,
      })

      onOpenChange(false)
      onConcluido()
    } catch (err: any) {
      console.error('Erro ao processar cadastro automático:', err)
    } finally {
      setProcessando(false)
    }
  }

  const totalCriar = itens.filter((i) => i.criar).length
  const totalVincular = itens.filter((i) => !i.criar && i.vincularProdutoId).length

  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] flex flex-col p-6">
        <DialogHeader className="pb-2 border-b">
          <DialogTitle className="text-xl flex items-center gap-2">
            <ShoppingBag className="h-6 w-6 text-primary" />
            Produtos Não Cadastrados na NF-e
          </DialogTitle>
          <DialogDescription>
            Foram encontrados itens na nota fiscal sem produto correspondente no estoque. Você pode
            criá-los automaticamente com a sugestão fiscal ou vinculá-los a um produto já existente.
          </DialogDescription>
        </DialogHeader>

        {carregando ? (
          <div className="py-16 flex justify-center items-center gap-2 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            Carregando itens da nota...
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto space-y-4 py-3">
            {/* Barra de Parâmetros Padrão do Lote */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 p-3.5 rounded-lg border bg-muted/20">
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Grupo Padrão</Label>
                <Select value={grupoPadraoId} onValueChange={handleGrupoChange}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Selecione o grupo" />
                  </SelectTrigger>
                  <SelectContent>
                    {grupos.map((g) => (
                      <SelectItem key={g.id} value={g.id}>
                        {g.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold">Categoria Padrão</Label>
                <Select
                  value={categoriaPadraoId}
                  onValueChange={setCategoriaPadraoId}
                  disabled={!grupoPadraoId || categorias.length === 0}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Selecione a categoria" />
                  </SelectTrigger>
                  <SelectContent>
                    {categorias.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold">Margem de Venda Padrão (%)</Label>
                <Input
                  className="h-8 text-xs"
                  type="number"
                  step="0.1"
                  value={margemPadrao}
                  onChange={(e) => handleMargemPadraoChange(e.target.value)}
                />
              </div>

              <div className="flex items-center gap-2 pt-5">
                <Switch
                  id="sw_fiscal_auto"
                  checked={aplicarFiscal}
                  onCheckedChange={setAplicarFiscal}
                />
                <Label
                  htmlFor="sw_fiscal_auto"
                  className="text-xs cursor-pointer flex items-center gap-1 font-medium"
                >
                  <Sparkles className="h-3.5 w-3.5 text-primary" />
                  Aplicar classificação fiscal automática
                </Label>
              </div>
            </div>

            {/* Tabela de Itens */}
            <div className="rounded-md border overflow-x-auto">
              <Table className="text-xs">
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="w-10 text-center">
                      <Checkbox
                        checked={itens.length > 0 && itens.every((i) => i.criar)}
                        onCheckedChange={(c) => toggleSelecionarTodos(Boolean(c))}
                      />
                    </TableHead>
                    <TableHead className="w-16">Item / Cód</TableHead>
                    <TableHead className="min-w-[240px]">Descrição no Fornecedor</TableHead>
                    <TableHead className="w-24">NCM / CEST</TableHead>
                    <TableHead className="w-20">Un. Compra</TableHead>
                    <TableHead className="w-32">Un. Venda / Conversão</TableHead>
                    <TableHead className="w-24 text-right">Custo Estoque</TableHead>
                    <TableHead className="w-24 text-right">Preço Venda</TableHead>
                    <TableHead className="min-w-[200px]">Vínculo com Existente</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {itens.map((it, idx) => (
                    <TableRow
                      key={it.itemNota.id}
                      className={!it.criar ? 'opacity-70 bg-muted/10' : ''}
                    >
                      <TableCell className="text-center">
                        <Checkbox
                          checked={it.criar}
                          onCheckedChange={(checked) => {
                            atualizarItem(idx, {
                              criar: Boolean(checked),
                              vincularProdutoId: undefined,
                            })
                          }}
                        />
                      </TableCell>

                      <TableCell className="font-mono text-[11px]">
                        <div>#{it.itemNota.numero_item}</div>
                        <div className="text-muted-foreground truncate">
                          {it.itemNota.codigo_fornecedor}
                        </div>
                      </TableCell>

                      <TableCell>
                        <Input
                          className="h-7 text-xs"
                          value={it.descricao}
                          disabled={!it.criar}
                          onChange={(e) => atualizarItem(idx, { descricao: e.target.value })}
                        />
                        {it.gtin && it.gtin !== 'SEM GTIN' && (
                          <div className="text-[10px] text-muted-foreground mt-0.5">
                            EAN: <span className="font-mono">{it.gtin}</span>
                          </div>
                        )}
                      </TableCell>

                      <TableCell className="font-mono text-[11px]">
                        <div>{it.ncm || '—'}</div>
                        <div className="text-muted-foreground">{it.cest || ''}</div>
                      </TableCell>

                      <TableCell className="font-semibold text-center">
                        <Badge variant="outline">{it.unidadeCompra}</Badge>
                      </TableCell>

                      <TableCell>
                        {it.criar ? (
                          <div className="space-y-1">
                            <Select
                              value={it.unidadeVendaId}
                              onValueChange={(val) => atualizarItem(idx, { unidadeVendaId: val })}
                            >
                              <SelectTrigger className="h-6 text-[11px] p-1">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {unidades.map((u) => (
                                  <SelectItem key={u.id} value={u.id}>
                                    {u.sigla} - {u.descricao}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>

                            {/* Conversor de Embalagem (ex: 1 CX = X UN) */}
                            {it.unidadeCompra.toUpperCase() !== 'UN' && (
                              <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                                <span>1 {it.unidadeCompra} =</span>
                                <Input
                                  type="number"
                                  step="1"
                                  min="1"
                                  className="h-5 w-12 text-[10px] p-0.5 text-center font-bold"
                                  value={it.fatorConversao}
                                  onChange={(e) =>
                                    atualizarItem(idx, {
                                      fatorConversao: parseFloat(e.target.value) || 1,
                                    })
                                  }
                                />
                                <span>UN</span>
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>

                      <TableCell className="text-right font-mono">
                        R$ {it.precoCusto.toFixed(2)}
                      </TableCell>

                      <TableCell className="text-right font-mono">
                        {it.criar ? (
                          <Input
                            type="number"
                            step="0.01"
                            className="h-6 text-xs text-right font-mono p-1"
                            value={it.precoVenda || ''}
                            onChange={(e) =>
                              atualizarItem(idx, { precoVenda: parseFloat(e.target.value) || 0 })
                            }
                          />
                        ) : (
                          '—'
                        )}
                      </TableCell>

                      <TableCell>
                        {it.criar ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 text-[11px] text-muted-foreground hover:text-foreground gap-1"
                            onClick={() =>
                              atualizarItem(idx, {
                                criar: false,
                              })
                            }
                          >
                            <LinkIcon className="h-3 w-3" />
                            Vincular a existente
                          </Button>
                        ) : (
                          <div className="space-y-1">
                            <div className="flex items-center gap-1">
                              <Input
                                placeholder="Buscar produto..."
                                className="h-6 text-xs p-1"
                                value={buscaProdutoTexto[it.itemNota.id] || ''}
                                onChange={(e) =>
                                  handleBuscarProdutoExistente(it.itemNota.id, e.target.value)
                                }
                              />
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 text-[11px] px-1 text-primary"
                                onClick={() =>
                                  atualizarItem(idx, { criar: true, vincularProdutoId: undefined })
                                }
                              >
                                Criar
                              </Button>
                            </div>

                            {/* Dropdown de opções encontradas */}
                            {produtosEncontrados[it.itemNota.id] &&
                              produtosEncontrados[it.itemNota.id].length > 0 && (
                                <div className="border rounded bg-popover p-1 max-h-24 overflow-y-auto space-y-1 shadow-md">
                                  {produtosEncontrados[it.itemNota.id].map((p) => (
                                    <div
                                      key={p.id}
                                      onClick={() => {
                                        atualizarItem(idx, {
                                          vincularProdutoId: p.id,
                                        })
                                        setBuscaProdutoTexto((prev) => ({
                                          ...prev,
                                          [it.itemNota.id]: `${p.codigo} - ${p.descricao}`,
                                        }))
                                        setProdutosEncontrados((prev) => ({
                                          ...prev,
                                          [it.itemNota.id]: [],
                                        }))
                                      }}
                                      className="p-1 text-[11px] hover:bg-muted cursor-pointer rounded flex items-center justify-between"
                                    >
                                      <span className="truncate">
                                        {p.codigo} - {p.descricao}
                                      </span>
                                      <Badge variant="outline" className="text-[9px] h-4">
                                        NCM: {p.ncm || '—'}
                                      </Badge>
                                    </div>
                                  ))}
                                </div>
                              )}

                            {it.vincularProdutoId && (
                              <div className="text-[10px] text-emerald-600 font-medium flex items-center gap-1">
                                ✓ Selecionado para vínculo
                              </div>
                            )}
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        <DialogFooter className="pt-2 border-t flex items-center justify-between sm:justify-between w-full">
          <div className="text-xs text-muted-foreground flex items-center gap-2">
            <span>
              Ações planejadas: <strong>{totalCriar}</strong> para criar,{' '}
              <strong>{totalVincular}</strong> para vincular
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={processando}>
              Revisar Depois
            </Button>

            <Button
              onClick={handleConfirmarCriacao}
              disabled={processando || (totalCriar === 0 && totalVincular === 0)}
              className="gap-1.5"
            >
              {processando ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Processando...
                </>
              ) : (
                <>
                  <PlusCircle className="h-4 w-4" />
                  Criar / Vincular Selecionados
                </>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
export default ModalProdutosNaoCadastrados
