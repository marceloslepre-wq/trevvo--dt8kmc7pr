import React, { useEffect, useState } from 'react'
import {
  Settings,
  Save,
  Building,
  Percent,
  Calendar,
  FolderTree,
  Tag,
  CheckCircle2,
  Info,
} from 'lucide-react'
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
import { useToast } from '@/hooks/use-toast'
import { useEmpresaAtiva } from '@/contexts/EmpresaContext'
import { usePermissoes } from '@/contexts/PermissoesContext'
import {
  ConfigFinanceiraEmpresa,
  obterOuCriarConfigFinanceiraEmpresa,
  salvarConfigFinanceiraEmpresa,
} from '@/services/configFinanceira'
import { PlanoConta, listarTodasContasPlano } from '@/services/planoContas'
import { CentroCusto, listarTodosCentrosCustoAtivos } from '@/services/centrosCusto'

export const ConfiguracaoFinanceiraPage: React.FC = () => {
  const { toast } = useToast()
  const { empresaAtiva } = useEmpresaAtiva()
  const { pode } = usePermissoes()
  const podeEditar = pode('financeiro_bancos', 'editar')

  const [config, setConfig] = useState<ConfigFinanceiraEmpresa | null>(null)
  const [contasPlano, setContasPlano] = useState<PlanoConta[]>([])
  const [centrosCusto, setCentrosCusto] = useState<CentroCusto[]>([])
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)

  const carregarDados = async () => {
    if (!empresaAtiva) return

    try {
      setCarregando(true)
      const [cfg, contas, ccList] = await Promise.all([
        obterOuCriarConfigFinanceiraEmpresa(empresaAtiva.id),
        listarTodasContasPlano({ situacao: 'ativos', apenasAnaliticas: true }),
        listarTodosCentrosCustoAtivos(),
      ])
      setConfig(cfg)
      setContasPlano(contas)
      setCentrosCusto(ccList)
    } catch (err: unknown) {
      console.error(err)
      toast({
        variant: 'destructive',
        title: 'Erro ao carregar configurações',
        description: 'Não foi possível carregar as configurações financeiras da empresa.',
      })
    } finally {
      setCarregando(false)
    }
  }

  useEffect(() => {
    carregarDados()
  }, [empresaAtiva?.id])

  const handleSalvar = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!config || !empresaAtiva) return

    try {
      setSalvando(true)
      const salva = await salvarConfigFinanceiraEmpresa({
        ...config,
        empresa_id: empresaAtiva.id,
      })
      setConfig(salva)
      toast({
        title: 'Configurações salvas',
        description:
          'As regras e contas contábeis padrão da empresa foram atualizadas com sucesso.',
      })
    } catch (err: unknown) {
      console.error(err)
      const msg = err instanceof Error ? err.message : 'Falha ao salvar configurações financeiras.'
      toast({
        variant: 'destructive',
        title: 'Erro ao salvar',
        description: msg,
      })
    } finally {
      setSalvando(false)
    }
  }

  if (carregando) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] gap-3">
        <div className="h-8 w-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-xs text-slate-500 font-medium">
          Carregando configurações financeiras...
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSalvar} className="space-y-6 max-w-5xl mx-auto pb-12">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Settings className="h-6 w-6 text-blue-600" />
            <h1 className="text-xl md:text-2xl font-bold tracking-tight text-slate-900">
              Configurações Financeiras da Empresa
            </h1>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Definição de juros de mora, multas por atraso e mapeamento padrão do plano de contas
            para a empresa{' '}
            <strong className="text-slate-800">
              {empresaAtiva?.nome_fantasia || empresaAtiva?.razao_social}
            </strong>
          </p>
        </div>

        {podeEditar && (
          <Button
            type="submit"
            size="sm"
            disabled={salvando}
            className="text-xs bg-blue-600 hover:bg-blue-700 text-white gap-1.5 shadow-xs"
          >
            <Save size={15} />
            <span>{salvando ? 'Salvando...' : 'Salvar Alterações'}</span>
          </Button>
        )}
      </div>

      {/* Seção 1: Juros, Multa e Carência */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-4">
        <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
          <Percent className="h-4 w-4 text-blue-600" />
          <h2 className="text-sm font-bold text-slate-900">
            Regras de Multa e Juros de Mora (Contas a Pagar e Receber)
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="multa" className="text-xs font-medium text-slate-700">
              Multa por Atraso (%)
            </Label>
            <Input
              id="multa"
              type="number"
              step="0.01"
              value={config?.multa_atraso_percentual ?? ''}
              onChange={(e) =>
                setConfig((prev) =>
                  prev
                    ? {
                        ...prev,
                        multa_atraso_percentual: parseFloat(e.target.value) || 0,
                      }
                    : null,
                )
              }
              placeholder="Ex: 2.00"
              className="text-xs h-9 font-mono"
            />
            <p className="text-[11px] text-slate-400">
              Cobrada uma única vez imediatamente após o vencimento do título.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="juros" className="text-xs font-medium text-slate-700">
              Juros de Mora Mensal (%)
            </Label>
            <Input
              id="juros"
              type="number"
              step="0.01"
              value={config?.juros_mora_mensal_percentual ?? ''}
              onChange={(e) =>
                setConfig((prev) =>
                  prev
                    ? {
                        ...prev,
                        juros_mora_mensal_percentual: parseFloat(e.target.value) || 0,
                      }
                    : null,
                )
              }
              placeholder="Ex: 1.00"
              className="text-xs h-9 font-mono"
            />
            <p className="text-[11px] text-slate-400">
              Proporcional por dia de atraso: (taxa mensal ÷ 30) × dias corridos.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="carencia" className="text-xs font-medium text-slate-700">
              Dias de Carência
            </Label>
            <Input
              id="carencia"
              type="number"
              step="1"
              value={config?.dias_carencia ?? ''}
              onChange={(e) =>
                setConfig((prev) =>
                  prev
                    ? {
                        ...prev,
                        dias_carencia: parseInt(e.target.value, 10) || 0,
                      }
                    : null,
                )
              }
              placeholder="Ex: 0"
              className="text-xs h-9 font-mono"
            />
            <p className="text-[11px] text-slate-400">
              Número de dias pós-vencimento sem incidência de multa nem juros.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="tolerancia_bloqueio" className="text-xs font-medium text-slate-700">
              Tolerância para Bloqueio de Crédito (Dias)
            </Label>
            <Input
              id="tolerancia_bloqueio"
              type="number"
              step="1"
              min="0"
              value={config?.dias_tolerancia_bloqueio ?? 5}
              onChange={(e) =>
                setConfig((prev) =>
                  prev
                    ? {
                        ...prev,
                        dias_tolerancia_bloqueio: Math.max(0, parseInt(e.target.value, 10) || 0),
                      }
                    : null,
                )
              }
              placeholder="Ex: 5"
              className="text-xs h-9 font-mono"
            />
            <p className="text-[11px] text-slate-400">
              Tolerância padrão em dias de atraso antes do cliente ficar Bloqueado (padrão: 5 dias).
            </p>
          </div>
        </div>
      </div>

      {/* Seção 2: Centro de Custo Padrão */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-4">
        <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
          <Tag className="h-4 w-4 text-blue-600" />
          <h2 className="text-sm font-bold text-slate-900">Centro de Custo Padrão</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="cc_padrao" className="text-xs font-medium text-slate-700">
              Centro de Custo Padrão da Empresa
            </Label>
            <Select
              value={config?.centro_custo_padrao_id || 'nenhum'}
              onValueChange={(val) =>
                setConfig((prev) =>
                  prev
                    ? {
                        ...prev,
                        centro_custo_padrao_id: val === 'nenhum' ? undefined : val,
                      }
                    : null,
                )
              }
            >
              <SelectTrigger id="cc_padrao" className="text-xs h-9">
                <SelectValue placeholder="Selecione o centro de custo padrão" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="nenhum">-- Nenhum selecionado --</SelectItem>
                {centrosCusto.map((cc) => (
                  <SelectItem key={cc.id} value={cc.id}>
                    {cc.codigo} - {cc.descricao}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-slate-400">
              Sugerido automaticamente na geração dos títulos a pagar e a receber desta empresa.
            </p>
          </div>
        </div>
      </div>

      {/* Seção 3: Plano de Contas para Compras e Entradas */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-4">
        <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
          <FolderTree className="h-4 w-4 text-blue-600" />
          <h2 className="text-sm font-bold text-slate-900">
            Contas do Plano para Entradas e Compras (Notas Fiscais de Entrada)
          </h2>
        </div>
        <p className="text-xs text-slate-500">
          Utilizadas na geração automática das parcelas do Contas a Pagar na importação ou digitação
          de notas de compras:
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-slate-700">
              Compras para Revenda (Ex: 2.1.01)
            </Label>
            <Select
              value={config?.plano_compras_revenda_id || 'nenhum'}
              onValueChange={(val) =>
                setConfig((prev) =>
                  prev
                    ? {
                        ...prev,
                        plano_compras_revenda_id: val === 'nenhum' ? undefined : val,
                      }
                    : null,
                )
              }
            >
              <SelectTrigger className="text-xs h-9">
                <SelectValue placeholder="Selecione a conta analítica" />
              </SelectTrigger>
              <SelectContent className="max-h-56">
                <SelectItem value="nenhum">-- Não configurada --</SelectItem>
                {contasPlano.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.codigo} - {c.descricao}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-slate-700">
              Matéria-Prima / Industrialização (Ex: 2.1.03)
            </Label>
            <Select
              value={config?.plano_industrializacao_id || 'nenhum'}
              onValueChange={(val) =>
                setConfig((prev) =>
                  prev
                    ? {
                        ...prev,
                        plano_industrializacao_id: val === 'nenhum' ? undefined : val,
                      }
                    : null,
                )
              }
            >
              <SelectTrigger className="text-xs h-9">
                <SelectValue placeholder="Selecione a conta analítica" />
              </SelectTrigger>
              <SelectContent className="max-h-56">
                <SelectItem value="nenhum">-- Não configurada --</SelectItem>
                {contasPlano.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.codigo} - {c.descricao}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-slate-700">
              Material de Uso e Consumo (Ex: 2.4.07)
            </Label>
            <Select
              value={config?.plano_uso_consumo_id || 'nenhum'}
              onValueChange={(val) =>
                setConfig((prev) =>
                  prev
                    ? {
                        ...prev,
                        plano_uso_consumo_id: val === 'nenhum' ? undefined : val,
                      }
                    : null,
                )
              }
            >
              <SelectTrigger className="text-xs h-9">
                <SelectValue placeholder="Selecione a conta analítica" />
              </SelectTrigger>
              <SelectContent className="max-h-56">
                <SelectItem value="nenhum">-- Não configurada --</SelectItem>
                {contasPlano.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.codigo} - {c.descricao}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-slate-700">
              Ativo Imobilizado (Ex: 2.7.01)
            </Label>
            <Select
              value={config?.plano_imobilizado_id || 'nenhum'}
              onValueChange={(val) =>
                setConfig((prev) =>
                  prev
                    ? {
                        ...prev,
                        plano_imobilizado_id: val === 'nenhum' ? undefined : val,
                      }
                    : null,
                )
              }
            >
              <SelectTrigger className="text-xs h-9">
                <SelectValue placeholder="Selecione a conta analítica" />
              </SelectTrigger>
              <SelectContent className="max-h-56">
                <SelectItem value="nenhum">-- Não configurada --</SelectItem>
                {contasPlano.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.codigo} - {c.descricao}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-slate-700">
              Outras Entradas / Outras Despesas (Ex: 2.8.01)
            </Label>
            <Select
              value={config?.plano_outras_entradas_id || 'nenhum'}
              onValueChange={(val) =>
                setConfig((prev) =>
                  prev
                    ? {
                        ...prev,
                        plano_outras_entradas_id: val === 'nenhum' ? undefined : val,
                      }
                    : null,
                )
              }
            >
              <SelectTrigger className="text-xs h-9">
                <SelectValue placeholder="Selecione a conta analítica" />
              </SelectTrigger>
              <SelectContent className="max-h-56">
                <SelectItem value="nenhum">-- Não configurada --</SelectItem>
                {contasPlano.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.codigo} - {c.descricao}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Seção 4: Plano de Contas para Vendas, Juros, Descontos e Movimentações */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-4">
        <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
          <FolderTree className="h-4 w-4 text-blue-600" />
          <h2 className="text-sm font-bold text-slate-900">
            Contas do Plano para Vendas, Juros, Descontos e Transferências
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-slate-700">
              Receita de Vendas (Ex: 1.1.01)
            </Label>
            <Select
              value={config?.plano_vendas_id || 'nenhum'}
              onValueChange={(val) =>
                setConfig((prev) =>
                  prev
                    ? {
                        ...prev,
                        plano_vendas_id: val === 'nenhum' ? undefined : val,
                      }
                    : null,
                )
              }
            >
              <SelectTrigger className="text-xs h-9">
                <SelectValue placeholder="Selecione a conta analítica" />
              </SelectTrigger>
              <SelectContent className="max-h-56">
                <SelectItem value="nenhum">-- Não configurada --</SelectItem>
                {contasPlano.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.codigo} - {c.descricao}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-slate-700">
              Transferências entre Contas (Ex: 3.1.01)
            </Label>
            <Select
              value={config?.plano_transferencias_id || 'nenhum'}
              onValueChange={(val) =>
                setConfig((prev) =>
                  prev
                    ? {
                        ...prev,
                        plano_transferencias_id: val === 'nenhum' ? undefined : val,
                      }
                    : null,
                )
              }
            >
              <SelectTrigger className="text-xs h-9">
                <SelectValue placeholder="Selecione a conta analítica" />
              </SelectTrigger>
              <SelectContent className="max-h-56">
                <SelectItem value="nenhum">-- Não configurada --</SelectItem>
                {contasPlano.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.codigo} - {c.descricao}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-slate-700">
              Juros e Multas Recebidos (Ex: 1.2.01)
            </Label>
            <Select
              value={config?.plano_juros_recebidos_id || 'nenhum'}
              onValueChange={(val) =>
                setConfig((prev) =>
                  prev
                    ? {
                        ...prev,
                        plano_juros_recebidos_id: val === 'nenhum' ? undefined : val,
                      }
                    : null,
                )
              }
            >
              <SelectTrigger className="text-xs h-9">
                <SelectValue placeholder="Selecione a conta analítica" />
              </SelectTrigger>
              <SelectContent className="max-h-56">
                <SelectItem value="nenhum">-- Não configurada --</SelectItem>
                {contasPlano.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.codigo} - {c.descricao}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-slate-700">
              Juros e Multas Pagos (Ex: 2.6.01)
            </Label>
            <Select
              value={config?.plano_juros_pagos_id || 'nenhum'}
              onValueChange={(val) =>
                setConfig((prev) =>
                  prev
                    ? {
                        ...prev,
                        plano_juros_pagos_id: val === 'nenhum' ? undefined : val,
                      }
                    : null,
                )
              }
            >
              <SelectTrigger className="text-xs h-9">
                <SelectValue placeholder="Selecione a conta analítica" />
              </SelectTrigger>
              <SelectContent className="max-h-56">
                <SelectItem value="nenhum">-- Não configurada --</SelectItem>
                {contasPlano.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.codigo} - {c.descricao}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-slate-700">
              Descontos Obtidos (Ex: 1.2.02)
            </Label>
            <Select
              value={config?.plano_descontos_obtidos_id || 'nenhum'}
              onValueChange={(val) =>
                setConfig((prev) =>
                  prev
                    ? {
                        ...prev,
                        plano_descontos_obtidos_id: val === 'nenhum' ? undefined : val,
                      }
                    : null,
                )
              }
            >
              <SelectTrigger className="text-xs h-9">
                <SelectValue placeholder="Selecione a conta analítica" />
              </SelectTrigger>
              <SelectContent className="max-h-56">
                <SelectItem value="nenhum">-- Não configurada --</SelectItem>
                {contasPlano.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.codigo} - {c.descricao}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-slate-700">
              Descontos Concedidos (Ex: 2.6.03)
            </Label>
            <Select
              value={config?.plano_descontos_concedidos_id || 'nenhum'}
              onValueChange={(val) =>
                setConfig((prev) =>
                  prev
                    ? {
                        ...prev,
                        plano_descontos_concedidos_id: val === 'nenhum' ? undefined : val,
                      }
                    : null,
                )
              }
            >
              <SelectTrigger className="text-xs h-9">
                <SelectValue placeholder="Selecione a conta analítica" />
              </SelectTrigger>
              <SelectContent className="max-h-56">
                <SelectItem value="nenhum">-- Não configurada --</SelectItem>
                {contasPlano.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.codigo} - {c.descricao}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
    </form>
  )
}

export default ConfiguracaoFinanceiraPage
