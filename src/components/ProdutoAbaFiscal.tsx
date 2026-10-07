import React, { useState, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  ShieldAlert,
  Info,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import { SelectPerfilTributario } from '@/components/SelectPerfilTributario'
import { SelectNcm } from '@/components/SelectNcm'
import { SelectCest } from '@/components/SelectCest'
import { SelectCfop } from '@/components/SelectCfop'
import { SelectCodigoFiscal } from '@/components/SelectCodigoFiscal'
import {
  sugerirCestPorNcm,
  obterCestPorCodigo,
  ncmCorrespondeAoCest,
  formatarCodigoCest,
} from '@/services/cest'
import {
  obterPerfilTributarioCompleto,
  PerfilTributarioCompleto,
} from '@/services/perfisTributarios'
import { obterGrupo } from '@/services/gruposCategorias'
import { Produto } from '@/services/produtos'

// Componente auxiliar para validação e aviso de incompatibilidade entre CEST e NCM
function AvisoCompatibilidadeCestNcm({ cest, ncm }: { cest: string; ncm: string }) {
  const [incompativel, setIncompativel] = useState(false)
  const [carregando, setCarregando] = useState(false)

  useEffect(() => {
    let cancelado = false
    const ncmLimpo = ncm.replace(/\D/g, '')
    const cestLimpo = cest.replace(/\D/g, '')

    if (!ncmLimpo || !cestLimpo) {
      setIncompativel(false)
      return
    }

    setCarregando(true)
    obterCestPorCodigo(cestLimpo)
      .then((cestObj) => {
        if (cancelado) return
        if (!cestObj) {
          setIncompativel(false)
          return
        }
        // Se tem lista de NCMs associados, checa se o NCM bate
        if (cestObj.ncm_codigos && cestObj.ncm_codigos.trim()) {
          const bate = ncmCorrespondeAoCest(ncmLimpo, cestObj.ncm_codigos)
          setIncompativel(!bate)
        } else {
          setIncompativel(false)
        }
      })
      .catch(() => {
        if (!cancelado) setIncompativel(false)
      })
      .finally(() => {
        if (!cancelado) setCarregando(false)
      })

    return () => {
      cancelado = true
    }
  }, [cest, ncm])

  if (carregando || !incompativel) return null

  return (
    <div className="flex items-start gap-1.5 p-2 mt-1.5 bg-amber-50 border border-amber-200 rounded text-[11px] text-amber-800">
      <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600 mt-0.5" />
      <div>
        <strong className="font-semibold block">Atenção: CEST possivelmente incompatível</strong>
        <span>
          O CEST {formatarCodigoCest(cest)} não lista o NCM {ncm} na sua tabela de enquadramentos legais.
          Verifique com a contabilidade se este produto está sujeito a Substituição Tributária.
        </span>
      </div>
    </div>
  )
}

export interface ProdutoAbaFiscalProps {
  formData: Partial<Produto>
  onChangeCampo: (campo: keyof Produto, valor: any) => void
  onMudarCamposEmLote: (campos: Partial<Produto>) => void
  regimeEmpresaAtiva: 'Simples Nacional' | 'Regime Normal'
  crtEmpresaAtiva: number | string // 1, 2, 3, 4
  tipoItemProduto: 'Produto' | 'Serviço' | 'Kit'
  grupoId?: string
  erros?: Record<string, string>
}

export function ProdutoAbaFiscal({
  formData,
  onChangeCampo,
  onMudarCamposEmLote,
  regimeEmpresaAtiva,
  crtEmpresaAtiva,
  tipoItemProduto,
  grupoId,
  erros = {},
}: ProdutoAbaFiscalProps) {
  // Controle de diálogo de confirmação de sobreposição de perfil
  const [modalConfirmaPerfilAberto, setModalConfirmaPerfilAberto] = useState(false)
  const [perfilPendenteParaAplicar, setPerfilPendenteParaAplicar] =
    useState<PerfilTributarioCompleto | null>(null)
  const [perfilSugeridoGrupo, setPerfilSugeridoGrupo] = useState<{
    id: string
    nome: string
  } | null>(null)

  // Alternar "Mostrar ambos" (CSOSN e CST ICMS)
  const [mostrarAmbosRegimesIcms, setMostrarAmbosRegimesIcms] = useState(false)

  // Sugestão de CEST
  const [cestSugerido, setCestSugerido] = useState<string | null>(null)
  const [cestSugeridoAviso, setCestSugeridoAviso] = useState<string | null>(null)

  // Alíquota IPI da NCM sugerida
  const [aliquotaIpiNcmSugerida, setAliquotaIpiNcmSugerida] = useState<number | null>(null)

  // Seção IPI recolhida para não contribuinte
  const empresaNaoContribuinteIpi =
    String(crtEmpresaAtiva) === '1' || String(crtEmpresaAtiva) === '2' // Simples Nacional costuma não ser contribuinte de IPI padrão
  const [blocoIpiExpandido, setBlocoIpiExpandido] = useState(!empresaNaoContribuinteIpi)

  // 1. Sugestão de Perfil Padrão do Grupo quando o produto não tem perfil
  useEffect(() => {
    if (!formData.perfil_tributario_id && grupoId) {
      obterGrupo(grupoId)
        .then((g) => {
          if (g?.perfil_tributario_id) {
            setPerfilSugeridoGrupo({
              id: g.perfil_tributario_id,
              nome: (g as any).expand?.perfil_tributario_id?.nome || 'Perfil Padrão do Grupo',
            })
          } else {
            setPerfilSugeridoGrupo(null)
          }
        })
        .catch(() => setPerfilSugeridoGrupo(null))
    } else {
      setPerfilSugeridoGrupo(null)
    }
  }, [formData.perfil_tributario_id, grupoId])

  // 2. Análise do NCM para sugestão de CEST e ANP
  const ncmNormalizado = (formData.ncm || '').replace(/\D/g, '')
  useEffect(() => {
    if (ncmNormalizado.length >= 4) {
      sugerirCestPorNcm(ncmNormalizado)
        .then((sugestoes) => {
          if (sugestoes && sugestoes.length > 0) {
            setCestSugerido(sugestoes[0].codigo)
            setCestSugeridoAviso(
              `Este NCM costuma ter CEST (ex: ${sugestoes[0].codigo} - ${sugestoes[0].descricao.slice(0, 80)}...)`,
            )
          } else {
            setCestSugerido(null)
            setCestSugeridoAviso(null)
          }
        })
        .catch(() => {
          setCestSugerido(null)
          setCestSugeridoAviso(null)
        })
    } else {
      setCestSugerido(null)
      setCestSugeridoAviso(null)
    }
  }, [ncmNormalizado])

  // Detecta se NCM é combustível para exibir campos ANP (2710, 2711 ou 2207)
  const ehCombustivel =
    ncmNormalizado.startsWith('2710') ||
    ncmNormalizado.startsWith('2711') ||
    ncmNormalizado.startsWith('2207')

  // Código de gênero automático (2 primeiros dígitos do NCM)
  const generoCalculado = ncmNormalizado.length >= 2 ? ncmNormalizado.substring(0, 2) : ''
  useEffect(() => {
    if (generoCalculado && formData.codigo_genero !== generoCalculado) {
      onChangeCampo('codigo_genero', generoCalculado)
    }
  }, [generoCalculado, formData.codigo_genero, onChangeCampo])

  // Verifica se campos fiscais já estão preenchidos para pedir confirmação ao aplicar perfil
  const temCamposFiscaisPreenchidos = Boolean(
    formData.origem ||
    formData.tipo_item_sped ||
    formData.cfop_venda_interna ||
    formData.cst_icms ||
    formData.csosn ||
    formData.cst_pis_saida ||
    formData.cst_cofins_saida,
  )

  // Função para executar a extração e preenchimento dos valores do perfil tributário
  const aplicarPerfilNoFormulario = (perfil: PerfilTributarioCompleto) => {
    const novosCampos: Partial<Produto> = {
      perfil_tributario_id: perfil.id,
    }

    // Origem, tipo item sped e c_benef vêm do cabeçalho do perfil
    if (perfil.origem_padrao) novosCampos.origem = perfil.origem_padrao
    if (perfil.tipo_item_sped_padrao) novosCampos.tipo_item_sped = perfil.tipo_item_sped_padrao
    if (perfil.c_benef) novosCampos.c_benef = perfil.c_benef

    // Regras dos cenários
    const regraVendaInternaConsumidor = perfil.regras.find(
      (r) => r.cenario === 'VENDA_INTERNA_CONSUMIDOR',
    )
    const regraVendaInternaContribuinte = perfil.regras.find(
      (r) => r.cenario === 'VENDA_INTERNA_CONTRIBUINTE',
    )
    const regraVendaInterestadualContribuinte = perfil.regras.find(
      (r) => r.cenario === 'VENDA_INTERESTADUAL_CONTRIBUINTE',
    )
    const regraCompraInterna = perfil.regras.find((r) => r.cenario === 'COMPRA_INTERNA')
    const regraCompraInterestadual = perfil.regras.find((r) => r.cenario === 'COMPRA_INTERESTADUAL')

    // CFOPs especificados
    const cfopVendaInterna =
      regraVendaInternaConsumidor?.expand?.cfop?.codigo ||
      regraVendaInternaConsumidor?.cfop ||
      regraVendaInternaContribuinte?.expand?.cfop?.codigo ||
      regraVendaInternaContribuinte?.cfop
    if (cfopVendaInterna) novosCampos.cfop_venda_interna = cfopVendaInterna

    const cfopVendaInterestadual =
      regraVendaInterestadualContribuinte?.expand?.cfop?.codigo ||
      regraVendaInterestadualContribuinte?.cfop
    if (cfopVendaInterestadual) novosCampos.cfop_venda_interestadual = cfopVendaInterestadual

    const cfopCompraInterna = regraCompraInterna?.expand?.cfop?.codigo || regraCompraInterna?.cfop
    if (cfopCompraInterna) novosCampos.cfop_compra_interna = cfopCompraInterna

    const cfopCompraInterestadual =
      regraCompraInterestadual?.expand?.cfop?.codigo || regraCompraInterestadual?.cfop
    if (cfopCompraInterestadual) novosCampos.cfop_compra_interestadual = cfopCompraInterestadual

    // Regra prioritária para impostos: VENDA_INTERNA_CONSUMIDOR (ou primeiro cenário de venda)
    const regraImpostos =
      regraVendaInternaConsumidor ||
      regraVendaInternaContribuinte ||
      regraVendaInterestadualContribuinte ||
      perfil.regras[0]

    if (regraImpostos) {
      // ICMS
      if (regraImpostos.cst_icms !== undefined) novosCampos.cst_icms = regraImpostos.cst_icms
      if (regraImpostos.csosn !== undefined) novosCampos.csosn = regraImpostos.csosn
      if (regraImpostos.mod_bc_icms !== undefined)
        novosCampos.mod_bc_icms = regraImpostos.mod_bc_icms
      if (regraImpostos.aliquota_icms !== undefined)
        novosCampos.aliquota_icms = regraImpostos.aliquota_icms
      if (regraImpostos.reducao_bc_icms_percentual !== undefined)
        novosCampos.reducao_bc_icms_percentual = regraImpostos.reducao_bc_icms_percentual
      if (regraImpostos.aliquota_fcp !== undefined)
        novosCampos.aliquota_fcp = regraImpostos.aliquota_fcp

      // ICMS ST
      if (regraImpostos.mod_bc_icms_st !== undefined)
        novosCampos.mod_bc_icms_st = regraImpostos.mod_bc_icms_st
      if (regraImpostos.mva_percentual !== undefined)
        novosCampos.mva_percentual = regraImpostos.mva_percentual
      if (regraImpostos.reducao_bc_icms_st_percentual !== undefined)
        novosCampos.reducao_bc_icms_st_percentual = regraImpostos.reducao_bc_icms_st_percentual
      if (regraImpostos.aliquota_icms_st !== undefined)
        novosCampos.aliquota_icms_st = regraImpostos.aliquota_icms_st
      if (regraImpostos.aliquota_fcp_st !== undefined)
        novosCampos.aliquota_fcp_st = regraImpostos.aliquota_fcp_st

      // Diferimento / desoneração
      if (regraImpostos.percentual_diferimento !== undefined)
        novosCampos.percentual_diferimento = regraImpostos.percentual_diferimento
      if (regraImpostos.motivo_desoneracao !== undefined)
        novosCampos.motivo_desoneracao = regraImpostos.motivo_desoneracao

      // IPI
      if (regraImpostos.cst_ipi !== undefined) novosCampos.cst_ipi_saida = regraImpostos.cst_ipi
      if (regraImpostos.codigo_enquadramento_ipi !== undefined)
        novosCampos.codigo_enquadramento_ipi = regraImpostos.codigo_enquadramento_ipi
      if (regraImpostos.aliquota_ipi !== undefined)
        novosCampos.aliquota_ipi = regraImpostos.aliquota_ipi

      // PIS / COFINS
      if (regraImpostos.cst_pis !== undefined) novosCampos.cst_pis_saida = regraImpostos.cst_pis
      if (regraImpostos.aliquota_pis !== undefined)
        novosCampos.aliquota_pis = regraImpostos.aliquota_pis
      if (regraImpostos.cst_cofins !== undefined)
        novosCampos.cst_cofins_saida = regraImpostos.cst_cofins
      if (regraImpostos.aliquota_cofins !== undefined)
        novosCampos.aliquota_cofins = regraImpostos.aliquota_cofins
      if (regraImpostos.natureza_receita_pis_cofins !== undefined)
        novosCampos.natureza_receita_pis_cofins = regraImpostos.natureza_receita_pis_cofins

      // IBS / CBS
      if (regraImpostos.cst_ibs_cbs !== undefined)
        novosCampos.cst_ibs_cbs = regraImpostos.cst_ibs_cbs
      if (regraImpostos.c_class_trib !== undefined)
        novosCampos.c_class_trib = regraImpostos.c_class_trib
      if (regraImpostos.aliquota_ibs_uf !== undefined)
        novosCampos.aliquota_ibs_uf = regraImpostos.aliquota_ibs_uf
      if (regraImpostos.aliquota_ibs_municipio !== undefined)
        novosCampos.aliquota_ibs_municipio = regraImpostos.aliquota_ibs_municipio
      if (regraImpostos.aliquota_cbs !== undefined)
        novosCampos.aliquota_cbs = regraImpostos.aliquota_cbs
      if (regraImpostos.reducao_ibs_cbs_percentual !== undefined)
        novosCampos.reducao_ibs_cbs_percentual = regraImpostos.reducao_ibs_cbs_percentual
    }

    // Se qualquer campo fiscal for alterado, desmarca fiscal_revisado
    novosCampos.fiscal_revisado = false

    onMudarCamposEmLote(novosCampos)
  }

  // Ao selecionar perfil no componente
  const handleSelecionarPerfil = async (perfilId?: string) => {
    if (!perfilId) {
      onChangeCampo('perfil_tributario_id', '')
      return
    }

    try {
      const perfil = await obterPerfilTributarioCompleto(perfilId)
      if (!perfil) return

      if (temCamposFiscaisPreenchidos) {
        setPerfilPendenteParaAplicar(perfil)
        setModalConfirmaPerfilAberto(true)
      } else {
        aplicarPerfilNoFormulario(perfil)
      }
    } catch (err) {
      console.error('Erro ao buscar perfil tributário:', err)
    }
  }

  const handleConfirmarSobrescreverPerfil = () => {
    if (perfilPendenteParaAplicar) {
      aplicarPerfilNoFormulario(perfilPendenteParaAplicar)
    }
    setModalConfirmaPerfilAberto(false)
    setPerfilPendenteParaAplicar(null)
  }

  // Helper para alteração com desmarcação de fiscal_revisado automática
  const handleChangeFiscal = (campo: keyof Produto, valor: any) => {
    onChangeCampo(campo, valor)
    if (formData.fiscal_revisado) {
      onChangeCampo('fiscal_revisado', false)
    }
  }

  // Sugestões padrão de PIS/COFINS conforme CRT da empresa
  const aplicarSugestoesPisCofinsEmpresa = () => {
    const crtStr = String(crtEmpresaAtiva)
    if (crtStr === '1' || crtStr === '2' || crtStr === '4') {
      // Simples Nacional: CST saída 49, entrada 98, alíquotas 0
      onMudarCamposEmLote({
        cst_pis_saida: '49',
        cst_cofins_saida: '49',
        cst_pis_entrada: '98',
        cst_cofins_entrada: '98',
        aliquota_pis: 0,
        aliquota_cofins: 0,
        tipo_calculo_pis_cofins: 'Percentual',
        fiscal_revisado: false,
      })
    } else {
      // Lucro Presumido (0,65% e 3%) ou Lucro Real (1,65% e 7,6%)
      onMudarCamposEmLote({
        cst_pis_saida: '01',
        cst_cofins_saida: '01',
        cst_pis_entrada: '50',
        cst_cofins_entrada: '50',
        aliquota_pis: 0.65,
        aliquota_cofins: 3.0,
        tipo_calculo_pis_cofins: 'Percentual',
        fiscal_revisado: false,
      })
    }
  }

  // Visibilidade de ICMS Substituição Tributária (Bloco 5)
  const cstIcmsAtual = formData.cst_icms?.trim() || ''
  const csosnAtual = formData.csosn?.trim() || ''
  const exibeBlocoST =
    ['10', '30', '70', '90'].includes(cstIcmsAtual) ||
    ['201', '202', '203', '900'].includes(csosnAtual)
  const ehRetidoAnteriormenteST = cstIcmsAtual === '60' || csosnAtual === '500'

  // Visibilidade de desoneração ICMS: 20, 30, 40, 41, 50, 70, 90
  const exibeDesoneracaoIcms = ['20', '30', '40', '41', '50', '70', '90'].includes(cstIcmsAtual)

  // Visibilidade de redução BC ICMS: 20, 70, 90
  const exibeReducaoBcIcms = ['20', '70', '90'].includes(cstIcmsAtual)

  // Visibilidade de diferimento ICMS: CST 51
  const exibeDiferimentoIcms = cstIcmsAtual === '51'

  // Natureza da receita PIS/COFINS obrigatória para CSTs 04, 05, 06, 07, 08, 09
  const cstPisSaida = formData.cst_pis_saida?.trim() || ''
  const cstCofinsSaida = formData.cst_cofins_saida?.trim() || ''
  const exibeNaturezaReceitaPisCofins =
    ['04', '05', '06', '07', '08', '09'].includes(cstPisSaida) ||
    ['04', '05', '06', '07', '08', '09'].includes(cstCofinsSaida)

  return (
    <div className="space-y-6 text-xs animate-in fade-in">
      {/* ======================================================== */}
      {/* BLOCO 1. PERFIL TRIBUTÁRIO */}
      {/* ======================================================== */}
      <Card className="border-slate-200 shadow-2xs">
        <CardContent className="pt-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-blue-800 font-bold text-xs">
                1
              </span>
              <div>
                <h3 className="font-bold text-slate-900 text-sm">Perfil Tributário</h3>
                <p className="text-[11px] text-slate-500">
                  Importa parâmetros tributários pré-configurados para preenchimento rápido
                </p>
              </div>
            </div>

            {/* Regime da empresa ativa (CRT) */}
            <Badge
              variant="outline"
              className={`px-3 py-1 text-xs font-semibold ${
                regimeEmpresaAtiva === 'Simples Nacional'
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                  : 'bg-blue-50 text-blue-800 border-blue-300'
              }`}
            >
              {regimeEmpresaAtiva === 'Simples Nacional'
                ? 'Empresa no Simples Nacional: usa CSOSN'
                : 'Empresa no Regime Normal: usa CST'}
            </Badge>
          </div>

          {/* Sugestão de perfil do grupo se houver */}
          {perfilSugeridoGrupo && !formData.perfil_tributario_id && (
            <Alert className="bg-amber-50/70 border-amber-200 text-amber-900 py-2.5">
              <Sparkles className="h-4 w-4 text-amber-600" />
              <AlertDescription className="text-xs flex items-center justify-between flex-wrap gap-2">
                <span>
                  O grupo selecionado possui o perfil padrão{' '}
                  <strong>{perfilSugeridoGrupo.nome}</strong>.
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => handleSelecionarPerfil(perfilSugeridoGrupo.id)}
                  className="h-7 text-xs bg-white text-amber-900 border-amber-300 hover:bg-amber-100"
                >
                  Usar perfil do grupo
                </Button>
              </AlertDescription>
            </Alert>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
            <div className="sm:col-span-2">
              <Label className="text-xs font-semibold text-slate-700 block mb-1">
                Perfil Tributário Vinculado
              </Label>
              <SelectPerfilTributario
                value={formData.perfil_tributario_id}
                onChange={handleSelecionarPerfil}
                placeholder="Selecione um perfil tributário para preencher os impostos..."
              />
            </div>

            <div>
              <Button
                type="button"
                variant="outline"
                disabled={!formData.perfil_tributario_id}
                onClick={async () => {
                  if (formData.perfil_tributario_id) {
                    const p = await obterPerfilTributarioCompleto(formData.perfil_tributario_id)
                    if (p) {
                      setPerfilPendenteParaAplicar(p)
                      setModalConfirmaPerfilAberto(true)
                    }
                  }
                }}
                className="w-full h-9 text-xs border-slate-300 hover:bg-slate-50"
              >
                <Sparkles className="h-3.5 w-3.5 mr-1.5 text-blue-600" />
                Reaplicar Perfil
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ======================================================== */}
      {/* BLOCO 2. CLASSIFICAÇÃO FISCAL */}
      {/* ======================================================== */}
      <Card className="border-slate-200 shadow-2xs">
        <CardContent className="pt-5 space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-blue-800 font-bold text-xs">
              2
            </span>
            <div>
              <h3 className="font-bold text-slate-900 text-sm">Classificação Fiscal</h3>
              <p className="text-[11px] text-slate-500">
                NCM, CEST, Origem da mercadoria e registros para SPED
              </p>
            </div>
          </div>

          {/* Linha 1: NCM, EX TIPI e CEST */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="sm:col-span-2">
              <Label className="text-xs font-semibold text-slate-700 block mb-1">
                NCM (Nomenclatura Comum do Mercosul){' '}
                {tipoItemProduto === 'Produto' && <span className="text-rose-600">*</span>}
              </Label>
              <SelectNcm
                value={formData.ncm}
                onChange={(cod, ncmObj) => {
                  handleChangeFiscal('ncm', cod)
                  if (
                    ncmObj?.aliquota_ipi &&
                    (!formData.aliquota_ipi || formData.aliquota_ipi === 0)
                  ) {
                    setAliquotaIpiNcmSugerida(ncmObj.aliquota_ipi)
                  }
                }}
                placeholder="Busque por código ou descrição da NCM..."
              />
              {erros.ncm && (
                <span className="text-[11px] text-rose-600 block mt-1">{erros.ncm}</span>
              )}
            </div>

            <div>
              <Label className="text-xs font-semibold text-slate-700 block mb-1">EX TIPI</Label>
              <Input
                type="text"
                value={formData.ex_tipi || ''}
                onChange={(e) => handleChangeFiscal('ex_tipi', e.target.value)}
                placeholder="Ex: 01"
                className="h-9 text-xs"
                maxLength={3}
              />
              <span className="text-[10px] text-slate-400">Exceção da tabela IPI</span>
            </div>

            <div>
              <Label className="text-xs font-semibold text-slate-700 block mb-1">CEST</Label>
              <SelectCest
                value={formData.cest}
                onChange={(cod) => handleChangeFiscal('cest', cod)}
                ncmVinculado={formData.ncm}
                placeholder="Selecione o CEST..."
              />
              {cestSugeridoAviso && !formData.cest && (
                <div className="flex items-center gap-1 text-[10px] text-amber-700 mt-1">
                  <AlertTriangle className="h-3 w-3 shrink-0" />
                  <span className="truncate">{cestSugeridoAviso}</span>
                </div>
              )}
              {/* Aviso se CEST preenchido for incompatível com o NCM selecionado */}
              {Boolean(formData.cest && formData.ncm) && (
                <AvisoCompatibilidadeCestNcm cest={formData.cest!} ncm={formData.ncm!} />
              )}
              {erros.cest && (
                <span className="text-[11px] text-rose-600 block mt-1">{erros.cest}</span>
              )}
            </div>
          </div>

          {/* Linha 2: Indicador de Escala e CNPJ Fabricante (aparecem quando houver CEST) */}
          {Boolean(formData.cest) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-3 bg-slate-50/70 rounded-lg border border-slate-200">
              <div>
                <Label className="text-xs font-semibold text-slate-700 block mb-1">
                  Indicador de Escala Relevante (CEST)
                </Label>
                <Select
                  value={formData.indicador_escala_relevante || 'S'}
                  onValueChange={(val) => handleChangeFiscal('indicador_escala_relevante', val)}
                >
                  <SelectTrigger className="h-9 text-xs bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="S">S - Produzido em Escala Relevante (Padrão)</SelectItem>
                    <SelectItem value="N">N - Produzido em Escala NÃO Relevante</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {formData.indicador_escala_relevante === 'N' && (
                <div>
                  <Label className="text-xs font-semibold text-slate-700 block mb-1">
                    CNPJ do Fabricante <span className="text-rose-600">*</span>
                  </Label>
                  <Input
                    type="text"
                    value={formData.cnpj_fabricante || ''}
                    onChange={(e) => handleChangeFiscal('cnpj_fabricante', e.target.value)}
                    placeholder="00.000.000/0000-00"
                    className="h-9 text-xs bg-white font-mono"
                    maxLength={18}
                  />
                  {erros.cnpj_fabricante && (
                    <span className="text-[11px] text-rose-600 block mt-1">
                      {erros.cnpj_fabricante}
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Linha 3: Origem, Tipo Item SPED e Código Gênero */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <Label className="text-xs font-semibold text-slate-700 block mb-1">
                Origem da Mercadoria <span className="text-rose-600">*</span>
              </Label>
              <SelectCodigoFiscal
                tipo="ORIGEM"
                value={formData.origem || '0'}
                onChange={(cod) => handleChangeFiscal('origem', cod)}
                placeholder="Selecione a origem..."
              />
              {erros.origem && (
                <span className="text-[11px] text-rose-600 block mt-1">{erros.origem}</span>
              )}
            </div>

            <div>
              <Label className="text-xs font-semibold text-slate-700 block mb-1">
                Tipo do Item SPED (Registro 0200) <span className="text-rose-600">*</span>
              </Label>
              <SelectCodigoFiscal
                tipo="TIPO_ITEM_SPED"
                value={formData.tipo_item_sped || (tipoItemProduto === 'Serviço' ? '09' : '00')}
                onChange={(cod) => handleChangeFiscal('tipo_item_sped', cod)}
                placeholder="00 - Mercadoria para Revenda..."
              />
              {erros.tipo_item_sped && (
                <span className="text-[11px] text-rose-600 block mt-1">{erros.tipo_item_sped}</span>
              )}
            </div>

            <div>
              <Label className="text-xs font-semibold text-slate-700 block mb-1">
                Código Gênero (Automático NCM)
              </Label>
              <Input
                type="text"
                value={formData.codigo_genero || generoCalculado || '—'}
                disabled
                className="h-9 text-xs bg-slate-50 font-mono font-bold text-slate-700"
              />
              <span className="text-[10px] text-slate-400">2 primeiros dígitos do NCM</span>
            </div>
          </div>

          {/* Linha 4: Código de Serviço LC 116 (somente tipo Serviço) */}
          {tipoItemProduto === 'Serviço' && (
            <div className="p-3 bg-purple-50/50 rounded-lg border border-purple-200">
              <Label className="text-xs font-semibold text-purple-900 block mb-1">
                Código de Serviço (Lei Complementar 116/2003)
              </Label>
              <Input
                type="text"
                value={formData.codigo_servico_lc116 || ''}
                onChange={(e) => handleChangeFiscal('codigo_servico_lc116', e.target.value)}
                placeholder="Ex: 01.07 para suporte técnico"
                className="h-9 text-xs bg-white font-mono"
                maxLength={20}
              />
              <span className="text-[10px] text-purple-700">Utilizado na emissão de NFS-e</span>
            </div>
          )}

          {/* Linha 5: Código ANP e Descrição ANP (aparecem só se NCM começar com 2710, 2711 ou 2207) */}
          {ehCombustivel && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-3 bg-amber-50/60 rounded-lg border border-amber-200">
              <div>
                <Label className="text-xs font-semibold text-amber-900 block mb-1">
                  Código ANP (Agência Nacional do Petróleo)
                </Label>
                <Input
                  type="text"
                  value={formData.codigo_anp || ''}
                  onChange={(e) => handleChangeFiscal('codigo_anp', e.target.value)}
                  placeholder="Ex: 210203001"
                  className="h-9 text-xs bg-white font-mono"
                  maxLength={9}
                />
              </div>

              <div>
                <Label className="text-xs font-semibold text-amber-900 block mb-1">
                  Descrição ANP
                </Label>
                <Input
                  type="text"
                  value={formData.descricao_anp || ''}
                  onChange={(e) => handleChangeFiscal('descricao_anp', e.target.value)}
                  placeholder="Descrição conforme tabela ANP"
                  className="h-9 text-xs bg-white"
                  maxLength={95}
                />
              </div>
            </div>
          )}

          {/* Linha 6: Código Benefício Fiscal (cBenef) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label className="text-xs font-semibold text-slate-700 block mb-1">
                cBenef (Código de Benefício Fiscal)
              </Label>
              <Input
                type="text"
                value={formData.c_benef || ''}
                onChange={(e) => handleChangeFiscal('c_benef', e.target.value.toUpperCase())}
                placeholder="Ex: PR800000 ou RS052001"
                className="h-9 text-xs font-mono uppercase"
                maxLength={10}
              />
              <span className="text-[10px] text-slate-400">
                Obrigatório para emissão de NF-e em estados que exigem tabela cBenef
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ======================================================== */}
      {/* BLOCO 3. CFOP PADRÃO */}
      {/* ======================================================== */}
      <Card className="border-slate-200 shadow-2xs">
        <CardContent className="pt-5 space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-blue-800 font-bold text-xs">
              3
            </span>
            <div>
              <h3 className="font-bold text-slate-900 text-sm">CFOP Padrão</h3>
              <p className="text-[11px] text-slate-500">
                Códigos Fiscais de Operações e Prestações sugeridos automaticamente nos pedidos e
                notas
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Saídas */}
            <div className="space-y-3 p-3 bg-blue-50/30 rounded-lg border border-blue-100">
              <span className="text-xs font-bold text-blue-900 block">
                Operações de Saída (Vendas)
              </span>

              <div>
                <Label className="text-xs font-semibold text-slate-700 block mb-1">
                  CFOP Venda Interna (Estadual - 5xxx){' '}
                  {tipoItemProduto === 'Produto' && <span className="text-rose-600">*</span>}
                </Label>
                <SelectCfop
                  value={formData.cfop_venda_interna}
                  onChange={(cod) => handleChangeFiscal('cfop_venda_interna', cod)}
                  tipoMovimento="Saída"
                  placeholder="Ex: 5102 - Venda de mercadoria..."
                />
                {erros.cfop_venda_interna && (
                  <span className="text-[11px] text-rose-600 block mt-1">
                    {erros.cfop_venda_interna}
                  </span>
                )}
              </div>

              <div>
                <Label className="text-xs font-semibold text-slate-700 block mb-1">
                  CFOP Venda Interestadual (Interestadual - 6xxx)
                </Label>
                <SelectCfop
                  value={formData.cfop_venda_interestadual}
                  onChange={(cod) => handleChangeFiscal('cfop_venda_interestadual', cod)}
                  tipoMovimento="Saída"
                  placeholder="Ex: 6102 - Venda interestadual..."
                />
                {erros.cfop_venda_interestadual && (
                  <span className="text-[11px] text-rose-600 block mt-1">
                    {erros.cfop_venda_interestadual}
                  </span>
                )}
              </div>
            </div>

            {/* Entradas */}
            <div className="space-y-3 p-3 bg-emerald-50/30 rounded-lg border border-emerald-100">
              <span className="text-xs font-bold text-emerald-900 block">
                Operações de Entrada (Compras)
              </span>

              <div>
                <Label className="text-xs font-semibold text-slate-700 block mb-1">
                  CFOP Compra Interna (Estadual - 1xxx)
                </Label>
                <SelectCfop
                  value={formData.cfop_compra_interna}
                  onChange={(cod) => handleChangeFiscal('cfop_compra_interna', cod)}
                  tipoMovimento="Entrada"
                  placeholder="Ex: 1102 - Compra para comercialização..."
                />
                {erros.cfop_compra_interna && (
                  <span className="text-[11px] text-rose-600 block mt-1">
                    {erros.cfop_compra_interna}
                  </span>
                )}
              </div>

              <div>
                <Label className="text-xs font-semibold text-slate-700 block mb-1">
                  CFOP Compra Interestadual (Interestadual - 2xxx)
                </Label>
                <SelectCfop
                  value={formData.cfop_compra_interestadual}
                  onChange={(cod) => handleChangeFiscal('cfop_compra_interestadual', cod)}
                  tipoMovimento="Entrada"
                  placeholder="Ex: 2102 - Compra interestadual..."
                />
                {erros.cfop_compra_interestadual && (
                  <span className="text-[11px] text-rose-600 block mt-1">
                    {erros.cfop_compra_interestadual}
                  </span>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ======================================================== */}
      {/* BLOCO 4. ICMS */}
      {/* ======================================================== */}
      <Card className="border-slate-200 shadow-2xs">
        <CardContent className="pt-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-blue-800 font-bold text-xs">
                4
              </span>
              <div>
                <h3 className="font-bold text-slate-900 text-sm">ICMS</h3>
                <p className="text-[11px] text-slate-500">
                  Tributação estadual ordinária e alíquotas internas / interestaduais
                </p>
              </div>
            </div>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setMostrarAmbosRegimesIcms(!mostrarAmbosRegimesIcms)}
              className="text-xs text-blue-700 hover:bg-blue-50 h-8"
            >
              {mostrarAmbosRegimesIcms
                ? 'Ocultar regime alternativo'
                : 'Mostrar ambos (CSOSN e CST)'}
            </Button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Simples Nacional: CSOSN */}
            {(regimeEmpresaAtiva === 'Simples Nacional' || mostrarAmbosRegimesIcms) && (
              <div>
                <Label className="text-xs font-semibold text-slate-700 block mb-1">
                  CSOSN (Simples Nacional){' '}
                  {regimeEmpresaAtiva === 'Simples Nacional' && tipoItemProduto === 'Produto' && (
                    <span className="text-rose-600">*</span>
                  )}
                </Label>
                <SelectCodigoFiscal
                  tipo="CSOSN"
                  value={formData.csosn}
                  onChange={(cod) => handleChangeFiscal('csosn', cod)}
                  placeholder="Selecione o CSOSN..."
                />
                {erros.csosn && (
                  <span className="text-[11px] text-rose-600 block mt-1">{erros.csosn}</span>
                )}
              </div>
            )}

            {/* Regime Normal: CST ICMS */}
            {(regimeEmpresaAtiva === 'Regime Normal' || mostrarAmbosRegimesIcms) && (
              <div>
                <Label className="text-xs font-semibold text-slate-700 block mb-1">
                  CST ICMS (Regime Normal){' '}
                  {regimeEmpresaAtiva === 'Regime Normal' && tipoItemProduto === 'Produto' && (
                    <span className="text-rose-600">*</span>
                  )}
                </Label>
                <SelectCodigoFiscal
                  tipo="CST_ICMS"
                  value={formData.cst_icms}
                  onChange={(cod) => handleChangeFiscal('cst_icms', cod)}
                  placeholder="Selecione o CST do ICMS..."
                />
                {erros.cst_icms && (
                  <span className="text-[11px] text-rose-600 block mt-1">{erros.cst_icms}</span>
                )}
              </div>
            )}
          </div>

          {/* Modalidade BC e Alíquotas */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 pt-2 border-t border-slate-100">
            <div>
              <Label className="text-xs font-semibold text-slate-700 block mb-1">
                Modalidade BC ICMS
              </Label>
              <SelectCodigoFiscal
                tipo="MOD_BC_ICMS"
                value={formData.mod_bc_icms || '3'}
                onChange={(cod) => handleChangeFiscal('mod_bc_icms', cod)}
                placeholder="3 - Valor da operação"
              />
            </div>

            <div>
              <Label className="text-xs font-semibold text-slate-700 block mb-1">
                Alíquota ICMS Interna (%)
              </Label>
              <Input
                type="number"
                step="0.01"
                value={formData.aliquota_icms ?? ''}
                onChange={(e) =>
                  handleChangeFiscal(
                    'aliquota_icms',
                    e.target.value === '' ? null : Number(e.target.value),
                  )
                }
                placeholder="Ex: 18,00"
                className="h-9 text-xs"
              />
            </div>

            <div>
              <Label className="text-xs font-semibold text-slate-700 block mb-1">
                Alíquota ICMS Interestadual (%)
              </Label>
              <Select
                value={
                  formData.aliquota_icms_interestadual !== undefined &&
                  formData.aliquota_icms_interestadual !== null
                    ? String(formData.aliquota_icms_interestadual)
                    : 'none'
                }
                onValueChange={(val) =>
                  handleChangeFiscal(
                    'aliquota_icms_interestadual',
                    val === 'none' ? null : Number(val),
                  )
                }
              >
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Selecione (4%, 7% ou 12%)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Não definido</SelectItem>
                  <SelectItem value="4">4% (Mercadorias importadas)</SelectItem>
                  <SelectItem value="7">
                    7% (Sul/Sudeste exceto ES para Norte/Nordeste/CO/ES)
                  </SelectItem>
                  <SelectItem value="12">12% (Demais operações interestaduais)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs font-semibold text-slate-700 block mb-1">
                Alíquota FCP (%)
              </Label>
              <Input
                type="number"
                step="0.01"
                value={formData.aliquota_fcp ?? ''}
                onChange={(e) =>
                  handleChangeFiscal(
                    'aliquota_fcp',
                    e.target.value === '' ? null : Number(e.target.value),
                  )
                }
                placeholder="Ex: 2,00"
                className="h-9 text-xs"
              />
              <span className="text-[10px] text-slate-400">Fundo de Combate à Pobreza</span>
            </div>
          </div>

          {/* Redução de BC, Diferimento e Desoneração (condicionais) */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
            {exibeReducaoBcIcms && (
              <div>
                <Label className="text-xs font-semibold text-slate-700 block mb-1">
                  Redução BC ICMS (%)
                </Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.reducao_bc_icms_percentual ?? ''}
                  onChange={(e) =>
                    handleChangeFiscal(
                      'reducao_bc_icms_percentual',
                      e.target.value === '' ? null : Number(e.target.value),
                    )
                  }
                  placeholder="Ex: 33,33"
                  className="h-9 text-xs"
                />
                <span className="text-[10px] text-slate-400">Para CSTs 20, 70 e 90</span>
              </div>
            )}

            {exibeDiferimentoIcms && (
              <div>
                <Label className="text-xs font-semibold text-slate-700 block mb-1">
                  Percentual de Diferimento (%)
                </Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.percentual_diferimento ?? ''}
                  onChange={(e) =>
                    handleChangeFiscal(
                      'percentual_diferimento',
                      e.target.value === '' ? null : Number(e.target.value),
                    )
                  }
                  placeholder="Ex: 100,00"
                  className="h-9 text-xs"
                />
                <span className="text-[10px] text-slate-400">Específico para CST 51</span>
              </div>
            )}

            {exibeDesoneracaoIcms && (
              <div>
                <Label className="text-xs font-semibold text-slate-700 block mb-1">
                  Motivo da Desoneração do ICMS
                </Label>
                <Select
                  value={formData.motivo_desoneracao || 'none'}
                  onValueChange={(val) =>
                    handleChangeFiscal('motivo_desoneracao', val === 'none' ? '' : val)
                  }
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Selecione o motivo..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhum</SelectItem>
                    <SelectItem value="1">1 - Táxi</SelectItem>
                    <SelectItem value="3">3 - Produtor Agropecuário</SelectItem>
                    <SelectItem value="4">4 - Frotista / Locadora</SelectItem>
                    <SelectItem value="5">5 - Diplomático / Consular</SelectItem>
                    <SelectItem value="6">6 - Utilitários e Motocicletas SUFRAMA</SelectItem>
                    <SelectItem value="7">7 - SUFRAMA</SelectItem>
                    <SelectItem value="8">8 - Venda a Órgão Público</SelectItem>
                    <SelectItem value="9">9 - Outros</SelectItem>
                    <SelectItem value="12">12 - Fomento comercial</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ======================================================== */}
      {/* BLOCO 5. ICMS SUBSTITUIÇÃO TRIBUTÁRIA */}
      {/* ======================================================== */}
      {exibeBlocoST && (
        <Card className="border-amber-200 bg-amber-50/20 shadow-2xs">
          <CardContent className="pt-5 space-y-4">
            <div className="flex items-center gap-2 border-b border-amber-200 pb-3">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-100 text-amber-800 font-bold text-xs">
                5
              </span>
              <div>
                <h3 className="font-bold text-amber-950 text-sm">
                  ICMS Substituição Tributária (ST)
                </h3>
                <p className="text-[11px] text-amber-700">
                  Parâmetros de retenção e cálculo de MVA para operações com substituição tributária
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <div>
                <Label className="text-xs font-semibold text-slate-700 block mb-1">
                  Modalidade BC ICMS ST <span className="text-rose-600">*</span>
                </Label>
                <SelectCodigoFiscal
                  tipo="MOD_BC_ICMS_ST"
                  value={formData.mod_bc_icms_st || '4'}
                  onChange={(cod) => handleChangeFiscal('mod_bc_icms_st', cod)}
                  placeholder="4 - Margem Valor Agregado (%)"
                />
                {erros.mod_bc_icms_st && (
                  <span className="text-[11px] text-rose-600 block mt-1">
                    {erros.mod_bc_icms_st}
                  </span>
                )}
              </div>

              {formData.mod_bc_icms_st === '4' && (
                <div>
                  <Label className="text-xs font-semibold text-slate-700 block mb-1">
                    MVA / IVA (%)
                  </Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.mva_percentual ?? ''}
                    onChange={(e) =>
                      handleChangeFiscal(
                        'mva_percentual',
                        e.target.value === '' ? null : Number(e.target.value),
                      )
                    }
                    placeholder="Ex: 40,00"
                    className="h-9 text-xs bg-white"
                  />
                  <span className="text-[10px] text-slate-400">Margem de Valor Agregado</span>
                </div>
              )}

              <div>
                <Label className="text-xs font-semibold text-slate-700 block mb-1">
                  Alíquota ICMS ST (%) <span className="text-rose-600">*</span>
                </Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.aliquota_icms_st ?? ''}
                  onChange={(e) =>
                    handleChangeFiscal(
                      'aliquota_icms_st',
                      e.target.value === '' ? null : Number(e.target.value),
                    )
                  }
                  placeholder="Ex: 18,00"
                  className="h-9 text-xs bg-white"
                />
                {erros.aliquota_icms_st && (
                  <span className="text-[11px] text-rose-600 block mt-1">
                    {erros.aliquota_icms_st}
                  </span>
                )}
              </div>

              <div>
                <Label className="text-xs font-semibold text-slate-700 block mb-1">
                  Alíquota FCP ST (%)
                </Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.aliquota_fcp_st ?? ''}
                  onChange={(e) =>
                    handleChangeFiscal(
                      'aliquota_fcp_st',
                      e.target.value === '' ? null : Number(e.target.value),
                    )
                  }
                  placeholder="Ex: 2,00"
                  className="h-9 text-xs bg-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <div>
                <Label className="text-xs font-semibold text-slate-700 block mb-1">
                  Redução BC ICMS ST (%)
                </Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.reducao_bc_icms_st_percentual ?? ''}
                  onChange={(e) =>
                    handleChangeFiscal(
                      'reducao_bc_icms_st_percentual',
                      e.target.value === '' ? null : Number(e.target.value),
                    )
                  }
                  placeholder="0,00"
                  className="h-9 text-xs bg-white"
                />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Nota informativa para CST 60 ou CSOSN 500 */}
      {ehRetidoAnteriormenteST && (
        <Alert className="bg-blue-50/70 border-blue-200 text-blue-900 py-3">
          <Info className="h-4 w-4 text-blue-600" />
          <AlertDescription className="text-xs">
            <strong>Atenção:</strong> ICMS ST retido anteriormente; os valores de base e imposto
            retidos virão da nota de compra (Etapa 3).
          </AlertDescription>
        </Alert>
      )}

      {/* ======================================================== */}
      {/* BLOCO 6. IPI */}
      {/* ======================================================== */}
      <Card className="border-slate-200 shadow-2xs">
        <CardContent className="pt-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-blue-800 font-bold text-xs">
                6
              </span>
              <div>
                <h3 className="font-bold text-slate-900 text-sm">
                  IPI (Imposto sobre Produtos Industrializados)
                </h3>
                <p className="text-[11px] text-slate-500">
                  Enquadramento, alíquota e modalidade de cálculo do IPI
                </p>
              </div>
            </div>

            {empresaNaoContribuinteIpi && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setBlocoIpiExpandido(!blocoIpiExpandido)}
                className="text-xs text-slate-600 hover:text-slate-900 h-8"
              >
                {blocoIpiExpandido ? (
                  <>
                    <ChevronUp className="h-3.5 w-3.5 mr-1" /> Recolher
                  </>
                ) : (
                  <>
                    <ChevronDown className="h-3.5 w-3.5 mr-1" /> Expandir IPI
                  </>
                )}
              </Button>
            )}
          </div>

          {empresaNaoContribuinteIpi && !blocoIpiExpandido && (
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 flex items-center justify-between text-xs text-slate-600">
              <div className="flex items-center gap-2">
                <Info className="h-4 w-4 text-slate-400" />
                <span>
                  <strong>Empresa não contribuinte de IPI:</strong> Sugerido CST de saída 53 (Não
                  tributada) e de entrada 49 (Outras entradas).
                </span>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  handleChangeFiscal('cst_ipi_saida', '53')
                  handleChangeFiscal('cst_ipi_entrada', '49')
                  setBlocoIpiExpandido(true)
                }}
                className="h-7 text-xs"
              >
                Aplicar e Editar
              </Button>
            </div>
          )}

          {(!empresaNaoContribuinteIpi || blocoIpiExpandido) && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <Label className="text-xs font-semibold text-slate-700 block mb-1">
                    CST IPI Saída (50 a 99)
                  </Label>
                  <SelectCodigoFiscal
                    tipo="CST_IPI"
                    value={formData.cst_ipi_saida || (empresaNaoContribuinteIpi ? '53' : '99')}
                    onChange={(cod) => handleChangeFiscal('cst_ipi_saida', cod)}
                    placeholder="Selecione CST Saída (50-99)..."
                  />
                  <span className="text-[10px] text-slate-400">
                    50=Tributada, 52=Zero, 53=Não tributada, 99=Outras
                  </span>
                </div>

                <div>
                  <Label className="text-xs font-semibold text-slate-700 block mb-1">
                    CST IPI Entrada (00 a 49)
                  </Label>
                  <SelectCodigoFiscal
                    tipo="CST_IPI"
                    value={formData.cst_ipi_entrada || '49'}
                    onChange={(cod) => handleChangeFiscal('cst_ipi_entrada', cod)}
                    placeholder="Selecione CST Entrada (00-49)..."
                  />
                  <span className="text-[10px] text-slate-400">
                    00=Recuperação crédito, 01=Tributada alíq zero, 49=Outras
                  </span>
                </div>

                <div>
                  <Label className="text-xs font-semibold text-slate-700 block mb-1">
                    Código de Enquadramento IPI (cEnq)
                  </Label>
                  <Input
                    type="text"
                    value={formData.codigo_enquadramento_ipi || '999'}
                    onChange={(e) => handleChangeFiscal('codigo_enquadramento_ipi', e.target.value)}
                    placeholder="999"
                    className="h-9 text-xs font-mono"
                    maxLength={3}
                  />
                  <span className="text-[10px] text-slate-400">Padrão nacional: 999</span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t border-slate-100">
                <div>
                  <Label className="text-xs font-semibold text-slate-700 block mb-1">
                    Tipo de Cálculo do IPI
                  </Label>
                  <Select
                    value={formData.tipo_calculo_ipi || 'Percentual'}
                    onValueChange={(val: any) => handleChangeFiscal('tipo_calculo_ipi', val)}
                  >
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Percentual">Percentual (%)</SelectItem>
                      <SelectItem value="Valor por unidade">Valor por unidade (R$)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {formData.tipo_calculo_ipi !== 'Valor por unidade' ? (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <Label className="text-xs font-semibold text-slate-700">
                        Alíquota IPI (%)
                      </Label>
                      {aliquotaIpiNcmSugerida !== null && (
                        <button
                          type="button"
                          onClick={() => handleChangeFiscal('aliquota_ipi', aliquotaIpiNcmSugerida)}
                          className="text-[10px] text-blue-600 hover:underline"
                        >
                          Usar da NCM ({aliquotaIpiNcmSugerida}%)
                        </button>
                      )}
                    </div>
                    <Input
                      type="number"
                      step="0.01"
                      value={formData.aliquota_ipi ?? ''}
                      onChange={(e) =>
                        handleChangeFiscal(
                          'aliquota_ipi',
                          e.target.value === '' ? null : Number(e.target.value),
                        )
                      }
                      placeholder="0,00"
                      className="h-9 text-xs"
                    />
                  </div>
                ) : (
                  <div>
                    <Label className="text-xs font-semibold text-slate-700 block mb-1">
                      Valor IPI por Unidade (R$)
                    </Label>
                    <Input
                      type="number"
                      step="0.0001"
                      value={formData.valor_ipi_unidade ?? ''}
                      onChange={(e) =>
                        handleChangeFiscal(
                          'valor_ipi_unidade',
                          e.target.value === '' ? null : Number(e.target.value),
                        )
                      }
                      placeholder="0,0000"
                      className="h-9 text-xs"
                    />
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ======================================================== */}
      {/* BLOCO 7. PIS E COFINS */}
      {/* ======================================================== */}
      <Card className="border-slate-200 shadow-2xs">
        <CardContent className="pt-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-blue-800 font-bold text-xs">
                7
              </span>
              <div>
                <h3 className="font-bold text-slate-900 text-sm">PIS e COFINS</h3>
                <p className="text-[11px] text-slate-500">
                  Contribuições federais sobre a receita bruta (CSTs de 01 a 99)
                </p>
              </div>
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={aplicarSugestoesPisCofinsEmpresa}
              className="text-xs h-8 border-slate-300 hover:bg-slate-50"
            >
              <Sparkles className="h-3.5 w-3.5 mr-1.5 text-blue-600" />
              Sugerir pelo Regime da Empresa
            </Button>
          </div>

          {/* CSTs de Saída e Entrada */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
              <span className="text-xs font-bold text-slate-800 block">
                Operações de Saída (01 a 49)
              </span>

              <div>
                <Label className="text-xs font-semibold text-slate-700 block mb-1">
                  CST PIS Saída{' '}
                  {tipoItemProduto === 'Produto' && <span className="text-rose-600">*</span>}
                </Label>
                <SelectCodigoFiscal
                  tipo="CST_PIS_COFINS"
                  value={formData.cst_pis_saida || '49'}
                  onChange={(cod) => handleChangeFiscal('cst_pis_saida', cod)}
                  placeholder="Selecione CST PIS Saída..."
                />
                {erros.cst_pis_saida && (
                  <span className="text-[11px] text-rose-600 block mt-1">
                    {erros.cst_pis_saida}
                  </span>
                )}
              </div>

              <div>
                <Label className="text-xs font-semibold text-slate-700 block mb-1">
                  CST COFINS Saída{' '}
                  {tipoItemProduto === 'Produto' && <span className="text-rose-600">*</span>}
                </Label>
                <SelectCodigoFiscal
                  tipo="CST_PIS_COFINS"
                  value={formData.cst_cofins_saida || '49'}
                  onChange={(cod) => handleChangeFiscal('cst_cofins_saida', cod)}
                  placeholder="Selecione CST COFINS Saída..."
                />
                {erros.cst_cofins_saida && (
                  <span className="text-[11px] text-rose-600 block mt-1">
                    {erros.cst_cofins_saida}
                  </span>
                )}
              </div>
            </div>

            <div className="space-y-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
              <span className="text-xs font-bold text-slate-800 block">
                Operações de Entrada (50 a 99)
              </span>

              <div>
                <Label className="text-xs font-semibold text-slate-700 block mb-1">
                  CST PIS Entrada
                </Label>
                <SelectCodigoFiscal
                  tipo="CST_PIS_COFINS"
                  value={formData.cst_pis_entrada || '98'}
                  onChange={(cod) => handleChangeFiscal('cst_pis_entrada', cod)}
                  placeholder="Selecione CST PIS Entrada..."
                />
              </div>

              <div>
                <Label className="text-xs font-semibold text-slate-700 block mb-1">
                  CST COFINS Entrada
                </Label>
                <SelectCodigoFiscal
                  tipo="CST_PIS_COFINS"
                  value={formData.cst_cofins_entrada || '98'}
                  onChange={(cod) => handleChangeFiscal('cst_cofins_entrada', cod)}
                  placeholder="Selecione CST COFINS Entrada..."
                />
              </div>
            </div>
          </div>

          {/* Tipo de cálculo e Alíquotas */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t border-slate-100">
            <div>
              <Label className="text-xs font-semibold text-slate-700 block mb-1">
                Tipo de Cálculo PIS/COFINS
              </Label>
              <Select
                value={formData.tipo_calculo_pis_cofins || 'Percentual'}
                onValueChange={(val: any) => handleChangeFiscal('tipo_calculo_pis_cofins', val)}
              >
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Percentual">Percentual (%)</SelectItem>
                  <SelectItem value="Valor por unidade">Valor por unidade (R$)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {formData.tipo_calculo_pis_cofins !== 'Valor por unidade' ? (
              <>
                <div>
                  <Label className="text-xs font-semibold text-slate-700 block mb-1">
                    Alíquota PIS (%)
                  </Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.aliquota_pis ?? ''}
                    onChange={(e) =>
                      handleChangeFiscal(
                        'aliquota_pis',
                        e.target.value === '' ? null : Number(e.target.value),
                      )
                    }
                    placeholder="Ex: 0,65 ou 1,65"
                    className="h-9 text-xs"
                  />
                </div>

                <div>
                  <Label className="text-xs font-semibold text-slate-700 block mb-1">
                    Alíquota COFINS (%)
                  </Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.aliquota_cofins ?? ''}
                    onChange={(e) =>
                      handleChangeFiscal(
                        'aliquota_cofins',
                        e.target.value === '' ? null : Number(e.target.value),
                      )
                    }
                    placeholder="Ex: 3,00 ou 7,60"
                    className="h-9 text-xs"
                  />
                </div>
              </>
            ) : (
              <>
                <div>
                  <Label className="text-xs font-semibold text-slate-700 block mb-1">
                    Valor PIS por Unidade (R$)
                  </Label>
                  <Input
                    type="number"
                    step="0.0001"
                    value={formData.valor_pis_unidade ?? ''}
                    onChange={(e) =>
                      handleChangeFiscal(
                        'valor_pis_unidade',
                        e.target.value === '' ? null : Number(e.target.value),
                      )
                    }
                    placeholder="0,0000"
                    className="h-9 text-xs"
                  />
                </div>

                <div>
                  <Label className="text-xs font-semibold text-slate-700 block mb-1">
                    Valor COFINS por Unidade (R$)
                  </Label>
                  <Input
                    type="number"
                    step="0.0001"
                    value={formData.valor_cofins_unidade ?? ''}
                    onChange={(e) =>
                      handleChangeFiscal(
                        'valor_cofins_unidade',
                        e.target.value === '' ? null : Number(e.target.value),
                      )
                    }
                    placeholder="0,0000"
                    className="h-9 text-xs"
                  />
                </div>
              </>
            )}
          </div>

          {/* Natureza da Receita (obrigatória para CSTs 04 a 09) */}
          {exibeNaturezaReceitaPisCofins && (
            <div className="p-3 bg-amber-50/70 rounded-lg border border-amber-200">
              <Label className="text-xs font-semibold text-amber-900 block mb-1">
                Natureza da Receita PIS/COFINS <span className="text-rose-600">*</span>
              </Label>
              <Input
                type="text"
                value={formData.natureza_receita_pis_cofins || ''}
                onChange={(e) => handleChangeFiscal('natureza_receita_pis_cofins', e.target.value)}
                placeholder="Ex: 101, 102 ou código da tabela 4.3.10 / 4.3.11 do SPED"
                className="h-9 text-xs bg-white font-mono"
                maxLength={20}
              />
              <span className="text-[10px] text-amber-800">
                Obrigatório para CSTs de saída monofásicos, alíquota zero, isentos ou suspensos (04,
                05, 06, 07, 08, 09).
              </span>
              {erros.natureza_receita_pis_cofins && (
                <span className="text-[11px] text-rose-600 block mt-1">
                  {erros.natureza_receita_pis_cofins}
                </span>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ======================================================== */}
      {/* BLOCO 8. IBS E CBS (REFORMA TRIBUTÁRIA) */}
      {/* ======================================================== */}
      <Card className="border-indigo-200 bg-indigo-50/20 shadow-2xs">
        <CardContent className="pt-5 space-y-4">
          <div className="flex items-center gap-2 border-b border-indigo-200 pb-3">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-100 text-indigo-800 font-bold text-xs">
              8
            </span>
            <div>
              <h3 className="font-bold text-indigo-950 text-sm">
                IBS e CBS (Reforma Tributária - EC 132/2023)
              </h3>
              <p className="text-[11px] text-indigo-700">
                Imposto sobre Bens e Serviços e Contribuição sobre Bens e Serviços
              </p>
            </div>
          </div>

          <Alert className="bg-indigo-50 border-indigo-200 text-indigo-950 py-2.5">
            <Info className="h-4 w-4 text-indigo-600" />
            <AlertDescription className="text-xs">
              Em 2026 o IBS e a CBS são informados na NF-e em caráter de teste. Confira as alíquotas
              vigentes com o contador.
            </AlertDescription>
          </Alert>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label className="text-xs font-semibold text-slate-700 block mb-1">
                CST IBS / CBS (Reforma)
              </Label>
              <SelectCodigoFiscal
                tipo="CST_IBS_CBS"
                value={formData.cst_ibs_cbs || '000'}
                onChange={(cod) => handleChangeFiscal('cst_ibs_cbs', cod)}
                placeholder="000 - Tributação integral..."
              />
            </div>

            <div>
              <Label className="text-xs font-semibold text-slate-700 block mb-1">
                cClassTrib (Código de Classificação Tributária)
              </Label>
              <SelectCodigoFiscal
                tipo="CCLASSTRIB"
                value={formData.c_class_trib || '000001'}
                onChange={(cod) => handleChangeFiscal('c_class_trib', cod)}
                placeholder="000001 - Operações padrão..."
              />
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <Label className="text-xs font-semibold text-slate-700 block mb-1">
                Alíquota IBS Estadual (%)
              </Label>
              <Input
                type="number"
                step="0.01"
                value={formData.aliquota_ibs_uf ?? ''}
                onChange={(e) =>
                  handleChangeFiscal(
                    'aliquota_ibs_uf',
                    e.target.value === '' ? null : Number(e.target.value),
                  )
                }
                placeholder="0,10"
                className="h-9 text-xs bg-white"
              />
            </div>

            <div>
              <Label className="text-xs font-semibold text-slate-700 block mb-1">
                Alíquota IBS Municipal (%)
              </Label>
              <Input
                type="number"
                step="0.01"
                value={formData.aliquota_ibs_municipio ?? ''}
                onChange={(e) =>
                  handleChangeFiscal(
                    'aliquota_ibs_municipio',
                    e.target.value === '' ? null : Number(e.target.value),
                  )
                }
                placeholder="0,00"
                className="h-9 text-xs bg-white"
              />
            </div>

            <div>
              <Label className="text-xs font-semibold text-slate-700 block mb-1">
                Alíquota CBS (%)
              </Label>
              <Input
                type="number"
                step="0.01"
                value={formData.aliquota_cbs ?? ''}
                onChange={(e) =>
                  handleChangeFiscal(
                    'aliquota_cbs',
                    e.target.value === '' ? null : Number(e.target.value),
                  )
                }
                placeholder="0,90"
                className="h-9 text-xs bg-white"
              />
            </div>

            <div>
              <Label className="text-xs font-semibold text-slate-700 block mb-1">
                Redução IBS/CBS (%)
              </Label>
              <Input
                type="number"
                step="0.01"
                value={formData.reducao_ibs_cbs_percentual ?? ''}
                onChange={(e) =>
                  handleChangeFiscal(
                    'reducao_ibs_cbs_percentual',
                    e.target.value === '' ? null : Number(e.target.value),
                  )
                }
                placeholder="0,00"
                className="h-9 text-xs bg-white"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ======================================================== */}
      {/* BLOCO 9. INFORMAÇÕES ADICIONAIS */}
      {/* ======================================================== */}
      <Card className="border-slate-200 shadow-2xs">
        <CardContent className="pt-5 space-y-3">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-blue-800 font-bold text-xs">
              9
            </span>
            <div>
              <h3 className="font-bold text-slate-900 text-sm">Informações Adicionais do Item</h3>
              <p className="text-[11px] text-slate-500">
                Texto livre que é impresso nos dados adicionais do produto no DANFE (infAdProd)
              </p>
            </div>
          </div>

          <div>
            <Textarea
              value={formData.informacoes_adicionais_item || ''}
              onChange={(e) => handleChangeFiscal('informacoes_adicionais_item', e.target.value)}
              placeholder="Ex: Produto isento conforme decreto estadual nº... ou Não incidência de IPI..."
              rows={3}
              maxLength={500}
              className="text-xs"
            />
            <div className="flex justify-between text-[10px] text-slate-400 mt-1">
              <span>Sai na tag infAdProd do XML da NF-e</span>
              <span>{formData.informacoes_adicionais_item?.length || 0}/500</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ======================================================== */}
      {/* BLOCO 10. REVISÃO FISCAL */}
      {/* ======================================================== */}
      <Card
        className={`shadow-2xs transition-colors ${
          formData.fiscal_revisado
            ? 'border-emerald-300 bg-emerald-50/20'
            : 'border-slate-200 bg-white'
        }`}
      >
        <CardContent className="pt-5 space-y-3">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-blue-800 font-bold text-xs">
              10
            </span>
            <div>
              <h3 className="font-bold text-slate-900 text-sm">Revisão Fiscal</h3>
              <p className="text-[11px] text-slate-500">
                Auditoria e chancela de conformidade fiscal pelo setor contábil
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-3 rounded-lg border border-slate-200 bg-slate-50">
            <label className="flex items-start gap-3 cursor-pointer">
              <Checkbox
                checked={Boolean(formData.fiscal_revisado)}
                onCheckedChange={(checked) => {
                  const marcado = Boolean(checked)
                  onMudarCamposEmLote({
                    fiscal_revisado: marcado,
                    fiscal_revisado_em: marcado ? new Date().toISOString() : '',
                  })
                }}
                className="mt-0.5"
              />
              <div>
                <span className="font-bold text-slate-900 text-xs block">
                  Tributação conferida pelo contador
                </span>
                <span className="text-[11px] text-slate-500 block mt-0.5">
                  Ao marcar, registra data, hora e seu usuário. Qualquer alteração posterior nos
                  campos fiscais desmarcará automaticamente este selo.
                </span>
              </div>
            </label>

            {formData.fiscal_revisado && (
              <div className="shrink-0 text-right text-[11px] text-emerald-800 bg-emerald-100/80 px-3 py-1.5 rounded border border-emerald-200">
                <div className="flex items-center gap-1 font-semibold">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                  <span>Revisado em:</span>
                </div>
                <span>
                  {formData.fiscal_revisado_em
                    ? new Date(formData.fiscal_revisado_em).toLocaleString('pt-BR')
                    : 'Hoje'}
                </span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* DIÁLOGO: CONFIRMAÇÃO DE SOBREPOSIÇÃO DE PERFIL TRIBUTÁRIO */}
      <Dialog open={modalConfirmaPerfilAberto} onOpenChange={setModalConfirmaPerfilAberto}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
              Substituir dados fiscais?
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              O produto já possui parâmetros fiscais preenchidos. Deseja sobrescrever os campos de
              CFOPs, ICMS, IPI, PIS, COFINS e Reforma Tributária com os valores do perfil
              selecionado (<strong>{perfilPendenteParaAplicar?.nome}</strong>)?
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setModalConfirmaPerfilAberto(false)
                setPerfilPendenteParaAplicar(null)
              }}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleConfirmarSobrescreverPerfil}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              Sim, aplicar perfil
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
