import React, { useEffect, useState } from 'react'
import {
  Settings2,
  Save,
  Info,
  CheckCircle2,
  AlertCircle,
  ShoppingBag,
  CreditCard,
  Percent,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
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
  ConfigVendasEmpresa,
  obterOuCriarConfigVendasEmpresa,
  salvarConfigVendasEmpresa,
} from '@/services/configVendas'
import { PlanoConta, listarTodasContasPlano } from '@/services/planoContas'
import { Cliente, listarClientes } from '@/services/clientes'

export const ConfigVendasPage: React.FC = () => {
  const { toast } = useToast()
  const { empresaAtiva } = useEmpresaAtiva()
  const { pode } = usePermissoes()
  const podeEditar = pode('vendas', 'editar')

  const [config, setConfig] = useState<ConfigVendasEmpresa | null>(null)
  const [contasPlano, setContasPlano] = useState<PlanoConta[]>([])
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [modificado, setModificado] = useState(false)

  const carregarDados = async () => {
    if (!empresaAtiva) return
    try {
      setCarregando(true)
      const [cfg, todasContas, resClientes] = await Promise.all([
        obterOuCriarConfigVendasEmpresa(empresaAtiva.id),
        listarTodasContasPlano({ situacao: 'ativos' }),
        listarClientes({ situacao: 'ativos', porPagina: 500 }),
      ])
      setConfig(cfg)
      // Filtra apenas contas analíticas para seleção de lançamentos
      setContasPlano(todasContas.filter((c) => c.natureza === 'Analítica'))
      setClientes(resClientes.items)
      setModificado(false)
    } catch (err: unknown) {
      console.error(err)
      toast({
        variant: 'destructive',
        title: 'Erro ao carregar',
        description: 'Não foi possível carregar as configurações de vendas.',
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
    if (!empresaAtiva || !config) return

    try {
      setSalvando(true)
      const salva = await salvarConfigVendasEmpresa({
        ...config,
        empresa_id: empresaAtiva.id,
      })
      setConfig(salva)
      setModificado(false)
      toast({
        title: 'Configurações de vendas salvas',
        description: 'Os parâmetros foram atualizados com sucesso.',
      })
    } catch (err: unknown) {
      console.error(err)
      const msg = err instanceof Error ? err.message : 'Falha ao salvar as configurações de vendas.'
      toast({
        variant: 'destructive',
        title: 'Erro ao salvar',
        description: msg,
      })
    } finally {
      setSalvando(false)
    }
  }

  if (!empresaAtiva) {
    return (
      <div className="p-8 text-center text-slate-500 text-xs">
        Selecione uma empresa ativa para visualizar as configurações de vendas.
      </div>
    )
  }

  if (carregando) {
    return (
      <div className="py-24 text-center text-slate-500 text-xs">
        <div className="h-6 w-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
        Carregando parâmetros de vendas...
      </div>
    )
  }

  return (
    <form onSubmit={handleSalvar} className="space-y-6 max-w-5xl mx-auto pb-12">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Settings2 className="h-6 w-6 text-blue-600" />
            <h1 className="text-xl md:text-2xl font-bold tracking-tight text-slate-900">
              Configurações de Vendas e PDV
            </h1>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Parâmetros de frente de caixa, consumidor padrão, políticas de estoque, orçamentos e
            contas contábeis para a filial{' '}
            <strong className="text-slate-700">
              {empresaAtiva.nome_fantasia || empresaAtiva.razao_social}
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

      {modificado && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center justify-between text-xs text-amber-800">
          <div className="flex items-center gap-2">
            <AlertCircle size={16} className="text-amber-600 flex-shrink-0" />
            <span>Você possui alterações não salvas nesta página.</span>
          </div>
          <Button
            type="submit"
            size="sm"
            disabled={salvando}
            className="h-7 text-xs bg-amber-600 hover:bg-amber-700 text-white"
          >
            Salvar agora
          </Button>
        </div>
      )}

      {/* Seção 1: Políticas de Atendimento e Estoque */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-4">
        <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
          <ShoppingBag className="h-4 w-4 text-blue-600" />
          <h2 className="text-sm font-semibold text-slate-900">
            Regras de Venda, Clientes e Estoque
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="cliente_padrao" className="text-xs font-medium text-slate-700">
              Cliente Padrão no Balcão / PDV (Consumidor Final)
            </Label>
            <Select
              value={config?.cliente_padrao_id || 'nenhum'}
              onValueChange={(val) => {
                setConfig((prev) =>
                  prev ? { ...prev, cliente_padrao_id: val === 'nenhum' ? undefined : val } : null,
                )
                setModificado(true)
              }}
            >
              <SelectTrigger id="cliente_padrao" className="text-xs h-9">
                <SelectValue placeholder="Selecione o cliente padrão" />
              </SelectTrigger>
              <SelectContent className="max-h-56">
                <SelectItem value="nenhum">-- Nenhum selecionado --</SelectItem>
                {clientes.map((cli) => (
                  <SelectItem key={cli.id} value={cli.id}>
                    {cli.codigo ? `[${cli.codigo}] ` : ''}
                    {cli.nome_razao_social} {cli.consumidor_final ? '(Consumidor Final)' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-slate-400">
              Cliente atribuído automaticamente na abertura de novas vendas no PDV (pessoa Física,
              sem CPF e indicador IE 9).
            </p>
          </div>

          <div className="space-y-1.5">
            <Label
              htmlFor="exige_cliente_identificado"
              className="text-xs font-medium text-slate-700"
            >
              Exigir Identificação de Cliente Acima de (R$)
            </Label>
            <Input
              id="exige_cliente_identificado"
              type="number"
              step="0.01"
              value={
                config?.exige_cliente_identificado_acima_de !== undefined &&
                config?.exige_cliente_identificado_acima_de !== null
                  ? config.exige_cliente_identificado_acima_de
                  : ''
              }
              onChange={(e) => {
                const val = e.target.value === '' ? null : parseFloat(e.target.value)
                setConfig((prev) =>
                  prev
                    ? {
                        ...prev,
                        exige_cliente_identificado_acima_de: val,
                      }
                    : null,
                )
                setModificado(true)
              }}
              placeholder="Ex: 10000,00 (deixe vazio para não exigir)"
              className="text-xs h-9 font-mono"
            />
            <p className="text-[11px] text-slate-400">
              Vendas que excederem este valor exigirão CPF/CNPJ identificado (ex: exigência SEFAZ /
              compliance).
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-slate-100">
          <div className="space-y-1.5">
            <Label
              htmlFor="permite_vender_sem_estoque"
              className="text-xs font-medium text-slate-700"
            >
              Permissão de Venda sem Estoque no PDV
            </Label>
            <Select
              value={
                config?.permite_vender_sem_estoque === null ||
                config?.permite_vender_sem_estoque === undefined
                  ? 'padrao_empresa'
                  : config.permite_vender_sem_estoque
                    ? 'sim'
                    : 'nao'
              }
              onValueChange={(val) => {
                const bVal = val === 'padrao_empresa' ? null : val === 'sim'
                setConfig((prev) => (prev ? { ...prev, permite_vender_sem_estoque: bVal } : null))
                setModificado(true)
              }}
            >
              <SelectTrigger id="permite_vender_sem_estoque" className="text-xs h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="padrao_empresa">
                  Seguir regra geral da empresa (
                  {empresaAtiva.permite_estoque_negativo ? 'Permitido' : 'Bloqueado'})
                </SelectItem>
                <SelectItem value="sim">
                  Sempre permitir venda sem estoque (gera saldo negativo)
                </SelectItem>
                <SelectItem value="nao">Bloquear venda quando estoque insuficiente</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[11px] text-slate-400">
              Quando definido como padrão da empresa, obedece à trava cadastrada na matriz/filial.
            </p>
          </div>

          <div className="flex items-center justify-between p-3 rounded-lg bg-slate-50 border border-slate-200">
            <div className="space-y-0.5 pr-4">
              <Label
                htmlFor="bloquear_prazo"
                className="text-xs font-medium text-slate-800 cursor-pointer"
              >
                Bloquear Venda a Prazo para Cliente Inadimplente / Bloqueado
              </Label>
              <p className="text-[11px] text-slate-500">
                Se desativado, o sistema apenas exibirá um aviso de tolerância ao vendedor em vez de
                travar a finalização.
              </p>
            </div>
            <Switch
              id="bloquear_prazo"
              checked={config?.bloquear_venda_prazo_cliente_bloqueado !== false}
              onCheckedChange={(val) => {
                setConfig((prev) =>
                  prev ? { ...prev, bloquear_venda_prazo_cliente_bloqueado: val } : null,
                )
                setModificado(true)
              }}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-slate-100">
          <div className="space-y-1.5">
            <Label htmlFor="validade_orcamento_dias" className="text-xs font-medium text-slate-700">
              Validade Padrão de Orçamentos (Dias)
            </Label>
            <Input
              id="validade_orcamento_dias"
              type="number"
              step="1"
              value={config?.validade_orcamento_dias ?? 7}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10)
                setConfig((prev) =>
                  prev
                    ? {
                        ...prev,
                        validade_orcamento_dias: isNaN(val) ? 7 : Math.max(1, val),
                      }
                    : null,
                )
                setModificado(true)
              }}
              className="text-xs h-9 font-mono"
            />
            <p className="text-[11px] text-slate-400">
              Prazo sugerido de validade da proposta ao gerar orçamentos.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="dias_para_troca" className="text-xs font-medium text-slate-700">
              Prazo para Troca de Mercadorias (Dias)
            </Label>
            <Input
              id="dias_para_troca"
              type="number"
              step="1"
              value={config?.dias_para_troca ?? 30}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10)
                setConfig((prev) =>
                  prev
                    ? {
                        ...prev,
                        dias_para_troca: isNaN(val) ? 30 : Math.max(0, val),
                      }
                    : null,
                )
                setModificado(true)
              }}
              className="text-xs h-9 font-mono"
            />
            <p className="text-[11px] text-slate-400">
              Prazo impresso no cupom e considerado nas devoluções de balcão.
            </p>
          </div>
        </div>

        <div className="space-y-1.5 pt-2 border-t border-slate-100">
          <Label htmlFor="mensagem_rodape" className="text-xs font-medium text-slate-700">
            Mensagem de Rodapé no Comprovante de Venda / Cupom
          </Label>
          <Input
            id="mensagem_rodape"
            value={config?.mensagem_rodape_comprovante || ''}
            onChange={(e) => {
              const val = e.target.value
              setConfig((prev) => (prev ? { ...prev, mensagem_rodape_comprovante: val } : null))
              setModificado(true)
            }}
            placeholder="Ex: Obrigado pela preferência! Trocas somente em até 30 dias com este cupom."
            className="text-xs h-9"
          />
        </div>
      </div>

      {/* Seção 2: Integração Contábil com o Plano de Contas */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-4">
        <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
          <CreditCard className="h-4 w-4 text-blue-600" />
          <h2 className="text-sm font-semibold text-slate-900">
            Mapeamento Contábil do Plano de Contas
          </h2>
        </div>

        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs text-slate-600 flex items-start gap-2">
          <Info size={16} className="text-blue-600 mt-0.5 flex-shrink-0" />
          <span>
            Estas contas analíticas serão usadas automaticamente nos lançamentos das vendas balcão,
            apuração de DRE, despesas operacionais com operadoras de cartão e fechamento do caixa
            diário.
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-slate-700">
              Conta de Receita de Vendas (Padrão: 1.1.01)
            </Label>
            <Select
              value={config?.plano_vendas_id || 'nenhum'}
              onValueChange={(val) => {
                setConfig((prev) =>
                  prev ? { ...prev, plano_vendas_id: val === 'nenhum' ? undefined : val } : null,
                )
                setModificado(true)
              }}
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
            <p className="text-[11px] text-slate-400">
              Conta da DRE para crédito das vendas brutas de mercadorias.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-slate-700">
              Conta de Despesa com Taxas de Cartão (Padrão: 2.5.03)
            </Label>
            <Select
              value={config?.plano_taxas_cartao_id || 'nenhum'}
              onValueChange={(val) => {
                setConfig((prev) =>
                  prev
                    ? { ...prev, plano_taxas_cartao_id: val === 'nenhum' ? undefined : val }
                    : null,
                )
                setModificado(true)
              }}
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
            <p className="text-[11px] text-slate-400">
              Despesa operacional retida pelas operadoras de cartão.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-slate-700">
              Conta de Quebra de Caixa / Diferença Negativa (Padrão: 2.8.01)
            </Label>
            <Select
              value={config?.plano_quebra_caixa_id || 'nenhum'}
              onValueChange={(val) => {
                setConfig((prev) =>
                  prev
                    ? { ...prev, plano_quebra_caixa_id: val === 'nenhum' ? undefined : val }
                    : null,
                )
                setModificado(true)
              }}
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
            <p className="text-[11px] text-slate-400">
              Despesa lançada quando houver falta física de numerário no fechamento.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-slate-700">
              Conta de Sobra de Caixa / Diferença Positiva (Padrão: 1.3.01)
            </Label>
            <Select
              value={config?.plano_sobra_caixa_id || 'nenhum'}
              onValueChange={(val) => {
                setConfig((prev) =>
                  prev
                    ? { ...prev, plano_sobra_caixa_id: val === 'nenhum' ? undefined : val }
                    : null,
                )
                setModificado(true)
              }}
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
            <p className="text-[11px] text-slate-400">
              Outras receitas operacionais no caso de sobras de numerário apuradas.
            </p>
          </div>
        </div>
      </div>
    </form>
  )
}

export default ConfigVendasPage
