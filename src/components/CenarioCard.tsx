import React, { useState, useEffect } from 'react'
import {
  FileText,
  Percent,
  Coins,
  ShieldAlert,
  ArrowRightLeft,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { SelectCfop } from '@/components/SelectCfop'
import { SelectCodigoFiscal } from '@/components/SelectCodigoFiscal'
import {
  CenarioPerfil,
  CENARIOS_INFO,
  PerfilTributarioRegra,
  RegimePerfilTributario,
  cstOuCsosnIndicaST,
  cstPermiteReducaoBC,
  cstPisCofinsExigeNaturezaReceita,
  validarCfopCenario,
} from '@/services/perfisTributarios'

interface CenarioCardProps {
  cenario: CenarioPerfil
  regime: RegimePerfilTributario
  regra: PerfilTributarioRegra
  aberto: boolean
  onToggleAberto: () => void
  onUpdateRegra: (patch: Partial<PerfilTributarioRegra>) => void
  onCopiarParaOutro: (cenarioOrigem: CenarioPerfil) => void
}

export const CenarioCard: React.FC<CenarioCardProps> = ({
  cenario,
  regime,
  regra,
  aberto,
  onToggleAberto,
  onUpdateRegra,
  onCopiarParaOutro,
}) => {
  const info = CENARIOS_INFO[cenario]
  const [erroCfop, setErroCfop] = useState<string | null>(null)

  // Validação dinâmica do CFOP
  const handleCfopChange = (codigo: string) => {
    const erro = validarCfopCenario(cenario, codigo)
    setErroCfop(erro)
    onUpdateRegra({ cfop: codigo })
  }

  // Verificar se campos ST e redução devem aparecer
  const cstOuCsosnAtual = regime === 'Regime Normal' ? regra.cst_icms : regra.csosn
  const exibirCamposST = cstOuCsosnIndicaST(regime, cstOuCsosnAtual)
  const exibirReducaoBC = cstPermiteReducaoBC(regime, cstOuCsosnAtual)
  const exibirNaturezaReceita = cstPisCofinsExigeNaturezaReceita(regra.cst_pis, regra.cst_cofins)

  return (
    <Card className="border-slate-200 overflow-hidden shadow-2xs">
      {/* Cabeçalho do Cenário */}
      <div
        className="px-4 py-3 bg-slate-50/90 border-b border-slate-200 flex items-center justify-between cursor-pointer select-none hover:bg-slate-100/80 transition-colors"
        onClick={onToggleAberto}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <Badge
            variant="outline"
            className={`text-[10px] font-semibold shrink-0 uppercase tracking-wide ${
              info.tipoMovimentoEsperado === 'Saída'
                ? 'bg-blue-50 text-blue-700 border-blue-200'
                : 'bg-emerald-50 text-emerald-700 border-emerald-200'
            }`}
          >
            {info.tipoMovimentoEsperado}
          </Badge>
          <div className="min-w-0">
            <h4 className="text-sm font-bold text-slate-800 truncate">{info.titulo}</h4>
            <p className="text-[11px] text-slate-500 truncate">{info.descricao}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {regra.cfop && (
            <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded text-xs font-mono font-semibold bg-white border border-slate-200 text-blue-800">
              CFOP {regra.cfop}
            </span>
          )}
          {cstOuCsosnAtual && (
            <span className="hidden md:inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-white border border-slate-200 text-slate-700">
              {regime === 'Regime Normal' ? `CST ${regra.cst_icms}` : `CSOSN ${regra.csosn}`}
            </span>
          )}

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onCopiarParaOutro(cenario)
            }}
            className="text-xs text-blue-600 hover:text-blue-800 hover:bg-blue-50 px-2 py-1 rounded transition-colors"
            title="Copiar os parâmetros deste cenário para outros"
          >
            Copiar cenário
          </button>

          <div className="p-1 text-slate-400">
            {aberto ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </div>
        </div>
      </div>

      {/* Conteúdo Expansível com os Blocos de Campos */}
      {aberto && (
        <CardContent className="p-4 sm:p-5 space-y-6 bg-white">
          {/* ========================================================= */}
          {/* BLOCO 1: CFOP */}
          {/* ========================================================= */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 pb-1 border-b border-slate-100 text-xs font-bold text-slate-800 uppercase tracking-wider">
              <ArrowRightLeft className="h-3.5 w-3.5 text-blue-600" />
              <span>CFOP da Operação</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-700">
                  Código CFOP ({info.tipoMovimentoEsperado})
                </Label>
                <SelectCfop
                  value={regra.cfop || ''}
                  tipoMovimento={info.tipoMovimentoEsperado}
                  onChange={handleCfopChange}
                  placeholder={`Selecione o CFOP de ${info.tipoMovimentoEsperado.toLowerCase()}...`}
                />
                {erroCfop && (
                  <p className="text-xs text-rose-600 font-medium flex items-center gap-1 mt-1">
                    <ShieldAlert className="h-3 w-3 shrink-0" />
                    {erroCfop}
                  </p>
                )}
              </div>
              <div className="text-[11px] text-slate-500 flex items-center p-2 rounded bg-slate-50 border border-slate-100">
                <span>
                  Operações de {info.tipoMovimentoEsperado.toLowerCase()} deste cenário exigem CFOP{' '}
                  {info.tipoMovimentoEsperado === 'Saída'
                    ? 'do grupo 5 (dentro da UF) ou 6 (interestadual)'
                    : 'do grupo 1 (compra interna) ou 2 (compra de outro estado)'}
                  .
                </span>
              </div>
            </div>
          </div>

          {/* ========================================================= */}
          {/* BLOCO 2: ICMS */}
          {/* ========================================================= */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 pb-1 border-b border-slate-100 text-xs font-bold text-slate-800 uppercase tracking-wider">
              <Percent className="h-3.5 w-3.5 text-indigo-600" />
              <span>ICMS {regime === 'Simples Nacional' ? '(CSOSN)' : '(CST)'}</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {regime === 'Regime Normal' ? (
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-slate-700">CST ICMS</Label>
                  <SelectCodigoFiscal
                    tipo="CST_ICMS"
                    value={regra.cst_icms || ''}
                    onChange={(cod) => onUpdateRegra({ cst_icms: cod })}
                    placeholder="Selecione o CST..."
                  />
                </div>
              ) : (
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-slate-700">CSOSN (Simples)</Label>
                  <SelectCodigoFiscal
                    tipo="CSOSN"
                    value={regra.csosn || ''}
                    onChange={(cod) => onUpdateRegra({ csosn: cod })}
                    placeholder="Selecione o CSOSN..."
                  />
                </div>
              )}

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-700">Mod. BC ICMS</Label>
                <SelectCodigoFiscal
                  tipo="MOD_BC_ICMS"
                  value={regra.mod_bc_icms || ''}
                  onChange={(cod) => onUpdateRegra({ mod_bc_icms: cod })}
                  placeholder="Selecione a modalidade..."
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-700">Alíquota ICMS (%)</Label>
                <Input
                  type="number"
                  step="0.0001"
                  min="0"
                  max="100"
                  value={
                    regra.aliquota_icms !== null && regra.aliquota_icms !== undefined
                      ? regra.aliquota_icms
                      : ''
                  }
                  onChange={(e) =>
                    onUpdateRegra({
                      aliquota_icms: e.target.value !== '' ? parseFloat(e.target.value) : null,
                    })
                  }
                  placeholder="Ex: 18.0000"
                  className="font-mono text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-700">Alíquota FCP (%)</Label>
                <Input
                  type="number"
                  step="0.0001"
                  min="0"
                  max="100"
                  value={
                    regra.aliquota_fcp !== null && regra.aliquota_fcp !== undefined
                      ? regra.aliquota_fcp
                      : ''
                  }
                  onChange={(e) =>
                    onUpdateRegra({
                      aliquota_fcp: e.target.value !== '' ? parseFloat(e.target.value) : null,
                    })
                  }
                  placeholder="Ex: 2.0000"
                  className="font-mono text-xs"
                />
              </div>
            </div>

            {/* Redução de Base de ICMS (Condicional a CST 20, 70 ou 90) */}
            {exibirReducaoBC ? (
              <div className="p-3 rounded-md bg-amber-50/60 border border-amber-200 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-amber-900">
                    Redução Base ICMS (%)
                  </Label>
                  <Input
                    type="number"
                    step="0.0001"
                    min="0"
                    max="100"
                    value={
                      regra.reducao_bc_icms_percentual !== null &&
                      regra.reducao_bc_icms_percentual !== undefined
                        ? regra.reducao_bc_icms_percentual
                        : ''
                    }
                    onChange={(e) =>
                      onUpdateRegra({
                        reducao_bc_icms_percentual:
                          e.target.value !== '' ? parseFloat(e.target.value) : null,
                      })
                    }
                    placeholder="Ex: 33.3333"
                    className="font-mono text-xs bg-white"
                  />
                  <p className="text-[10px] text-amber-700">
                    Ativo pois o código selecionado permite redução da base de cálculo.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-amber-900">
                    Motivo Desoneração (se aplicável)
                  </Label>
                  <Input
                    value={regra.motivo_desoneracao || ''}
                    onChange={(e) => onUpdateRegra({ motivo_desoneracao: e.target.value })}
                    placeholder="Código de desoneração"
                    className="text-xs bg-white"
                  />
                </div>
              </div>
            ) : null}

            {/* Diferimento de ICMS */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-700">Diferimento ICMS (%)</Label>
                <Input
                  type="number"
                  step="0.0001"
                  min="0"
                  max="100"
                  value={
                    regra.percentual_diferimento !== null &&
                    regra.percentual_diferimento !== undefined
                      ? regra.percentual_diferimento
                      : ''
                  }
                  onChange={(e) =>
                    onUpdateRegra({
                      percentual_diferimento:
                        e.target.value !== '' ? parseFloat(e.target.value) : null,
                    })
                  }
                  placeholder="Ex: 100.00"
                  className="font-mono text-xs"
                />
              </div>
            </div>
          </div>

          {/* ========================================================= */}
          {/* BLOCO 3: ICMS ST (Visibilidade dinâmica) */}
          {/* ========================================================= */}
          {exibirCamposST ? (
            <div className="space-y-3 p-3.5 rounded-lg bg-blue-50/40 border border-blue-200">
              <div className="flex items-center gap-2 pb-1 border-b border-blue-200 text-xs font-bold text-blue-900 uppercase tracking-wider">
                <Coins className="h-3.5 w-3.5 text-blue-600" />
                <span>Substituição Tributária (ICMS ST)</span>
                <span className="text-[10px] font-normal text-blue-700 lowercase">
                  (habilitado pelo CST/CSOSN)
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-slate-700">Mod. BC ST</Label>
                  <SelectCodigoFiscal
                    tipo="MOD_BC_ICMS_ST"
                    value={regra.mod_bc_icms_st || ''}
                    onChange={(cod) => onUpdateRegra({ mod_bc_icms_st: cod })}
                    placeholder="Modalidade ST..."
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-slate-700">MVA / IVA (%)</Label>
                  <Input
                    type="number"
                    step="0.0001"
                    min="0"
                    max="1000"
                    value={
                      regra.mva_percentual !== null && regra.mva_percentual !== undefined
                        ? regra.mva_percentual
                        : ''
                    }
                    onChange={(e) =>
                      onUpdateRegra({
                        mva_percentual: e.target.value !== '' ? parseFloat(e.target.value) : null,
                      })
                    }
                    placeholder="Ex: 40.0000"
                    className="font-mono text-xs bg-white"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-slate-700">Redução BC ST (%)</Label>
                  <Input
                    type="number"
                    step="0.0001"
                    min="0"
                    max="100"
                    value={
                      regra.reducao_bc_icms_st_percentual !== null &&
                      regra.reducao_bc_icms_st_percentual !== undefined
                        ? regra.reducao_bc_icms_st_percentual
                        : ''
                    }
                    onChange={(e) =>
                      onUpdateRegra({
                        reducao_bc_icms_st_percentual:
                          e.target.value !== '' ? parseFloat(e.target.value) : null,
                      })
                    }
                    placeholder="Ex: 0.0000"
                    className="font-mono text-xs bg-white"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-slate-700">
                    Alíquota ICMS ST (%)
                  </Label>
                  <Input
                    type="number"
                    step="0.0001"
                    min="0"
                    max="100"
                    value={
                      regra.aliquota_icms_st !== null && regra.aliquota_icms_st !== undefined
                        ? regra.aliquota_icms_st
                        : ''
                    }
                    onChange={(e) =>
                      onUpdateRegra({
                        aliquota_icms_st: e.target.value !== '' ? parseFloat(e.target.value) : null,
                      })
                    }
                    placeholder="Ex: 18.0000"
                    className="font-mono text-xs bg-white"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-slate-700">
                    Alíquota FCP ST (%)
                  </Label>
                  <Input
                    type="number"
                    step="0.0001"
                    min="0"
                    max="100"
                    value={
                      regra.aliquota_fcp_st !== null && regra.aliquota_fcp_st !== undefined
                        ? regra.aliquota_fcp_st
                        : ''
                    }
                    onChange={(e) =>
                      onUpdateRegra({
                        aliquota_fcp_st: e.target.value !== '' ? parseFloat(e.target.value) : null,
                      })
                    }
                    placeholder="Ex: 2.0000"
                    className="font-mono text-xs bg-white"
                  />
                </div>
              </div>
            </div>
          ) : null}

          {/* ========================================================= */}
          {/* BLOCO 4: IPI */}
          {/* ========================================================= */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 pb-1 border-b border-slate-100 text-xs font-bold text-slate-800 uppercase tracking-wider">
              <Coins className="h-3.5 w-3.5 text-amber-600" />
              <span>Imposto sobre Produtos Industrializados (IPI)</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-700">CST IPI</Label>
                <SelectCodigoFiscal
                  tipo="CST_IPI"
                  value={regra.cst_ipi || ''}
                  onChange={(cod) => onUpdateRegra({ cst_ipi: cod })}
                  placeholder="Selecione o CST IPI..."
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-700">
                  Cód. Enquadramento IPI (3 dígitos)
                </Label>
                <Input
                  maxLength={3}
                  value={regra.codigo_enquadramento_ipi || ''}
                  onChange={(e) =>
                    onUpdateRegra({
                      codigo_enquadramento_ipi: e.target.value.replace(/\D/g, '').slice(0, 3),
                    })
                  }
                  placeholder="Padrão 999"
                  className="font-mono text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-700">Alíquota IPI (%)</Label>
                <Input
                  type="number"
                  step="0.0001"
                  min="0"
                  max="100"
                  value={
                    regra.aliquota_ipi !== null && regra.aliquota_ipi !== undefined
                      ? regra.aliquota_ipi
                      : ''
                  }
                  onChange={(e) =>
                    onUpdateRegra({
                      aliquota_ipi: e.target.value !== '' ? parseFloat(e.target.value) : null,
                    })
                  }
                  placeholder="Ex: 5.0000"
                  className="font-mono text-xs"
                />
              </div>
            </div>
          </div>

          {/* ========================================================= */}
          {/* BLOCO 5: PIS e COFINS */}
          {/* ========================================================= */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 pb-1 border-b border-slate-100 text-xs font-bold text-slate-800 uppercase tracking-wider">
              <Coins className="h-3.5 w-3.5 text-teal-600" />
              <span>PIS e COFINS</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-700">CST PIS</Label>
                <SelectCodigoFiscal
                  tipo="CST_PIS_COFINS"
                  value={regra.cst_pis || ''}
                  onChange={(cod) => onUpdateRegra({ cst_pis: cod })}
                  placeholder="CST PIS..."
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-700">Alíquota PIS (%)</Label>
                <Input
                  type="number"
                  step="0.0001"
                  min="0"
                  max="100"
                  value={
                    regra.aliquota_pis !== null && regra.aliquota_pis !== undefined
                      ? regra.aliquota_pis
                      : ''
                  }
                  onChange={(e) =>
                    onUpdateRegra({
                      aliquota_pis: e.target.value !== '' ? parseFloat(e.target.value) : null,
                    })
                  }
                  placeholder="Ex: 0.6500"
                  className="font-mono text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-700">CST COFINS</Label>
                <SelectCodigoFiscal
                  tipo="CST_PIS_COFINS"
                  value={regra.cst_cofins || ''}
                  onChange={(cod) => onUpdateRegra({ cst_cofins: cod })}
                  placeholder="CST COFINS..."
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-700">Alíquota COFINS (%)</Label>
                <Input
                  type="number"
                  step="0.0001"
                  min="0"
                  max="100"
                  value={
                    regra.aliquota_cofins !== null && regra.aliquota_cofins !== undefined
                      ? regra.aliquota_cofins
                      : ''
                  }
                  onChange={(e) =>
                    onUpdateRegra({
                      aliquota_cofins: e.target.value !== '' ? parseFloat(e.target.value) : null,
                    })
                  }
                  placeholder="Ex: 3.0000"
                  className="font-mono text-xs"
                />
              </div>
            </div>

            {/* Natureza da Receita (Exigida quando CST PIS/COFINS = 04 a 09) */}
            {exibirNaturezaReceita ? (
              <div className="p-3 rounded-md bg-teal-50/60 border border-teal-200 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-teal-900">
                    Natureza da Receita (3 dígitos) <span className="text-rose-600">*</span>
                  </Label>
                  <Input
                    maxLength={3}
                    value={regra.natureza_receita_pis_cofins || ''}
                    onChange={(e) =>
                      onUpdateRegra({
                        natureza_receita_pis_cofins: e.target.value.replace(/\D/g, '').slice(0, 3),
                      })
                    }
                    placeholder="Ex: 101, 201..."
                    className="font-mono text-xs bg-white"
                  />
                  <p className="text-[10px] text-teal-700">
                    Obrigatório para CSTs de PIS/COFINS entre 04 e 09 (Tabelas 4.3.10 a 4.3.16
                    SPED).
                  </p>
                </div>
              </div>
            ) : null}
          </div>

          {/* ========================================================= */}
          {/* BLOCO 6: IBS e CBS (Reforma Tributária) */}
          {/* ========================================================= */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 pb-1 border-b border-slate-100 text-xs font-bold text-slate-800 uppercase tracking-wider">
              <Coins className="h-3.5 w-3.5 text-purple-600" />
              <span>IBS e CBS (Reforma Tributária - EC 132/23)</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-700">CST IBS/CBS</Label>
                <SelectCodigoFiscal
                  tipo="CST_IBS_CBS"
                  value={regra.cst_ibs_cbs || ''}
                  onChange={(cod) => onUpdateRegra({ cst_ibs_cbs: cod })}
                  placeholder="Selecione o CST IBS/CBS..."
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-700">
                  Classificação Tributária (cClassTrib)
                </Label>
                <SelectCodigoFiscal
                  tipo="CCLASSTRIB"
                  value={regra.c_class_trib || ''}
                  onChange={(cod) => onUpdateRegra({ c_class_trib: cod })}
                  placeholder="Classificação oficial..."
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-700">Redução IBS/CBS (%)</Label>
                <Input
                  type="number"
                  step="0.0001"
                  min="0"
                  max="100"
                  value={
                    regra.reducao_ibs_cbs_percentual !== null &&
                    regra.reducao_ibs_cbs_percentual !== undefined
                      ? regra.reducao_ibs_cbs_percentual
                      : ''
                  }
                  onChange={(e) =>
                    onUpdateRegra({
                      reducao_ibs_cbs_percentual:
                        e.target.value !== '' ? parseFloat(e.target.value) : null,
                    })
                  }
                  placeholder="Ex: 60.0000"
                  className="font-mono text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-700">
                  Alíquota IBS Estadual (%)
                </Label>
                <Input
                  type="number"
                  step="0.0001"
                  min="0"
                  max="100"
                  value={
                    regra.aliquota_ibs_uf !== null && regra.aliquota_ibs_uf !== undefined
                      ? regra.aliquota_ibs_uf
                      : ''
                  }
                  onChange={(e) =>
                    onUpdateRegra({
                      aliquota_ibs_uf: e.target.value !== '' ? parseFloat(e.target.value) : null,
                    })
                  }
                  placeholder="Ex: 10.0000"
                  className="font-mono text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-700">
                  Alíquota IBS Municipal (%)
                </Label>
                <Input
                  type="number"
                  step="0.0001"
                  min="0"
                  max="100"
                  value={
                    regra.aliquota_ibs_municipio !== null &&
                    regra.aliquota_ibs_municipio !== undefined
                      ? regra.aliquota_ibs_municipio
                      : ''
                  }
                  onChange={(e) =>
                    onUpdateRegra({
                      aliquota_ibs_municipio:
                        e.target.value !== '' ? parseFloat(e.target.value) : null,
                    })
                  }
                  placeholder="Ex: 5.0000"
                  className="font-mono text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-700">
                  Alíquota CBS Federal (%)
                </Label>
                <Input
                  type="number"
                  step="0.0001"
                  min="0"
                  max="100"
                  value={
                    regra.aliquota_cbs !== null && regra.aliquota_cbs !== undefined
                      ? regra.aliquota_cbs
                      : ''
                  }
                  onChange={(e) =>
                    onUpdateRegra({
                      aliquota_cbs: e.target.value !== '' ? parseFloat(e.target.value) : null,
                    })
                  }
                  placeholder="Ex: 8.8000"
                  className="font-mono text-xs"
                />
              </div>
            </div>
          </div>

          {/* ========================================================= */}
          {/* BLOCO 7: Observação Fiscal */}
          {/* ========================================================= */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 pb-1 border-b border-slate-100 text-xs font-bold text-slate-800 uppercase tracking-wider">
              <FileText className="h-3.5 w-3.5 text-slate-600" />
              <span>Observação Fiscal (Informações Complementares da Nota)</span>
            </div>
            <Textarea
              rows={2}
              value={regra.observacao_fiscal || ''}
              onChange={(e) => onUpdateRegra({ observacao_fiscal: e.target.value })}
              placeholder="Texto legal ou instrução fiscal a ser impressa no campo de informações complementares do documento fiscal..."
              className="text-xs"
            />
          </div>
        </CardContent>
      )}
    </Card>
  )
}

export default CenarioCard
