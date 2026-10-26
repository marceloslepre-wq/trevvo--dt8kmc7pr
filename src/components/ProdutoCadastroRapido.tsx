import React, { useState, useEffect } from 'react'
import { PlusCircle, Loader2, Package } from 'lucide-react'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { useToast } from '@/hooks/use-toast'
import { salvarProduto, salvarProdutoFornecedor, Produto } from '@/services/produtos'
import { listarTodasUnidadesMedidaAtivas, UnidadeMedida } from '@/services/unidadesMedida'
import { SelectNcm } from '@/components/SelectNcm'
import { SelectCest } from '@/components/SelectCest'

export interface ProdutoCadastroRapidoProps {
  aberto: boolean
  onClose: () => void
  onSucesso: (produtoCriado: Produto) => void
  fornecedorId?: string
  dadosIniciais?: {
    descricao?: string
    codigoNoFornecedor?: string
    gtin?: string
    ncm?: string
    cest?: string
    unidadeSigla?: string
    precoCusto?: number
  }
}

export const ProdutoCadastroRapido: React.FC<ProdutoCadastroRapidoProps> = ({
  aberto,
  onClose,
  onSucesso,
  fornecedorId,
  dadosIniciais,
}) => {
  const { toast } = useToast()
  const [salvando, setSalvando] = useState(false)
  const [unidades, setUnidades] = useState<UnidadeMedida[]>([])

  const [codigo, setCodigo] = useState<number | undefined>(undefined)
  const [descricao, setDescricao] = useState('')
  const [gtin, setGtin] = useState('')
  const [ncm, setNcm] = useState('')
  const [cest, setCest] = useState('')
  const [unidadeId, setUnidadeId] = useState('')
  const [precoCusto, setPrecoCusto] = useState<number>(0)
  const [margemPercentual, setMargemPercentual] = useState<number>(50)
  const [precoVenda, setPrecoVenda] = useState<number>(0)
  const [controlaLoteValidade, setControlaLoteValidade] = useState(false)
  const [diasValidade, setDiasValidade] = useState<number>(0)

  // Carrega unidades e próximo código
  useEffect(() => {
    if (!aberto) return
    let ativo = true

    async function init() {
      try {
        const listaUn = await listarTodasUnidadesMedidaAtivas()
        if (!ativo) return

        setUnidades(listaUn)

        // Resolução da unidade inicial
        let unPadrao = ''
        if (dadosIniciais?.unidadeSigla) {
          const buscada = dadosIniciais.unidadeSigla.trim().toUpperCase()
          const enc = listaUn.find((u) => u.sigla.toUpperCase() === buscada)
          if (enc) {
            unPadrao = enc.id
          }
        }
        if (!unPadrao && listaUn.length > 0) {
          const encUn = listaUn.find((u) => u.sigla.toUpperCase() === 'UN')
          unPadrao = encUn ? encUn.id : listaUn[0].id
        }
        setUnidadeId(unPadrao)

        // Inicializa dados vindos da NF-e
        const custo = dadosIniciais?.precoCusto || 0
        setDescricao(dadosIniciais?.descricao || '')
        setGtin(dadosIniciais?.gtin === 'SEM GTIN' ? '' : dadosIniciais?.gtin || '')
        setNcm(dadosIniciais?.ncm || '')
        setCest(dadosIniciais?.cest || '')
        setPrecoCusto(custo)
        const vendaSugerido = Number((custo * 1.5).toFixed(2))
        setPrecoVenda(vendaSugerido)
      } catch (err) {
        console.error('Erro ao inicializar cadastro rápido de produto:', err)
      }
    }

    init()

    return () => {
      ativo = false
    }
  }, [aberto, dadosIniciais])

  const handleCustoOuMargemChange = (novoCusto: number, novaMargem: number) => {
    setPrecoCusto(novoCusto)
    setMargemPercentual(novaMargem)
    const venda = Number((novoCusto * (1 + novaMargem / 100)).toFixed(2))
    setPrecoVenda(venda)
  }

  const handleSalvar = async () => {
    if (!descricao.trim()) {
      toast({
        title: 'Descrição obrigatória',
        description: 'Informe a descrição do produto para cadastrar.',
        variant: 'destructive',
      })
      return
    }

    if (!unidadeId) {
      toast({
        title: 'Unidade obrigatória',
        description: 'Selecione a unidade de medida do produto.',
        variant: 'destructive',
      })
      return
    }

    setSalvando(true)
    try {
      const novoProduto = await salvarProduto({
        tipo: 'Produto',
        descricao: descricao.trim(),
        codigo,
        gtin: gtin.trim() || undefined,
        ncm: ncm.trim() || undefined,
        cest: cest.trim() || undefined,
        unidade_id: unidadeId,
        fornecedor_principal_id: fornecedorId || undefined,
        preco_custo: precoCusto,
        custo_final: precoCusto,
        margem_percentual: margemPercentual,
        preco_venda: precoVenda,
        controla_estoque: true,
        controla_lote_validade: controlaLoteValidade,
        dias_validade: controlaLoteValidade ? diasValidade : undefined,
      })

      // Grava vinculo em produtos_fornecedores se fornecedorId existir
      if (fornecedorId) {
        try {
          const unSigla = unidades.find((u) => u.id === unidadeId)?.sigla || 'UN'
          await salvarProdutoFornecedor({
            produto_id: novoProduto.id,
            fornecedor_id: fornecedorId,
            codigo_no_fornecedor: dadosIniciais?.codigoNoFornecedor || '',
            descricao_no_fornecedor: dadosIniciais?.descricao || descricao.trim(),
            unidade_fornecedor: dadosIniciais?.unidadeSigla || unSigla,
            fator_conversao: 1,
            ultimo_preco_compra: precoCusto,
            data_ultima_compra: new Date().toISOString().slice(0, 10),
          })
        } catch (errVinculo) {
          console.warn('Falha ao gravar produtos_fornecedores:', errVinculo)
        }
      }

      toast({
        title: 'Produto criado com sucesso!',
        description: `Produto #${novoProduto.codigo} - ${novoProduto.descricao} cadastrado e vinculado.`,
      })

      onSucesso(novoProduto)
      onClose()
    } catch (err: unknown) {
      toast({
        title: 'Erro ao criar produto',
        description: err instanceof Error ? err.message : 'Falha ao salvar produto.',
        variant: 'destructive',
      })
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Package className="h-5 w-5 text-blue-600" />
            <DialogTitle>Criar Produto a partir do Item da NF-e</DialogTitle>
          </div>
          <DialogDescription>
            Os dados fiscais e comerciais foram preenchidos com as informações do XML.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Código</Label>
              <Input
                value={codigo ?? ''}
                disabled
                readOnly
                placeholder="será gerado ao salvar"
                className="bg-slate-100 font-mono text-xs font-bold text-slate-700"
              />
            </div>
            <div className="sm:col-span-3 space-y-1">
              <Label className="text-xs font-semibold">Descrição do Produto *</Label>
              <Input
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                placeholder="Descrição comercial no catálogo"
                className="text-xs font-medium"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label className="text-xs font-semibold">GTIN / EAN</Label>
              <Input
                value={gtin}
                onChange={(e) => setGtin(e.target.value)}
                placeholder="Código de barras"
                className="text-xs font-mono"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Unidade de Estoque *</Label>
              <Select value={unidadeId} onValueChange={setUnidadeId}>
                <SelectTrigger className="text-xs bg-white">
                  <SelectValue placeholder="Selecione a unidade" />
                </SelectTrigger>
                <SelectContent>
                  {unidades.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.sigla} - {u.descricao}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Preço de Custo (R$)</Label>
              <Input
                type="number"
                step="0.01"
                value={precoCusto}
                onChange={(e) =>
                  handleCustoOuMargemChange(parseFloat(e.target.value) || 0, margemPercentual)
                }
                className="text-xs font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Margem de Lucro Sugerida (%)</Label>
              <Input
                type="number"
                step="0.1"
                value={margemPercentual}
                onChange={(e) =>
                  handleCustoOuMargemChange(precoCusto, parseFloat(e.target.value) || 0)
                }
                className="text-xs font-mono"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Preço de Venda Sugerido (R$)</Label>
              <Input
                type="number"
                step="0.01"
                value={precoVenda}
                onChange={(e) => setPrecoVenda(parseFloat(e.target.value) || 0)}
                className="text-xs font-mono font-bold text-emerald-700 bg-emerald-50/50"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs font-semibold">NCM (8 dígitos)</Label>
              <SelectNcm value={ncm} onChange={(val) => setNcm(val || '')} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold">CEST (Substituição Tributária)</Label>
              <SelectCest value={cest} onChange={(val) => setCest(val || '')} />
            </div>
          </div>

          {/* Controle de Lote e Validade */}
          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-2">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="controla_lote_validade"
                checked={controlaLoteValidade}
                onCheckedChange={(checked) => setControlaLoteValidade(Boolean(checked))}
              />
              <label
                htmlFor="controla_lote_validade"
                className="text-xs font-semibold text-slate-800 cursor-pointer"
              >
                Controlar Lote e Data de Validade para este produto
              </label>
            </div>
            {controlaLoteValidade && (
              <div className="pt-2 pl-6 max-w-xs space-y-1">
                <Label className="text-[11px] text-slate-600">Dias para alerta de validade</Label>
                <Input
                  type="number"
                  min="0"
                  value={diasValidade}
                  onChange={(e) => setDiasValidade(parseInt(e.target.value, 10) || 0)}
                  className="text-xs h-8"
                />
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose} disabled={salvando}>
            Cancelar
          </Button>
          <Button
            size="sm"
            onClick={handleSalvar}
            disabled={salvando || !descricao.trim()}
            className="bg-blue-600 hover:bg-blue-700 text-white gap-1.5"
          >
            {salvando ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Cadastrando...
              </>
            ) : (
              <>
                <PlusCircle className="h-4 w-4" />
                Cadastrar e Vincular
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default ProdutoCadastroRapido
