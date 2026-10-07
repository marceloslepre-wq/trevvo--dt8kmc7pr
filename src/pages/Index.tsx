import React, { useEffect, useState, useMemo, useCallback } from 'react'
import { Link } from 'react-router-dom'
import {
  Users,
  Truck,
  Box,
  FileCheck,
  UserCheck,
  AlertTriangle,
  ArrowRight,
  Clock,
  Sparkles,
  RefreshCw,
  Building,
  Calculator,
  Layers,
  FileSpreadsheet,
  ArrowLeftRight,
} from 'lucide-react'
import { contarTransferenciasAguardandoRecebimento } from '@/services/transferencias'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/contexts/AuthContext'
import { usePermissoes } from '@/contexts/PermissoesContext'
import { useEmpresaAtiva } from '@/contexts/EmpresaContext'
import { useConfiguracoes } from '@/contexts/ConfiguracoesContext'
import pb from '@/lib/pocketbase/client'

interface UltimoCadastro {
  id: string
  tipo: 'cliente' | 'fornecedor' | 'produto'
  tipoLabel: string
  codigo: string | number
  identificacao: string
  criadoEm: string
  createdDate: Date
  urlDetalhe: string
}

interface PendenciaConfiguracao {
  id: string
  titulo: string
  descricao: string
  link: string
  modulo: string
  gravidade: 'alta' | 'media' | 'baixa'
}

export default function Index() {
  const { user } = useAuth()
  const { pode } = usePermissoes()
  const { empresaAtiva } = useEmpresaAtiva()
  const { config } = useConfiguracoes()

  const [carregando, setCarregando] = useState(true)

  // Totais
  const [totalClientesAtivos, setTotalClientesAtivos] = useState<number>(0)
  const [totalFornecedoresAtivos, setTotalFornecedoresAtivos] = useState<number>(0)
  const [totalProdutosAtivos, setTotalProdutosAtivos] = useState<number>(0)
  const [totalProdutosFiscalIncompleto, setTotalProdutosFiscalIncompleto] = useState<number>(0)
  const [totalUsuariosAtivos, setTotalUsuariosAtivos] = useState<number>(0)
  const [totalTransferenciasReceber, setTotalTransferenciasReceber] = useState<number>(0)

  // Últimos cadastros
  const [ultimosCadastros, setUltimosCadastros] = useState<UltimoCadastro[]>([])

  // Pendências de configuração
  const [pendencias, setPendencias] = useState<PendenciaConfiguracao[]>([])

  // Permissões de cada módulo relevante
  const podeVerClientes = pode('clientes', 'ver')
  const podeVerFornecedores = pode('fornecedores', 'ver')
  const podeVerProdutos = pode('produtos', 'ver')
  const podeVerUsuarios = pode('usuarios', 'ver')
  const podeVerEmpresas = pode('empresas', 'ver')
  const podeVerTabelasFiscais = pode('tabelas_fiscais', 'ver')
  const podeVerEstoque = pode('estoque', 'ver')

  const carregarDadosPainel = useCallback(async () => {
    try {
      setCarregando(true)

      // 1. Carregar contagens condicionadas a permissões
      const promisesContagens: Promise<void>[] = []

      if (podeVerClientes) {
        promisesContagens.push(
          pb
            .collection('clientes')
            .getList(1, 1, { filter: 'ativo = true' })
            .then((res) => setTotalClientesAtivos(res.totalItems))
            .catch(() => setTotalClientesAtivos(0)),
        )
      }

      if (podeVerFornecedores) {
        promisesContagens.push(
          pb
            .collection('fornecedores')
            .getList(1, 1, { filter: 'ativo = true' })
            .then((res) => setTotalFornecedoresAtivos(res.totalItems))
            .catch(() => setTotalFornecedoresAtivos(0)),
        )
      }

      if (podeVerProdutos) {
        promisesContagens.push(
          pb
            .collection('produtos')
            .getList(1, 1, { filter: 'ativo = true' })
            .then((res) => setTotalProdutosAtivos(res.totalItems))
            .catch(() => setTotalProdutosAtivos(0)),
        )

        // Produtos com fiscal incompleto: fiscal_revisado = false ou ncm = ''
        promisesContagens.push(
          pb
            .collection('produtos')
            .getList(1, 1, { filter: "ativo = true && (fiscal_revisado = false || ncm = '')" })
            .then((res) => setTotalProdutosFiscalIncompleto(res.totalItems))
            .catch(() => setTotalProdutosFiscalIncompleto(0)),
        )
      }

      if (podeVerUsuarios) {
        promisesContagens.push(
          pb
            .collection('usuarios')
            .getList(1, 1, { filter: 'ativo = true' })
            .then((res) => setTotalUsuariosAtivos(res.totalItems))
            .catch(() => setTotalUsuariosAtivos(0)),
        )
      }

      if (podeVerEstoque && empresaAtiva?.id) {
        promisesContagens.push(
          contarTransferenciasAguardandoRecebimento(empresaAtiva.id)
            .then((tot) => setTotalTransferenciasReceber(tot))
            .catch(() => setTotalTransferenciasReceber(0)),
        )
      }

      // 2. Carregar últimos registros para compor os 10 últimos cadastros
      const promisesUltimos: Promise<
        {
          tipo: 'cliente' | 'fornecedor' | 'produto'
          tipoLabel: string
          id: string
          codigo: string | number
          identificacao: string
          criadoEm: string
          createdDate: Date
          urlDetalhe: string
        }[]
      >[] = []

      if (podeVerClientes) {
        promisesUltimos.push(
          pb
            .collection('clientes')
            .getList(1, 10, { sort: '-created' })
            .then((res) =>
              res.items.map((c) => ({
                id: c.id,
                tipo: 'cliente' as const,
                tipoLabel: 'Cliente',
                codigo: c.codigo || '-',
                identificacao: (c.nome_razao_social || c.nome_fantasia || 'Sem nome') as string,
                criadoEm: c.created,
                createdDate: new Date(c.created),
                urlDetalhe: `/cadastros/clientes/${c.id}/editar`,
              })),
            )
            .catch(() => []),
        )
      }

      if (podeVerFornecedores) {
        promisesUltimos.push(
          pb
            .collection('fornecedores')
            .getList(1, 10, { sort: '-created' })
            .then((res) =>
              res.items.map((f) => ({
                id: f.id,
                tipo: 'fornecedor' as const,
                tipoLabel: 'Fornecedor',
                codigo: f.codigo || '-',
                identificacao: (f.razao_social || f.nome_fantasia || 'Sem nome') as string,
                criadoEm: f.created,
                createdDate: new Date(f.created),
                urlDetalhe: `/cadastros/fornecedores/${f.id}/editar`,
              })),
            )
            .catch(() => []),
        )
      }

      if (podeVerProdutos) {
        promisesUltimos.push(
          pb
            .collection('produtos')
            .getList(1, 10, { sort: '-created' })
            .then((res) =>
              res.items.map((p) => ({
                id: p.id,
                tipo: 'produto' as const,
                tipoLabel: 'Produto',
                codigo: p.codigo || '-',
                identificacao: (p.descricao || 'Sem descrição') as string,
                criadoEm: p.created,
                createdDate: new Date(p.created),
                urlDetalhe: `/cadastros/produtos/${p.id}/editar`,
              })),
            )
            .catch(() => []),
        )
      }

      // 3. Verificar Pendências de Configuração
      const peds: PendenciaConfiguracao[] = []

      // Checagem de Empresas (Contador e IE)
      if (podeVerEmpresas) {
        try {
          const emp = empresaAtiva
          if (emp) {
            // Empresa sem dados do contador
            const semContador =
              !emp.contador_nome ||
              !emp.contador_cpf ||
              !emp.contador_crc ||
              emp.contador_nome.trim() === ''
            if (semContador) {
              peds.push({
                id: 'empresa_sem_contador',
                titulo: 'Empresa sem dados da contabilidade',
                descricao: `A empresa ativa (${emp.nome_fantasia || emp.razao_social}) não possui os dados do contador preenchidos na aba Contabilidade.`,
                link: `/cadastros/empresas/${emp.id}/editar`,
                modulo: 'empresas',
                gravidade: 'alta',
              })
            }

            // Empresa sem Inscrição Estadual
            const semIe = !emp.inscricao_estadual || emp.inscricao_estadual.trim() === ''
            if (semIe) {
              peds.push({
                id: 'empresa_sem_ie',
                titulo: 'Empresa sem Inscrição Estadual',
                descricao: `A Inscrição Estadual da empresa ativa (${emp.nome_fantasia || emp.razao_social}) não foi informada.`,
                link: `/cadastros/empresas/${emp.id}/editar`,
                modulo: 'empresas',
                gravidade: 'alta',
              })
            }
          }
        } catch (e) {
          console.warn('Erro ao avaliar pendências de empresas:', e)
        }
      }

      // Checagens de Tabelas Fiscais (NCM vazia, CEST vazia, Perfis tributários vazios)
      if (podeVerTabelasFiscais) {
        try {
          const [ncmRes, cestRes, perfisRes] = await Promise.all([
            pb.collection('ncm').getList(1, 1),
            pb.collection('cest').getList(1, 1),
            pb.collection('perfis_tributarios').getList(1, 1),
          ])

          if (ncmRes.totalItems === 0) {
            peds.push({
              id: 'tabela_ncm_vazia',
              titulo: 'Tabela de NCM vazia',
              descricao:
                'Nenhum código NCM cadastrado. O NCM é obrigatório para cadastrar produtos e emitir notas.',
              link: '/cadastros/tabelas-fiscais/ncm',
              modulo: 'tabelas_fiscais',
              gravidade: 'alta',
            })
          }

          if (cestRes.totalItems === 0) {
            peds.push({
              id: 'tabela_cest_vazia',
              titulo: 'Tabela de CEST vazia',
              descricao:
                'Nenhum CEST cadastrado. Necessário para operações com mercadorias sujeitas à Substituição Tributária (ICMS-ST).',
              link: '/cadastros/tabelas-fiscais/cest',
              modulo: 'tabelas_fiscais',
              gravidade: 'media',
            })
          }

          if (perfisRes.totalItems === 0) {
            peds.push({
              id: 'nenhum_perfil_tributario',
              titulo: 'Nenhum perfil tributário cadastrado',
              descricao:
                'Crie perfis tributários com regras de ICMS, PIS e COFINS para automatizar o fiscal dos produtos.',
              link: '/cadastros/tabelas-fiscais/perfis',
              modulo: 'tabelas_fiscais',
              gravidade: 'alta',
            })
          }
        } catch (e) {
          console.warn('Erro ao avaliar pendências tributárias:', e)
        }
      }

      setPendencias(peds)

      // Aguarda contagens
      await Promise.all(promisesContagens)

      // Aguarda e junta últimos cadastros
      const resultadosUltimos = await Promise.all(promisesUltimos)
      const todosUltimos = resultadosUltimos.flat()
      todosUltimos.sort((a, b) => b.createdDate.getTime() - a.createdDate.getTime())
      setUltimosCadastros(todosUltimos.slice(0, 10))
    } catch (err) {
      console.error('Erro ao montar dados do painel:', err)
    } finally {
      setCarregando(false)
    }
  }, [
    podeVerClientes,
    podeVerFornecedores,
    podeVerProdutos,
    podeVerUsuarios,
    podeVerEmpresas,
    podeVerTabelasFiscais,
    podeVerEstoque,
    empresaAtiva,
  ])

  useEffect(() => {
    carregarDadosPainel()
  }, [carregarDadosPainel])

  const nomeExibicao = user?.name || 'Administrador'
  const temAlgumaVisualizacao =
    podeVerClientes ||
    podeVerFornecedores ||
    podeVerProdutos ||
    podeVerEstoque ||
    podeVerUsuarios ||
    podeVerEmpresas ||
    podeVerTabelasFiscais

  const formatarDataHora = (dataIso: string) => {
    try {
      const d = new Date(dataIso)
      return d.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    } catch {
      return dataIso
    }
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Cabeçalho do Painel */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Painel Geral</h1>
            <Badge variant="outline" className="text-xs bg-slate-50 border-slate-200 font-normal">
              {config?.nome_sistema || 'ERP Gestão Comercial'}
            </Badge>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Olá, <strong className="text-slate-800">{nomeExibicao}</strong>. Acompanhe os principais
            indicadores e pendências cadastrais.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {empresaAtiva && (
            <div className="hidden lg:flex items-center gap-2 text-xs bg-slate-100 text-slate-700 px-3 py-1.5 rounded-lg border border-slate-200">
              <Building size={14} className="text-primary flex-shrink-0" />
              <span className="font-medium truncate max-w-[200px]">
                {empresaAtiva.nome_fantasia || empresaAtiva.razao_social}
              </span>
            </div>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => carregarDadosPainel()}
            disabled={carregando}
            className="gap-2 text-xs h-9 border-slate-200 text-slate-700 hover:text-slate-900 shadow-xs"
            title="Recarregar dados do painel"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${carregando ? 'animate-spin text-primary' : ''}`} />
            Atualizar
          </Button>
        </div>
      </div>

      {/* Cartões de Indicadores Principais */}
      {temAlgumaVisualizacao ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {/* Total Clientes Ativos */}
          {podeVerClientes && (
            <Link to="/cadastros/clientes" className="group block focus:outline-none">
              <Card className="border-slate-200 shadow-xs hover:border-slate-300 hover:shadow-sm transition-all h-full">
                <CardContent className="p-4 flex flex-col justify-between h-full">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-500">Clientes Ativos</span>
                    <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                      <UserCheck size={18} />
                    </div>
                  </div>
                  <div className="mt-3">
                    <div className="text-2xl font-bold tracking-tight text-slate-900 group-hover:text-primary transition-colors">
                      {carregando ? '—' : totalClientesAtivos}
                    </div>
                    <span className="text-[11px] text-slate-400">cadastros ativos no sistema</span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          )}

          {/* Total Fornecedores Ativos */}
          {podeVerFornecedores && (
            <Link to="/cadastros/fornecedores" className="group block focus:outline-none">
              <Card className="border-slate-200 shadow-xs hover:border-slate-300 hover:shadow-sm transition-all h-full">
                <CardContent className="p-4 flex flex-col justify-between h-full">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-500">Fornecedores Ativos</span>
                    <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                      <Truck size={18} />
                    </div>
                  </div>
                  <div className="mt-3">
                    <div className="text-2xl font-bold tracking-tight text-slate-900 group-hover:text-primary transition-colors">
                      {carregando ? '—' : totalFornecedoresAtivos}
                    </div>
                    <span className="text-[11px] text-slate-400">parceiros comerciais</span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          )}

          {/* Total Produtos Ativos */}
          {podeVerProdutos && (
            <Link to="/cadastros/produtos" className="group block focus:outline-none">
              <Card className="border-slate-200 shadow-xs hover:border-slate-300 hover:shadow-sm transition-all h-full">
                <CardContent className="p-4 flex flex-col justify-between h-full">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-500">Produtos Ativos</span>
                    <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center">
                      <Box size={18} />
                    </div>
                  </div>
                  <div className="mt-3">
                    <div className="text-2xl font-bold tracking-tight text-slate-900 group-hover:text-primary transition-colors">
                      {carregando ? '—' : totalProdutosAtivos}
                    </div>
                    <span className="text-[11px] text-slate-400">itens no catálogo</span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          )}

          {/* Produtos com Fiscal Incompleto (Clicável -> /cadastros/produtos/conferencia) */}
          {podeVerProdutos && (
            <Link
              to="/cadastros/produtos/conferencia"
              className="group block focus:outline-none"
              title="Clique para abrir a tela de Conferência Fiscal de Produtos"
            >
              <Card
                className={`border-slate-200 shadow-xs hover:shadow-sm transition-all h-full ${
                  totalProdutosFiscalIncompleto > 0
                    ? 'border-amber-200 bg-amber-50/20'
                    : 'hover:border-slate-300'
                }`}
              >
                <CardContent className="p-4 flex flex-col justify-between h-full">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-amber-800">Fiscal Incompleto</span>
                    <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center">
                      <FileCheck size={18} />
                    </div>
                  </div>
                  <div className="mt-3">
                    <div className="text-2xl font-bold tracking-tight text-amber-700 group-hover:text-amber-900 transition-colors flex items-center gap-2">
                      {carregando ? '—' : totalProdutosFiscalIncompleto}
                      {totalProdutosFiscalIncompleto > 0 && (
                        <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-amber-200 text-amber-900">
                          Revisar
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] text-amber-700/80 underline decoration-amber-300">
                      Abrir conferência fiscal →
                    </span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          )}

          {/* Transferências a Receber (Clicável -> /estoque/transferencias?status=Enviada) */}
          {podeVerEstoque && (
            <Link
              to="/estoque/transferencias"
              className="group block focus:outline-none"
              title="Clique para abrir as transferências entre filiais"
            >
              <Card
                className={`border-slate-200 shadow-xs hover:shadow-sm transition-all h-full ${
                  totalTransferenciasReceber > 0
                    ? 'border-amber-300 bg-amber-50/30 ring-1 ring-amber-200'
                    : 'hover:border-slate-300'
                }`}
              >
                <CardContent className="p-4 flex flex-col justify-between h-full">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-700">
                      Aguardando Recebimento
                    </span>
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                        totalTransferenciasReceber > 0
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-blue-50 text-blue-600'
                      }`}
                    >
                      <ArrowLeftRight size={18} />
                    </div>
                  </div>
                  <div className="mt-3">
                    <div className="text-2xl font-bold tracking-tight text-slate-900 group-hover:text-primary transition-colors flex items-center gap-2">
                      {carregando ? '—' : totalTransferenciasReceber}
                      {totalTransferenciasReceber > 0 && (
                        <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-amber-200 text-amber-900 animate-pulse">
                          Chegando
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] text-slate-500">
                      {totalTransferenciasReceber > 0
                        ? 'transferências em trânsito'
                        : 'nenhuma remessa em trânsito'}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          )}

          {/* Total Usuários Ativos */}
          {podeVerUsuarios && (
            <Link to="/cadastros/usuarios" className="group block focus:outline-none">
              <Card className="border-slate-200 shadow-xs hover:border-slate-300 hover:shadow-sm transition-all h-full">
                <CardContent className="p-4 flex flex-col justify-between h-full">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-500">Usuários Ativos</span>
                    <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                      <Users size={18} />
                    </div>
                  </div>
                  <div className="mt-3">
                    <div className="text-2xl font-bold tracking-tight text-slate-900 group-hover:text-primary transition-colors">
                      {carregando ? '—' : totalUsuariosAtivos}
                    </div>
                    <span className="text-[11px] text-slate-400">operadores do sistema</span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          )}
        </div>
      ) : (
        <Card className="border-slate-200 bg-white">
          <CardContent className="p-6 text-center text-slate-500 text-sm">
            Você não possui permissão para visualizar os indicadores gerais do painel.
          </CardContent>
        </Card>
      )}

      {/* Grid: Últimos Cadastros e Pendências de Configuração */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Lista: Últimos Cadastros (10 mais recentes intercalados) */}
        <div className="lg:col-span-7">
          <Card className="border-slate-200 shadow-xs h-full flex flex-col">
            <CardHeader className="pb-3 border-b border-slate-100">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-slate-500" />
                  <CardTitle className="text-base font-semibold text-slate-900">
                    Últimos Cadastros
                  </CardTitle>
                </div>
                <span className="text-xs text-slate-400">10 mais recentes</span>
              </div>
              <CardDescription className="text-xs text-slate-500">
                Últimos registros incluídos em clientes, fornecedores e produtos.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0 flex-1 flex flex-col">
              {carregando ? (
                <div className="p-8 text-center text-xs text-slate-400">
                  <RefreshCw className="w-4 h-4 animate-spin mx-auto mb-2 text-primary" />
                  Carregando registros...
                </div>
              ) : ultimosCadastros.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500 my-auto">
                  Nenhum cadastro recente encontrado ou você não possui permissão para
                  visualizá-los.
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {ultimosCadastros.map((item) => (
                    <Link
                      key={`${item.tipo}-${item.id}`}
                      to={item.urlDetalhe}
                      className="flex items-center justify-between p-3.5 hover:bg-slate-50/80 transition-colors group"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span
                          className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full flex-shrink-0 ${
                            item.tipo === 'cliente'
                              ? 'bg-blue-100 text-blue-800'
                              : item.tipo === 'fornecedor'
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-purple-100 text-purple-800'
                          }`}
                        >
                          {item.tipoLabel}
                        </span>

                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-mono font-semibold text-slate-500">
                              #{item.codigo}
                            </span>
                            <span className="text-xs font-medium text-slate-900 truncate group-hover:text-primary transition-colors">
                              {item.identificacao}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-400">
                            Incluído em {formatarDataHora(item.criadoEm)}
                          </p>
                        </div>
                      </div>

                      <ArrowRight
                        size={14}
                        className="text-slate-400 group-hover:text-primary group-hover:translate-x-0.5 transition-all flex-shrink-0 ml-2"
                      />
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Lista: Pendências de Configuração */}
        <div className="lg:col-span-5">
          <Card className="border-slate-200 shadow-xs h-full flex flex-col">
            <CardHeader className="pb-3 border-b border-slate-100">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                  <CardTitle className="text-base font-semibold text-slate-900">
                    Pendências de Configuração
                  </CardTitle>
                </div>
                {pendencias.length > 0 && (
                  <Badge
                    variant="outline"
                    className="text-[10px] bg-amber-50 text-amber-800 border-amber-200 font-bold"
                  >
                    {pendencias.length} {pendencias.length === 1 ? 'item' : 'itens'}
                  </Badge>
                )}
              </div>
              <CardDescription className="text-xs text-slate-500">
                Itens fiscais e cadastrais recomendados antes de iniciar emissões e vendas.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0 flex-1 flex flex-col">
              {carregando ? (
                <div className="p-8 text-center text-xs text-slate-400">
                  <RefreshCw className="w-4 h-4 animate-spin mx-auto mb-2 text-primary" />
                  Verificando pendências...
                </div>
              ) : pendencias.length === 0 ? (
                <div className="p-8 text-center text-xs text-emerald-700 bg-emerald-50/40 rounded-b-xl my-auto flex flex-col items-center gap-2">
                  <Sparkles className="w-6 h-6 text-emerald-600" />
                  <p className="font-semibold">Nenhuma pendência crítica!</p>
                  <p className="text-slate-500 max-w-xs text-center text-[11px]">
                    As configurações de empresa, tabelas fiscais e perfis tributários essenciais
                    estão preenchidas.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {pendencias.map((pend) => (
                    <div key={pend.id} className="p-3.5 hover:bg-slate-50/60 transition-colors">
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-slate-900">
                              {pend.titulo}
                            </span>
                            {pend.gravidade === 'alta' ? (
                              <span className="text-[10px] font-bold text-red-700 bg-red-100 px-1.5 py-0.2 rounded">
                                Urgente
                              </span>
                            ) : (
                              <span className="text-[10px] font-medium text-amber-700 bg-amber-100 px-1.5 py-0.2 rounded">
                                Importante
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-500 leading-relaxed">{pend.descricao}</p>
                        </div>
                      </div>

                      <div className="mt-2.5 pt-2 border-t border-slate-100/80 flex justify-end">
                        <Button
                          asChild
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs font-medium text-primary hover:text-primary hover:bg-primary/10 gap-1.5 px-2"
                        >
                          <Link to={pend.link}>
                            Configurar agora
                            <ArrowRight size={12} />
                          </Link>
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
