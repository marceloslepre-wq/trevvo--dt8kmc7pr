import { useState } from 'react'
import { NotaEntradaItem } from '@/services/notasEntrada'
import { SugestaoFiscalResultado } from '@/services/motorFiscal'
import { Produto } from '@/services/produtos'
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
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Sparkles, CheckCircle2, AlertTriangle, HelpCircle, Loader2, Save } from 'lucide-react'

export interface ModalConferenciaFiscalItemProps {
  aberto: boolean
  onOpenChange: (aberto: boolean) => void
  item: NotaEntradaItem
  produto: Produto | null
  sugestao: SugestaoFiscalResultado | null
  onSalvarProduto: (camposAtualizados: Partial<Produto>) => Promise<void>
}

export function ModalConferenciaFiscalItem({
  aberto,
  onOpenChange,
  item,
  produto,
  sugestao,
  onSalvarProduto,
}: ModalConferenciaFiscalItemProps) {
  const [salvando, setSalvando] = useState(false)

  // Campos fiscais editáveis
  const [ncm, setNcm] = useState(sugestao?.campos.ncm || produto?.ncm || item.ncm_fornecedor || '')
  const [cest, setCest] = useState(
    sugestao?.campos.cest || produto?.cest || item.cest_fornecedor || '',
  )
  const [origem, setOrigem] = useState(sugestao?.campos.origem || produto?.origem || '0')
  const [cfopVenda, setCfopVenda] = useState(
    sugestao?.campos.cfop_venda_interna || produto?.cfop_venda_interna || '5102',
  )
  const [cstIcms, setCstIcms] = useState(sugestao?.campos.cst_icms || produto?.cst_icms || '')
  const [csosn, setCsosn] = useState(
    sugestao?.campos.cst_icms ? '' : sugestao?.campos.csosn || produto?.csosn || '',
  )
  const [aliquotaIcms, setAliquotaIcms] = useState(
    sugestao?.campos.aliquota_icms !== undefined
      ? String(sugestao.campos.aliquota_icms)
      : produto?.aliquota_icms !== undefined
        ? String(produto.aliquota_icms)
        : '',
  )
  const [cstPis, setCstPis] = useState(
    sugestao?.campos.cst_pis_saida || produto?.cst_pis_saida || '',
  )
  const [cstCofins, setCstCofins] = useState(
    sugestao?.campos.cst_cofins_saida || produto?.cst_cofins_saida || '',
  )
  const [natReceita, setNatReceita] = useState(
    sugestao?.campos.natureza_receita_pis_cofins || produto?.natureza_receita_pis_cofins || '',
  )

  const corBadgeConfianca =
    sugestao?.confianca === 'Alta'
      ? 'bg-emerald-500 hover:bg-emerald-600 text-white'
      : sugestao?.confianca === 'Média'
        ? 'bg-amber-500 hover:bg-amber-600 text-white'
        : 'bg-rose-500 hover:bg-rose-600 text-white'

  async function handleSalvar() {
    if (!produto) return
    setSalvando(true)
    try {
      const cstIcmsLimpo = cstIcms.trim()
      const payload: Partial<Produto> = {
        ncm: ncm.trim(),
        cest: cest.trim(),
        origem: origem.trim(),
        cfop_venda_interna: cfopVenda.trim(),
        cst_icms: cstIcmsLimpo || undefined,
        csosn: cstIcmsLimpo ? undefined : csosn.trim() || undefined,
        aliquota_icms: aliquotaIcms ? parseFloat(aliquotaIcms) : undefined,
        cst_pis_saida: cstPis.trim() || undefined,
        cst_cofins_saida: cstCofins.trim() || undefined,
        natureza_receita_pis_cofins: natReceita.trim() || undefined,
      }
      if (sugestao?.campos.perfil_tributario_id) {
        payload.perfil_tributario_id = sugestao.campos.perfil_tributario_id
      }

      await onSalvarProduto(payload)
      onOpenChange(false)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-6">
        <DialogHeader className="pb-2 border-b">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-lg flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Sugestão Fiscal do Item #{item.numero_item}
            </DialogTitle>
            <Badge className={corBadgeConfianca}>
              Confiança: {sugestao?.confianca || 'Classificar manualmente'}
            </Badge>
          </div>
          <DialogDescription className="text-xs">
            {sugestao?.motivoGeral ||
              'Análise de enquadramento tributário com base nas regras do NCM e XML.'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 py-3 text-xs">
          {/* Avisos do motor fiscal */}
          {sugestao?.avisos && sugestao.avisos.length > 0 && (
            <div className="space-y-1.5">
              {sugestao.avisos.map((av, idx) => (
                <Alert
                  key={idx}
                  className="bg-amber-50 border-amber-300 text-amber-900 py-1.5 text-xs"
                >
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  <AlertDescription>{av}</AlertDescription>
                </Alert>
              ))}
            </div>
          )}

          {/* Dados do produto e nota */}
          <div className="p-2.5 rounded-lg border bg-muted/20 grid grid-cols-2 gap-2">
            <div>
              <span className="text-muted-foreground block text-[11px]">Produto no ERP:</span>
              <strong className="text-foreground">
                {produto ? `[${produto.codigo}] ${produto.descricao}` : 'Sem produto vinculado'}
              </strong>
            </div>
            <div>
              <span className="text-muted-foreground block text-[11px]">
                Descrição no Fornecedor:
              </span>
              <span className="text-foreground">{item.descricao_fornecedor}</span>
            </div>
          </div>

          {/* Formulário de campos com motivos */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-[11px]">NCM</Label>
              <Input
                value={ncm}
                onChange={(e) => setNcm(e.target.value)}
                className="h-8 font-mono text-xs"
              />
              {sugestao?.motivosPorCampo['ncm'] && (
                <p className="text-[10px] text-muted-foreground">
                  Motivo: {sugestao.motivosPorCampo['ncm']}
                </p>
              )}
            </div>

            <div className="space-y-1">
              <Label className="text-[11px]">CEST</Label>
              <Input
                value={cest}
                onChange={(e) => setCest(e.target.value)}
                className="h-8 font-mono text-xs"
              />
              {sugestao?.motivosPorCampo['cest'] && (
                <p className="text-[10px] text-muted-foreground">
                  Motivo: {sugestao.motivosPorCampo['cest']}
                </p>
              )}
            </div>

            <div className="space-y-1">
              <Label className="text-[11px]">Origem Mercadoria</Label>
              <Input
                value={origem}
                onChange={(e) => setOrigem(e.target.value)}
                className="h-8 font-mono text-xs"
              />
              {sugestao?.motivosPorCampo['origem'] && (
                <p className="text-[10px] text-muted-foreground">
                  Motivo: {sugestao.motivosPorCampo['origem']}
                </p>
              )}
            </div>

            <div className="space-y-1">
              <Label className="text-[11px]">CFOP Venda Interna</Label>
              <Input
                value={cfopVenda}
                onChange={(e) => setCfopVenda(e.target.value)}
                className="h-8 font-mono text-xs"
              />
              {sugestao?.motivosPorCampo['cfop_venda_interna'] && (
                <p className="text-[10px] text-muted-foreground">
                  Motivo: {sugestao.motivosPorCampo['cfop_venda_interna']}
                </p>
              )}
            </div>

            <div className="space-y-1">
              <Label className="text-[11px]">CST ICMS (Regime Normal)</Label>
              <Input
                value={cstIcms}
                onChange={(e) => setCstIcms(e.target.value)}
                className="h-8 font-mono text-xs"
                placeholder="Ex: 00, 60"
              />
              {sugestao?.motivosPorCampo['cst_icms'] && (
                <p className="text-[10px] text-muted-foreground">
                  Motivo: {sugestao.motivosPorCampo['cst_icms']}
                </p>
              )}
            </div>

            <div className="space-y-1">
              <Label className="text-[11px]">CSOSN (Simples Nacional)</Label>
              <Input
                value={csosn}
                onChange={(e) => setCsosn(e.target.value)}
                className="h-8 font-mono text-xs"
                placeholder="Ex: 102, 500"
              />
              {sugestao?.motivosPorCampo['csosn'] && (
                <p className="text-[10px] text-muted-foreground">
                  Motivo: {sugestao.motivosPorCampo['csosn']}
                </p>
              )}
            </div>

            <div className="space-y-1">
              <Label className="text-[11px]">CST PIS Saída</Label>
              <Input
                value={cstPis}
                onChange={(e) => setCstPis(e.target.value)}
                className="h-8 font-mono text-xs"
              />
              {sugestao?.motivosPorCampo['cst_pis_saida'] && (
                <p className="text-[10px] text-muted-foreground">
                  Motivo: {sugestao.motivosPorCampo['cst_pis_saida']}
                </p>
              )}
            </div>

            <div className="space-y-1">
              <Label className="text-[11px]">CST COFINS Saída</Label>
              <Input
                value={cstCofins}
                onChange={(e) => setCstCofins(e.target.value)}
                className="h-8 font-mono text-xs"
              />
              {sugestao?.motivosPorCampo['cst_cofins_saida'] && (
                <p className="text-[10px] text-muted-foreground">
                  Motivo: {sugestao.motivosPorCampo['cst_cofins_saida']}
                </p>
              )}
            </div>

            <div className="col-span-2 space-y-1">
              <Label className="text-[11px]">Natureza da Receita PIS/COFINS (Monofásicos)</Label>
              <Input
                value={natReceita}
                onChange={(e) => setNatReceita(e.target.value)}
                className="h-8 text-xs"
                placeholder="Ex: 101, 102..."
              />
            </div>
          </div>
        </div>

        <DialogFooter className="pt-2 border-t flex justify-between items-center w-full">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>

          <Button
            size="sm"
            onClick={handleSalvar}
            disabled={!produto || salvando}
            className="gap-1.5"
          >
            {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar no Produto
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
export default ModalConferenciaFiscalItem
