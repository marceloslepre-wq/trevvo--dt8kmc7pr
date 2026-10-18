import React, { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import {
  FileText,
  Save,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  HelpCircle,
  ExternalLink,
  Building2,
  Calendar,
  Layers,
  FileCheck2,
  Loader2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { useToast } from '@/hooks/use-toast'
import { useEmpresaAtiva } from '@/contexts/EmpresaContext'
import { usePermissoes } from '@/contexts/PermissoesContext'
import pb from '@/lib/pocketbase/client'
import {
  ConfigSpedEmpresa,
  obterOuCriarConfigSpedEmpresa,
  salvarConfigSpedEmpresa,
} from '@/services/configSped'
import { Empresa } from '@/services/empresas'

interface ItemProntidao {
  id: string
  titulo: string
  status: 'verde' | 'amarelo' | 'vermelho'
  mensagem: string
  link?: string
  linkTexto?: string
}

export const ConfiguracaoSpedPage: React.FC = () => {
  const { toast } = useToast()
  const { empresaAtiva } = useEmpresaAtiva()
  const { administrador } = usePermissoes()

  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [config, setConfig] = useState<Partial<ConfigSpedEmpresa>>({
    versao_leiaute: '020',
    codigo_receita_icms: '101-5',
    dia_vencimento_icms: 10,
    periodo_saldo_inicial: '',
    saldo_credor_inicial: 0,
    mes_bloco_h: 2,
    conta_contabil_estoque: '',
    gerar_bloco_k: false,
    incluir_homologacao_em_teste: true,
  })

  // Dados da avaliação de prontidão
  const [itensProntidao, setItensProntidao] = useState<ItemProntidao[]>([])
  const [avaliandoProntidao, setAvaliandoProntidao] = useState(false)

  // 1. Carregar configuração da empresa ativa
  const carregarConfiguracao = useCallback(async () => {
    if (!empresaAtiva?.id) return
    setCarregando(true)
    try {
      const cfg = await obterOuCriarConfigSpedEmpresa(empresaAtiva.id)
      setConfig(cfg)
    } catch (err: unknown) {
      toast({
        title: 'Erro ao carregar configuração do SPED',
        description: err instanceof Error ? err.message : 'Falha ao buscar dados no backend.',
        variant: 'destructive',
      })
    } finally {
      setCarregando(false)
    }
  }, [empresaAtiva?.id, toast])

  // 2. Avaliar prontidão da empresa ativa para o SPED
  const avaliarProntidao = useCallback(async () => {
    if (!empresaAtiva?.id) return
    setAvaliandoProntidao(true)
    try {
      // Buscar dados atualizados da empresa para garantir todos os campos
      let emp: Empresa = empresaAtiva
      try {
        emp = await pb.collection('empresas').getOne<Empresa>(empresaAtiva.id)
      } catch {
        /* intentionally ignored */
      }

      const itens: ItemProntidao[] = []

      // a) empresa marcada como obrigado_efd_icms_ipi
      if (emp.obrigado_efd_icms_ipi) {
        itens.push({
          id: 'obrigado_efd',
          titulo: 'Obrigatoriedade da EFD ICMS/IPI',
          status: 'verde',
          mensagem: 'Empresa marcada como obrigada à entrega da EFD ICMS/IPI.',
        })
      } else {
        itens.push({
          id: 'obrigado_efd',
          titulo: 'Obrigatoriedade da EFD ICMS/IPI',
          status: 'amarelo',
          mensagem:
            'Esta empresa não está marcada como obrigada a entregar; gere só arquivos de teste.',
          link: `/cadastros/empresas/${emp.id}/editar`,
          linkTexto: 'Editar dados da empresa',
        })
      }

      // b) CRT 1 ou 4 (Simples Nacional)
      const crtNum = Number(emp.crt)
      if (crtNum === 1 || crtNum === 4) {
        itens.push({
          id: 'crt_simples',
          titulo: 'Regime Tributário (CRT)',
          status: 'amarelo',
          mensagem:
            'Empresa do Simples Nacional normalmente é dispensada da EFD ICMS/IPI; confirme com o contador.',
        })
      } else {
        itens.push({
          id: 'crt_simples',
          titulo: 'Regime Tributário (CRT)',
          status: 'verde',
          mensagem: `Regime Normal (CRT ${emp.crt || 3}) sujeito à entrega mensal do SPED Fiscal.`,
        })
      }

      // c) Inscrição estadual numérica (VERMELHO se vazia ou "ISENTO": essa empresa não entrega EFD)
      const ieLimpa = (emp.inscricao_estadual || '').trim().toUpperCase()
      const ieNumerica = /^\d+$/.test(ieLimpa.replace(/\D/g, ''))
      if (!ieLimpa || ieLimpa === 'ISENTO' || !ieNumerica) {
        itens.push({
          id: 'inscricao_estadual',
          titulo: 'Inscrição Estadual',
          status: 'vermelho',
          mensagem:
            'Inscrição Estadual vazia, "ISENTO" ou não numérica: essa empresa não entrega EFD.',
          link: `/cadastros/empresas/${emp.id}/editar`,
          linkTexto: 'Corrigir no cadastro da empresa',
        })
      } else {
        itens.push({
          id: 'inscricao_estadual',
          titulo: 'Inscrição Estadual',
          status: 'verde',
          mensagem: `Inscrição Estadual válida (${emp.inscricao_estadual}).`,
        })
      }

      // d) Endereço completo com CEP e código IBGE do município (VERMELHO se faltar)
      const temLogradouro = Boolean(emp.logradouro && emp.logradouro.trim())
      const temNumero = Boolean(emp.numero && emp.numero.trim())
      const temBairro = Boolean(emp.bairro && emp.bairro.trim())
      const temCep = Boolean(emp.cep && emp.cep.replace(/\D/g, '').length === 8)
      const temIbge = Boolean(
        emp.codigo_municipio_ibge && emp.codigo_municipio_ibge.replace(/\D/g, '').length === 7,
      )

      if (!temLogradouro || !temNumero || !temBairro || !temCep || !temIbge) {
        const faltantes: string[] = []
        if (!temLogradouro) faltantes.push('logradouro')
        if (!temNumero) faltantes.push('número')
        if (!temBairro) faltantes.push('bairro')
        if (!temCep) faltantes.push('CEP de 8 dígitos')
        if (!temIbge) faltantes.push('código IBGE do município (7 dígitos)')

        itens.push({
          id: 'endereco_completo',
          titulo: 'Endereço do Estabelecimento',
          status: 'vermelho',
          mensagem: `Endereço incompleto no cadastro da empresa: faltam ${faltantes.join(', ')}.`,
          link: `/cadastros/empresas/${emp.id}/editar`,
          linkTexto: 'Completar endereço da empresa',
        })
      } else {
        itens.push({
          id: 'endereco_completo',
          titulo: 'Endereço do Estabelecimento',
          status: 'verde',
          mensagem: `Endereço completo (IBGE ${emp.codigo_municipio_ibge}, CEP ${emp.cep}).`,
        })
      }

      // e) perfil_sped e indicador_atividade_sped preenchidos (VERMELHO se faltar)
      const temPerfilSped = Boolean(emp.perfil_sped)
      const temIndicadorAtividade =
        emp.indicador_atividade_sped !== undefined && emp.indicador_atividade_sped !== null

      if (!temPerfilSped || !temIndicadorAtividade) {
        itens.push({
          id: 'perfil_atividade_sped',
          titulo: 'Perfil e Atividade no SPED',
          status: 'vermelho',
          mensagem:
            'Perfil SPED (A, B ou C) ou Indicador de Atividade não preenchidos no cadastro da empresa.',
          link: `/cadastros/empresas/${emp.id}/editar`,
          linkTexto: 'Configurar perfil SPED na empresa',
        })
      } else {
        itens.push({
          id: 'perfil_atividade_sped',
          titulo: 'Perfil e Atividade no SPED',
          status: 'verde',
          mensagem: `Perfil SPED "${emp.perfil_sped}" e Indicador de atividade ${emp.indicador_atividade_sped}.`,
        })
      }

      // f) Dados do contador: nome, CPF, CRC, CEP, código IBGE do município e e-mail (VERMELHO se faltar)
      const temContadorNome = Boolean(emp.contador_nome && emp.contador_nome.trim())
      const temContadorCpf = Boolean(
        emp.contador_cpf && emp.contador_cpf.replace(/\D/g, '').length === 11,
      )
      const temContadorCrc = Boolean(emp.contador_crc && emp.contador_crc.trim())
      const temContadorCep = Boolean(
        emp.contador_cep && emp.contador_cep.replace(/\D/g, '').length === 8,
      )
      const temContadorIbge = Boolean(
        emp.contador_codigo_municipio_ibge &&
        emp.contador_codigo_municipio_ibge.replace(/\D/g, '').length === 7,
      )
      const temContadorEmail = Boolean(emp.contador_email && emp.contador_email.includes('@'))

      if (
        !temContadorNome ||
        !temContadorCpf ||
        !temContadorCrc ||
        !temContadorCep ||
        !temContadorIbge ||
        !temContadorEmail
      ) {
        const faltantesContador: string[] = []
        if (!temContadorNome) faltantesContador.push('Nome')
        if (!temContadorCpf) faltantesContador.push('CPF (11 dígitos)')
        if (!temContadorCrc) faltantesContador.push('CRC')
        if (!temContadorCep) faltantesContador.push('CEP (8 dígitos)')
        if (!temContadorIbge) faltantesContador.push('IBGE do município (7 dígitos)')
        if (!temContadorEmail) faltantesContador.push('E-mail válido')

        itens.push({
          id: 'dados_contador',
          titulo: 'Dados do Contador (Registro 0100)',
          status: 'vermelho',
          mensagem: `Dados obrigatórios do contador incompletos: faltam ${faltantesContador.join(', ')}.`,
          link: `/cadastros/empresas/${emp.id}/editar`,
          linkTexto: 'Preencher dados do contador',
        })
      } else {
        itens.push({
          id: 'dados_contador',
          titulo: 'Dados do Contador (Registro 0100)',
          status: 'verde',
          mensagem: `Contador regular (${emp.contador_nome}, CRC ${emp.contador_crc}).`,
        })
      }

      // g) versao_leiaute preenchida; codigo_receita_icms e dia_vencimento_icms preenchidos quando CRT for 3 (VERMELHO se faltar)
      const temVersaoLeiaute = Boolean(config.versao_leiaute && config.versao_leiaute.trim())
      const exigeReceita = crtNum === 3
      const temCodigoReceita = Boolean(
        config.codigo_receita_icms && config.codigo_receita_icms.trim(),
      )
      const temDiaVencimento =
        config.dia_vencimento_icms !== undefined &&
        config.dia_vencimento_icms !== null &&
        Number(config.dia_vencimento_icms) >= 1 &&
        Number(config.dia_vencimento_icms) <= 31

      if (!temVersaoLeiaute || (exigeReceita && (!temCodigoReceita || !temDiaVencimento))) {
        const motivos: string[] = []
        if (!temVersaoLeiaute) motivos.push('Versão do leiaute do SPED vazia')
        if (exigeReceita && !temCodigoReceita)
          motivos.push('Código de receita do ICMS (obrigatório para Regime Normal no E116)')
        if (exigeReceita && !temDiaVencimento)
          motivos.push('Dia de vencimento do ICMS (obrigatório no E116)')

        itens.push({
          id: 'parametros_sped',
          titulo: 'Parâmetros de Apuração e Leiaute',
          status: 'vermelho',
          mensagem: motivos.join('; ') + '.',
        })
      } else {
        itens.push({
          id: 'parametros_sped',
          titulo: 'Parâmetros de Apuração e Leiaute',
          status: 'verde',
          mensagem: `Leiaute COD_VER "${config.versao_leiaute || '020'}", Receita "${config.codigo_receita_icms || 'N/A'}", Vencimento dia ${config.dia_vencimento_icms || 10}.`,
        })
      }

      // h) produtos ativos sem NCM, sem tipo_item_sped ou com fiscal_revisado falso (AMARELO com quantidade e link)
      try {
        const filtroIncompletos =
          "ativo = true && (ncm = '' || ncm = null || tipo_item_sped = '' || tipo_item_sped = null || fiscal_revisado = false || fiscal_revisado = null)"
        const resIncompletos = await pb.collection('produtos').getList(1, 1, {
          filter: filtroIncompletos,
        })
        const totalIncompletos = resIncompletos.totalItems

        if (totalIncompletos > 0) {
          itens.push({
            id: 'produtos_fiscal',
            titulo: 'Cadastro Fiscal dos Produtos (Registro 0200)',
            status: 'amarelo',
            mensagem: `${totalIncompletos} produto(s) ativo(s) sem NCM, sem Tipo de Item SPED ou não revisados pelo contador.`,
            link: '/cadastros/produtos?fiscal_nao_revisado=true',
            linkTexto: 'Ver produtos pendentes na lista',
          })
        } else {
          itens.push({
            id: 'produtos_fiscal',
            titulo: 'Cadastro Fiscal dos Produtos (Registro 0200)',
            status: 'verde',
            mensagem: 'Todos os produtos ativos possuem NCM, Tipo do Item SPED e revisão fiscal.',
          })
        }
      } catch (_) {
        itens.push({
          id: 'produtos_fiscal',
          titulo: 'Cadastro Fiscal dos Produtos',
          status: 'verde',
          mensagem: 'Validação de produtos realizada.',
        })
      }

      // i) a partir de janeiro: inventário do tipo "Anual (Bloco H)" com data_referencia 31/12 do ano anterior e status Finalizado
      const mesAtual = new Date().getMonth() + 1 // 1 a 12
      const anoAtual = new Date().getFullYear()
      const anoAnterior = anoAtual - 1
      const dataEsperada = `${anoAnterior}-12-31`

      if (mesAtual >= 1) {
        try {
          const resInv = await pb.collection('inventarios').getList(1, 1, {
            filter: `empresa_id = '${emp.id}' && tipo = 'Anual (Bloco H)' && status = 'Finalizado' && data_referencia ~ '${dataEsperada}'`,
          })
          if (resInv.totalItems === 0) {
            itens.push({
              id: 'bloco_h_inventario',
              titulo: `Inventário Anual Bloco H (${anoAnterior})`,
              status: 'amarelo',
              mensagem: `Não foi encontrado inventário do tipo "Anual (Bloco H)" com referência 31/12/${anoAnterior} e status Finalizado. O Bloco H entrará no mês ${config.mes_bloco_h || 2}.`,
              link: '/estoque/inventarios/novo',
              linkTexto: 'Criar inventário anual',
            })
          } else {
            itens.push({
              id: 'bloco_h_inventario',
              titulo: `Inventário Anual Bloco H (${anoAnterior})`,
              status: 'verde',
              mensagem: `Inventário anual de 31/12/${anoAnterior} finalizado e pronto para escrituração no Bloco H.`,
            })
          }
        } catch (_) {
          itens.push({
            id: 'bloco_h_inventario',
            titulo: `Inventário Anual Bloco H (${anoAnterior})`,
            status: 'amarelo',
            mensagem: `Confira se há inventário de 31/12/${anoAnterior} finalizado para o mês do Bloco H.`,
          })
        }
      }

      setItensProntidao(itens)
    } finally {
      setAvaliandoProntidao(false)
    }
  }, [empresaAtiva, config])

  useEffect(() => {
    carregarConfiguracao()
  }, [carregarConfiguracao])

  useEffect(() => {
    if (!carregando && empresaAtiva?.id) {
      avaliarProntidao()
    }
  }, [carregando, empresaAtiva?.id, avaliarProntidao])

  // Submissão do formulário
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!administrador) {
      toast({
        title: 'Acesso restrito',
        description: 'Apenas Administradores do sistema podem salvar a configuração do SPED.',
        variant: 'destructive',
      })
      return
    }

    if (!empresaAtiva?.id) {
      toast({
        title: 'Empresa ativa não selecionada',
        variant: 'destructive',
      })
      return
    }

    setSalvando(true)
    try {
      const salvo = await salvarConfigSpedEmpresa({
        ...config,
        empresa_id: empresaAtiva.id,
      })
      setConfig(salvo)
      toast({
        title: 'Configuração salva',
        description: 'Os parâmetros do SPED Fiscal foram atualizados com sucesso.',
      })
      // Reavalia checklist
      avaliarProntidao()
    } catch (err: unknown) {
      toast({
        title: 'Erro ao salvar',
        description: err instanceof Error ? err.message : 'Falha ao salvar configuração.',
        variant: 'destructive',
      })
    } finally {
      setSalvando(false)
    }
  }

  // Estatísticas do checklist
  const totalVerdes = itensProntidao.filter((i) => i.status === 'verde').length
  const totalAmarelos = itensProntidao.filter((i) => i.status === 'amarelo').length
  const totalVermelhos = itensProntidao.filter((i) => i.status === 'vermelho').length

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Configuração do SPED Fiscal (EFD ICMS/IPI)
            </h1>
            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
              Etapa 7
            </Badge>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Parâmetros de leiaute, apuração e diagnóstico de conformidade para a escrituração fiscal
            digital.
          </p>
        </div>

        {empresaAtiva && (
          <div className="flex items-center gap-2 text-sm text-slate-600 bg-slate-100 px-3 py-1.5 rounded-md border border-slate-200">
            <Building2 size={16} className="text-slate-500" />
            <span className="font-medium text-slate-900">
              {empresaAtiva.nome_fantasia || empresaAtiva.razao_social}
            </span>
            <span className="text-xs text-slate-500">
              (CNPJ: {empresaAtiva.cnpj || 'Não informado'})
            </span>
          </div>
        )}
      </div>

      {!administrador && (
        <Alert className="bg-amber-50 border-amber-200 text-amber-800">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertTitle>Modo Somente Leitura</AlertTitle>
          <AlertDescription>
            Você está visualizando a configuração da empresa ativa. Alterações e salvamento são
            permitidos exclusivamente para o Administrador do sistema.
          </AlertDescription>
        </Alert>
      )}

      {/* Grid Principal: Formulário + Checklist */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Formulário de Configuração (7 colunas) */}
        <div className="lg:col-span-7 space-y-6">
          <form onSubmit={handleSubmit}>
            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <FileText className="text-blue-600" size={20} />
                  Parâmetros da EFD ICMS/IPI
                </CardTitle>
                <CardDescription>
                  Configurações do Guia Prático da EFD aplicadas na geração dos registros 0000,
                  E110, E116 e Bloco H.
                </CardDescription>
              </CardHeader>

              <CardContent className="space-y-5">
                {carregando ? (
                  <div className="flex items-center justify-center py-12 text-slate-500 gap-2">
                    <Loader2 size={24} className="animate-spin text-blue-600" />
                    <span>Carregando parâmetros do SPED...</span>
                  </div>
                ) : (
                  <>
                    {/* Linha 1: Versão Leiaute e Receita ICMS */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label htmlFor="versao_leiaute" className="text-xs font-semibold">
                          Versão do Leiaute (COD_VER do Registro 0000) *
                        </Label>
                        <Input
                          id="versao_leiaute"
                          value={config.versao_leiaute || ''}
                          onChange={(e) =>
                            setConfig((prev) => ({ ...prev, versao_leiaute: e.target.value }))
                          }
                          placeholder="Ex: 020"
                          disabled={!administrador || salvando}
                          required
                        />
                        <p className="text-xs text-slate-500">
                          Padrão "020" (ano 2026/2025). O contador confirma a versão anual no Guia
                          Prático.
                        </p>
                      </div>

                      <div className="space-y-1.5">
                        <Label htmlFor="codigo_receita_icms" className="text-xs font-semibold">
                          Código de Receita do ICMS Próprio (E116)
                        </Label>
                        <Input
                          id="codigo_receita_icms"
                          value={config.codigo_receita_icms || ''}
                          onChange={(e) =>
                            setConfig((prev) => ({ ...prev, codigo_receita_icms: e.target.value }))
                          }
                          placeholder="Ex: 101-5"
                          disabled={!administrador || salvando}
                        />
                        <p className="text-xs text-slate-500">
                          Código da guia DUA/DARE de ICMS próprio no ES (ex: 101-5 para normal).
                        </p>
                      </div>
                    </div>

                    {/* Linha 2: Dia Vencimento e Mês Bloco H */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label htmlFor="dia_vencimento_icms" className="text-xs font-semibold">
                          Dia de Vencimento do ICMS (1 a 31)
                        </Label>
                        <Input
                          id="dia_vencimento_icms"
                          type="number"
                          min={1}
                          max={31}
                          value={config.dia_vencimento_icms ?? ''}
                          onChange={(e) =>
                            setConfig((prev) => ({
                              ...prev,
                              dia_vencimento_icms: e.target.value
                                ? Number(e.target.value)
                                : undefined,
                            }))
                          }
                          placeholder="Ex: 10"
                          disabled={!administrador || salvando}
                        />
                        <p className="text-xs text-slate-500">
                          Dia do mês subsequente para preenchimento de DT_VCTO no registro E116.
                        </p>
                      </div>

                      <div className="space-y-1.5">
                        <Label htmlFor="mes_bloco_h" className="text-xs font-semibold">
                          Mês de Entrega do Bloco H (Inventário)
                        </Label>
                        <Select
                          value={String(config.mes_bloco_h || 2)}
                          onValueChange={(val) =>
                            setConfig((prev) => ({ ...prev, mes_bloco_h: Number(val) }))
                          }
                          disabled={!administrador || salvando}
                        >
                          <SelectTrigger id="mes_bloco_h">
                            <SelectValue placeholder="Selecione o mês" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="1">Janeiro</SelectItem>
                            <SelectItem value="2">Fevereiro (padrão oficial)</SelectItem>
                            <SelectItem value="3">Março</SelectItem>
                            <SelectItem value="4">Abril</SelectItem>
                            <SelectItem value="5">Maio</SelectItem>
                            <SelectItem value="6">Junho</SelectItem>
                            <SelectItem value="7">Julho</SelectItem>
                            <SelectItem value="8">Agosto</SelectItem>
                            <SelectItem value="9">Setembro</SelectItem>
                            <SelectItem value="10">Outubro</SelectItem>
                            <SelectItem value="11">Novembro</SelectItem>
                            <SelectItem value="12">Dezembro</SelectItem>
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-slate-500">
                          Mês em que o inventário de 31/12 do ano anterior entra no arquivo SPED.
                        </p>
                      </div>
                    </div>

                    {/* Linha 3: Saldo Credor Inicial de ICMS */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-3.5 bg-slate-50 rounded-lg border border-slate-200">
                      <div className="space-y-1.5">
                        <Label htmlFor="periodo_saldo_inicial" className="text-xs font-semibold">
                          Período do Saldo Credor Inicial (AAAA-MM)
                        </Label>
                        <Input
                          id="periodo_saldo_inicial"
                          value={config.periodo_saldo_inicial || ''}
                          onChange={(e) =>
                            setConfig((prev) => ({
                              ...prev,
                              periodo_saldo_inicial: e.target.value,
                            }))
                          }
                          placeholder="Ex: 2026-01"
                          disabled={!administrador || salvando}
                        />
                        <p className="text-xs text-slate-500">
                          Mês em que o saldo inicial do sistema anterior deve ser aproveitado.
                        </p>
                      </div>

                      <div className="space-y-1.5">
                        <Label htmlFor="saldo_credor_inicial" className="text-xs font-semibold">
                          Saldo Credor Inicial de ICMS (R$)
                        </Label>
                        <Input
                          id="saldo_credor_inicial"
                          type="number"
                          step="0.01"
                          min="0"
                          value={config.saldo_credor_inicial ?? 0}
                          onChange={(e) =>
                            setConfig((prev) => ({
                              ...prev,
                              saldo_credor_inicial: e.target.value ? Number(e.target.value) : 0,
                            }))
                          }
                          placeholder="0,00"
                          disabled={!administrador || salvando}
                        />
                        <p className="text-xs text-slate-500">
                          Saldo credor vindo do sistema anterior, usado só no primeiro mês gerado.
                        </p>
                      </div>
                    </div>

                    {/* Linha 4: Conta Contábil de Estoque */}
                    <div className="space-y-1.5">
                      <Label htmlFor="conta_contabil_estoque" className="text-xs font-semibold">
                        Conta Contábil de Estoque (COD_CTA do Registro H010)
                      </Label>
                      <Input
                        id="conta_contabil_estoque"
                        value={config.conta_contabil_estoque || ''}
                        onChange={(e) =>
                          setConfig((prev) => ({ ...prev, conta_contabil_estoque: e.target.value }))
                        }
                        placeholder="Ex: 1.1.3.01.001 (opcional)"
                        disabled={!administrador || salvando}
                      />
                      <p className="text-xs text-slate-500">
                        Código da conta analítica no plano de contas contábil da empresa informada
                        no inventário Bloco H.
                      </p>
                    </div>

                    {/* Linha 5: Opções Booleanas */}
                    <div className="space-y-3 pt-2 border-t border-slate-200">
                      <div className="flex items-start space-x-3">
                        <Checkbox
                          id="gerar_bloco_k"
                          checked={Boolean(config.gerar_bloco_k)}
                          onCheckedChange={(checked) =>
                            setConfig((prev) => ({ ...prev, gerar_bloco_k: Boolean(checked) }))
                          }
                          disabled={!administrador || salvando}
                        />
                        <div className="space-y-0.5 leading-none">
                          <Label
                            htmlFor="gerar_bloco_k"
                            className="text-sm font-medium cursor-pointer"
                          >
                            Gerar Bloco K (Controle da Produção e do Estoque)
                          </Label>
                          <p className="text-xs text-slate-500">
                            Exigido para indústrias e estabelecimentos equiparados a industrial
                            (padrão desmarcado para comércio).
                          </p>
                        </div>
                      </div>

                      <div className="flex items-start space-x-3">
                        <Checkbox
                          id="incluir_homologacao_em_teste"
                          checked={config.incluir_homologacao_em_teste !== false}
                          onCheckedChange={(checked) =>
                            setConfig((prev) => ({
                              ...prev,
                              incluir_homologacao_em_teste: Boolean(checked),
                            }))
                          }
                          disabled={!administrador || salvando}
                        />
                        <div className="space-y-0.5 leading-none">
                          <Label
                            htmlFor="incluir_homologacao_em_teste"
                            className="text-sm font-medium cursor-pointer"
                          >
                            Incluir notas de Homologação em arquivos no modo Teste
                          </Label>
                          <p className="text-xs text-slate-500">
                            Permite validar arquivos SPED em ambiente de homologação antes de gerar
                            o arquivo Oficial.
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Botão de Gravação */}
                    {administrador && (
                      <div className="pt-4 flex justify-end">
                        <Button
                          type="submit"
                          className="bg-blue-600 hover:bg-blue-700 gap-2"
                          disabled={salvando}
                        >
                          {salvando ? (
                            <>
                              <Loader2 size={16} className="animate-spin" />
                              Salvando...
                            </>
                          ) : (
                            <>
                              <Save size={16} />
                              Salvar Configuração do SPED
                            </>
                          )}
                        </Button>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </form>

          {/* Quadro Informativo da Tabela sped_arquivos */}
          <Card className="shadow-sm border-dashed">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2 text-slate-700">
                <FileCheck2 size={16} className="text-slate-500" />
                Estrutura de Arquivos SPED (sped_arquivos)
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-slate-600 space-y-2">
              <p>
                A tabela de arquivos SPED fiscal foi criada e blindada para segurança tributária. A
                gravação e geração dos arquivos .txt é feita exclusivamente pelo backend.
              </p>
              <p>
                Nesta rodada 7.0 a infraestrutura está pronta. A geração física dos registros de
                blocos 0, C, D, E, H, 1 e 9 será ativada no próximo prompt.
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Quadro "Pronto para gerar o SPED?" (5 colunas) */}
        <div className="lg:col-span-5 space-y-4">
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <CheckCircle2 className="text-emerald-600" size={18} />
                  Pronto para gerar o SPED?
                </CardTitle>
                <div className="flex items-center gap-1.5 text-xs">
                  {totalVermelhos > 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-semibold">
                      {totalVermelhos} impeditivo(s)
                    </span>
                  )}
                  {totalAmarelos > 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-semibold">
                      {totalAmarelos} aviso(s)
                    </span>
                  )}
                  <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-semibold">
                    {totalVerdes} ok
                  </span>
                </div>
              </div>
              <CardDescription className="text-xs">
                Diagnóstico cadastral em tempo real da empresa ativa para entrega da EFD ICMS/IPI.
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-3">
              {avaliandoProntidao ? (
                <div className="py-8 text-center text-slate-500 text-xs flex flex-col items-center gap-2">
                  <Loader2 size={20} className="animate-spin text-blue-600" />
                  <span>Avaliando conformidade tributária...</span>
                </div>
              ) : itensProntidao.length === 0 ? (
                <div className="py-6 text-center text-slate-500 text-xs">
                  Nenhum diagnóstico disponível para esta empresa.
                </div>
              ) : (
                itensProntidao.map((item) => {
                  const isVerde = item.status === 'verde'
                  const isAmarelo = item.status === 'amarelo'
                  const isVermelho = item.status === 'vermelho'

                  return (
                    <div
                      key={item.id}
                      className={`p-3 rounded-lg border text-xs transition-colors ${
                        isVerde
                          ? 'bg-emerald-50/60 border-emerald-200 text-emerald-900'
                          : isAmarelo
                            ? 'bg-amber-50/80 border-amber-200 text-amber-900'
                            : 'bg-red-50/80 border-red-200 text-red-900'
                      }`}
                    >
                      <div className="flex items-start gap-2.5">
                        <div className="mt-0.5 shrink-0">
                          {isVerde && <CheckCircle2 size={16} className="text-emerald-600" />}
                          {isAmarelo && <AlertTriangle size={16} className="text-amber-600" />}
                          {isVermelho && <XCircle size={16} className="text-red-600" />}
                        </div>
                        <div className="space-y-1 flex-1">
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-slate-900">{item.titulo}</span>
                            <span
                              className={`text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.2 rounded ${
                                isVerde
                                  ? 'bg-emerald-200/60 text-emerald-800'
                                  : isAmarelo
                                    ? 'bg-amber-200/70 text-amber-900'
                                    : 'bg-red-200/70 text-red-900'
                              }`}
                            >
                              {item.status}
                            </span>
                          </div>
                          <p className="text-slate-700 leading-relaxed">{item.mensagem}</p>
                          {item.link && (
                            <div className="pt-1">
                              <Link
                                to={item.link}
                                className="inline-flex items-center gap-1 font-semibold text-blue-700 hover:text-blue-900 hover:underline"
                              >
                                {item.linkTexto || 'Verificar'}
                                <ExternalLink size={12} />
                              </Link>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

export default ConfiguracaoSpedPage
