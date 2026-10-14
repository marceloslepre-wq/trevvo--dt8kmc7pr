import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  UserCheck,
  Building2,
  User,
  Globe2,
  ArrowLeft,
  Save,
  Loader2,
  Search,
  AlertCircle,
  AlertTriangle,
  RotateCcw,
  CheckCircle2,
  Info,
  MapPin,
  Phone,
  Briefcase,
  FileText,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent } from '@/components/ui/card'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useToast } from '@/hooks/use-toast'
import { usePermissoes } from '@/contexts/PermissoesContext'
import { useEmpresaAtiva } from '@/contexts/EmpresaContext'
import {
  Cliente,
  TipoPessoaCliente,
  IndicadorIeCliente,
  RegimeTributarioCliente,
  obterClientePorId,
  obterProximoCodigoCliente,
  salvarCliente,
  buscarClientePorCpfCnpj,
  ativarCliente,
  listarVendedoresAtivos,
  normalizarCpfCnpj,
  validarDadosCliente,
} from '@/services/clientes'
import { obterHistoricoVendasCliente, ResumoVendasCliente } from '@/services/vendas'
import { ShoppingCart } from 'lucide-react'
import { SelectCondicaoPagamento } from '@/components/SelectCondicaoPagamento'
import {
  ContaReceber,
  creditoCliente,
  SituacaoCreditoCliente,
  listarContasReceber,
} from '@/services/contasReceber'
import { ModalReceberTitulos } from '@/pages/financeiro/ModalReceberTitulos'
import {
  validarCPF,
  validarCNPJ,
  validarInscricaoEstadual,
  formatarCPF,
  formatarCNPJ,
  formatarCEP,
  formatarTelefone,
  buscarViaCep,
  buscarBrasilApiCnpj,
} from '@/lib/validacoes'

const UFS_BRASIL = [
  'AC',
  'AL',
  'AP',
  'AM',
  'BA',
  'CE',
  'DF',
  'ES',
  'GO',
  'MA',
  'MT',
  'MS',
  'MG',
  'PA',
  'PB',
  'PR',
  'PE',
  'PI',
  'RJ',
  'RN',
  'RS',
  'RO',
  'RR',
  'SC',
  'SP',
  'SE',
  'TO',
]

const PAISES_COMUNS = [
  { codigo: '1058', nome: 'Brasil' },
  { codigo: '0639', nome: 'Argentina' },
  { codigo: '2496', nome: 'Estados Unidos' },
  { codigo: '8451', nome: 'Uruguai' },
  { codigo: '5860', nome: 'Paraguai' },
  { codigo: '1589', nome: 'Chile' },
  { codigo: '6076', nome: 'Portugal' },
  { codigo: '1600', nome: 'China' },
  { codigo: '0230', nome: 'Alemanha' },
  { codigo: '3867', nome: 'Itália' },
]

export const ClienteForm: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { toast } = useToast()
  const { empresaAtiva } = useEmpresaAtiva()
  const { pode } = usePermissoes()

  const ehEdicao = Boolean(id)
  const abaParam = searchParams.get('aba')

  const [carregando, setCarregando] = useState(ehEdicao)
  const [salvando, setSalvando] = useState(false)
  const [abaAtiva, setAbaAtiva] = useState(abaParam || 'dados')

  useEffect(() => {
    if (abaParam) {
      setAbaAtiva(abaParam)
    }
  }, [abaParam])

  // Vendedores
  const [vendedores, setVendedores] = useState<Array<{ id: string; nome: string }>>([])

  // Formulário - Identificação
  const [codigo, setCodigo] = useState<number | string>('')
  const [tipoPessoa, setTipoPessoa] = useState<TipoPessoaCliente>('Física')
  const [cpfCnpj, setCpfCnpj] = useState('')
  const [idEstrangeiro, setIdEstrangeiro] = useState('')
  const [nomeRazaoSocial, setNomeRazaoSocial] = useState('')
  const [nomeFantasia, setNomeFantasia] = useState('')
  const [rg, setRg] = useState('')
  const [dataNascimento, setDataNascimento] = useState('')
  const [indicadorIe, setIndicadorIe] = useState<IndicadorIeCliente>('9')
  const [inscricaoEstadual, setInscricaoEstadual] = useState('')
  const [inscricaoMunicipal, setInscricaoMunicipal] = useState('')
  const [inscricaoSuframa, setInscricaoSuframa] = useState('')
  const [consumidorFinal, setConsumidorFinal] = useState(true)
  const [regimeTributario, setRegimeTributario] = useState<string>('nenhum')
  const [ativo, setAtivo] = useState(true)

  // Formulário - Endereço Principal
  const [cep, setCep] = useState('')
  const [logradouro, setLogradouro] = useState('')
  const [numero, setNumero] = useState('')
  const [complemento, setComplemento] = useState('')
  const [bairro, setBairro] = useState('')
  const [municipio, setMunicipio] = useState('')
  const [codigoMunicipioIbge, setCodigoMunicipioIbge] = useState('')
  const [uf, setUf] = useState('')
  const [codigoPais, setCodigoPais] = useState('1058')
  const [pais, setPais] = useState('Brasil')
  const [buscandoCep, setBuscandoCep] = useState(false)

  // Formulário - Endereço de Entrega
  const [entregaMesmoEndereco, setEntregaMesmoEndereco] = useState(true)
  const [entregaCep, setEntregaCep] = useState('')
  const [entregaLogradouro, setEntregaLogradouro] = useState('')
  const [entregaNumero, setEntregaNumero] = useState('')
  const [entregaComplemento, setEntregaComplemento] = useState('')
  const [entregaBairro, setEntregaBairro] = useState('')
  const [entregaMunicipio, setEntregaMunicipio] = useState('')
  const [entregaCodigoMunicipioIbge, setEntregaCodigoMunicipioIbge] = useState('')
  const [entregaUf, setEntregaUf] = useState('')
  const [buscandoEntregaCep, setBuscandoEntregaCep] = useState(false)

  // Formulário - Contato
  const [telefone, setTelefone] = useState('')
  const [celular, setCelular] = useState('')
  const [whatsapp, setWhatsapp] = useState(false)
  const [email, setEmail] = useState('')
  const [emailNfe, setEmailNfe] = useState('')
  const [contatoNome, setContatoNome] = useState('')

  // Formulário - Comercial
  const [vendedorId, setVendedorId] = useState<string>('nenhum')
  const [condicaoPagamentoId, setCondicaoPagamentoId] = useState<string>('')
  const [limiteCredito, setLimiteCredito] = useState<string>('')
  const [diaVencimentoPreferencial, setDiaVencimentoPreferencial] = useState<string>('')
  const [condicaoPagamentoPadrao, setCondicaoPagamentoPadrao] = useState<string>('')
  const [descontoPadraoPercentual, setDescontoPadraoPercentual] = useState<string>('')
  const [bloqueado, setBloqueado] = useState(false)
  const [motivoBloqueio, setMotivoBloqueio] = useState('')
  const [observacoes, setObservacoes] = useState('')
  const [observacaoNota, setObservacaoNota] = useState('')

  // Dados Financeiros do Cliente (Crédito e Histórico de Títulos a Receber)
  const [resumoCredito, setResumoCredito] = useState<SituacaoCreditoCliente | null>(null)
  const [carregandoCredito, setCarregandoCredito] = useState(false)
  const [titulosCliente, setTitulosCliente] = useState<ContaReceber[]>([])
  const [tituloParaReceberAba, setTituloParaReceberAba] = useState<ContaReceber | null>(null)
  const [modalReceberAbaAberto, setModalReceberAbaAberto] = useState(false)

  // Histórico de Vendas do Cliente
  const [historicoVendas, setHistoricoVendas] = useState<ResumoVendasCliente | null>(null)
  const [carregandoVendas, setCarregandoVendas] = useState(false)

  // Erros e Avisos
  const [erros, setErros] = useState<Record<string, string>>({})
  const [buscandoCnpjApi, setBuscandoCnpjApi] = useState(false)
  const [clienteInativoExistente, setClienteInativoExistente] = useState<Cliente | null>(null)
  const [reativando, setReativando] = useState(false)

  // Estado de alterações não salvas
  const [dadosIniciais, setDadosIniciais] = useState<string>('')
  const [alertaSairAberto, setAlertaSairAberto] = useState(false)

  // Carregar lista de vendedores
  useEffect(() => {
    listarVendedoresAtivos().then(setVendedores).catch(console.error)
  }, [])

  // Carregar dados de crédito e histórico financeiro do cliente
  const carregarFinanceiroCliente = useCallback(
    async (clienteIdParam: string) => {
      if (!empresaAtiva?.id || !clienteIdParam) return
      setCarregandoCredito(true)
      try {
        const [cred, respTitulos] = await Promise.all([
          creditoCliente(clienteIdParam, empresaAtiva.id),
          listarContasReceber({
            empresaId: empresaAtiva.id,
            clienteId: clienteIdParam,
            perPage: 100,
            sort: '-data_vencimento',
          }),
        ])
        setResumoCredito(cred)
        setTitulosCliente(respTitulos.items)
      } catch (err) {
        console.error('Erro ao carregar dados financeiros do cliente:', err)
      } finally {
        setCarregandoCredito(false)
      }
    },
    [empresaAtiva?.id],
  )

  // Carregar histórico de vendas do cliente
  const carregarVendasCliente = useCallback(
    async (clienteIdParam: string) => {
      if (!clienteIdParam) return
      setCarregandoVendas(true)
      try {
        const resumo = await obterHistoricoVendasCliente(clienteIdParam, empresaAtiva?.id)
        setHistoricoVendas(resumo)
      } catch (err) {
        console.error('Erro ao carregar histórico de vendas do cliente:', err)
      } finally {
        setCarregandoVendas(false)
      }
    },
    [empresaAtiva?.id],
  )

  // Carregar dados se edição
  useEffect(() => {
    if (ehEdicao && id) {
      setCarregando(true)
      obterClientePorId(id)
        .then((c) => {
          setCodigo(c.codigo)
          setTipoPessoa(c.tipo_pessoa || 'Física')
          if (c.tipo_pessoa === 'Física') {
            setCpfCnpj(c.cpf_cnpj ? formatarCPF(c.cpf_cnpj) : '')
          } else if (c.tipo_pessoa === 'Jurídica') {
            setCpfCnpj(c.cpf_cnpj ? formatarCNPJ(c.cpf_cnpj) : '')
          } else {
            setCpfCnpj(c.cpf_cnpj || '')
          }
          setIdEstrangeiro(c.id_estrangeiro || '')
          setNomeRazaoSocial(c.nome_razao_social || '')
          setNomeFantasia(c.nome_fantasia || '')
          setRg(c.rg || '')
          setDataNascimento(c.data_nascimento || '')
          setIndicadorIe((c.indicador_ie as IndicadorIeCliente) || '9')
          setInscricaoEstadual(c.inscricao_estadual || '')
          setInscricaoMunicipal(c.inscricao_municipal || '')
          setInscricaoSuframa(c.inscricao_suframa || '')
          setConsumidorFinal(c.consumidor_final ?? true)
          setRegimeTributario(c.regime_tributario_cliente || 'nenhum')
          setAtivo(c.ativo ?? true)

          // Endereço principal
          setCep(c.cep ? formatarCEP(c.cep) : '')
          setLogradouro(c.logradouro || '')
          setNumero(c.numero || '')
          setComplemento(c.complemento || '')
          setBairro(c.bairro || '')
          setMunicipio(c.municipio || '')
          setCodigoMunicipioIbge(c.codigo_municipio_ibge || '')
          setUf(c.uf || '')
          setCodigoPais(c.codigo_pais || '1058')
          setPais(c.pais || 'Brasil')

          // Entrega
          setEntregaMesmoEndereco(c.entrega_mesmo_endereco ?? true)
          setEntregaCep(c.entrega_cep ? formatarCEP(c.entrega_cep) : '')
          setEntregaLogradouro(c.entrega_logradouro || '')
          setEntregaNumero(c.entrega_numero || '')
          setEntregaComplemento(c.entrega_complemento || '')
          setEntregaBairro(c.entrega_bairro || '')
          setEntregaMunicipio(c.entrega_municipio || '')
          setEntregaCodigoMunicipioIbge(c.entrega_codigo_municipio_ibge || '')
          setEntregaUf(c.entrega_uf || '')

          // Contato
          setTelefone(c.telefone ? formatarTelefone(c.telefone) : '')
          setCelular(c.celular ? formatarTelefone(c.celular) : '')
          setWhatsapp(c.whatsapp ?? false)
          setEmail(c.email || '')
          setEmailNfe(c.email_nfe || '')
          setContatoNome(c.contato_nome || '')

          // Comercial
          setVendedorId(c.vendedor_id || 'nenhum')
          setCondicaoPagamentoId(c.condicao_pagamento_id || '')
          setLimiteCredito(
            c.limite_credito !== undefined && c.limite_credito !== null
              ? String(c.limite_credito)
              : '',
          )
          setDiaVencimentoPreferencial(
            c.dia_vencimento_preferencial ? String(c.dia_vencimento_preferencial) : '',
          )
          setCondicaoPagamentoPadrao(c.condicao_pagamento_padrao || '')
          setDescontoPadraoPercentual(
            c.desconto_padrao_percentual !== undefined && c.desconto_padrao_percentual !== null
              ? String(c.desconto_padrao_percentual)
              : '',
          )
          setBloqueado(c.bloqueado ?? false)
          setMotivoBloqueio(c.motivo_bloqueio || '')
          setObservacoes(c.observacoes || '')
          setObservacaoNota(c.observacao_nota || '')

          // Guardar estado inicial para detectar alterações não salvas
          setDadosIniciais(
            JSON.stringify({
              nomeRazaoSocial: c.nome_razao_social,
              cpfCnpj: c.cpf_cnpj,
              tipoPessoa: c.tipo_pessoa,
              ativo: c.ativo,
            }),
          )

          // Carrega crédito financeiro do cliente e histórico de vendas
          carregarFinanceiroCliente(c.id)
          carregarVendasCliente(c.id)
        })
        .catch((err) => {
          toast({
            variant: 'destructive',
            title: 'Erro ao carregar cliente',
            description: err instanceof Error ? err.message : 'Falha ao buscar dados',
          })
          navigate('/cadastros/clientes')
        })
        .finally(() => setCarregando(false))
    } else {
      // Inicia novo: obtém próximo código sequencial
      obterProximoCodigoCliente()
        .then((cod) => {
          setCodigo(cod)
          setDadosIniciais(
            JSON.stringify({
              nomeRazaoSocial: '',
              cpfCnpj: '',
              tipoPessoa: 'Física',
              ativo: true,
            }),
          )
        })
        .catch(console.error)
    }
  }, [ehEdicao, id, navigate, toast])

  // Troca de Tipo de Pessoa
  const handleTrocaTipoPessoa = (novoTipo: TipoPessoaCliente) => {
    setTipoPessoa(novoTipo)
    setCpfCnpj('')
    setClienteInativoExistente(null)
    setErros((prev) => {
      const { cpf_cnpj, rg, data_nascimento, id_estrangeiro, ...rest } = prev
      return rest
    })

    if (novoTipo === 'Física') {
      setIndicadorIe('9') // Não contribuinte
      setConsumidorFinal(true)
      setCodigoPais('1058')
      setPais('Brasil')
      if (uf === 'EX') setUf('')
      if (municipio === 'EXTERIOR') setMunicipio('')
      if (codigoMunicipioIbge === '9999999') setCodigoMunicipioIbge('')
    } else if (novoTipo === 'Jurídica') {
      setIndicadorIe('1') // Contribuinte ICMS
      setConsumidorFinal(false) // Não consumidor final
      setCodigoPais('1058')
      setPais('Brasil')
      if (uf === 'EX') setUf('')
      if (municipio === 'EXTERIOR') setMunicipio('')
      if (codigoMunicipioIbge === '9999999') setCodigoMunicipioIbge('')
    } else if (novoTipo === 'Estrangeiro') {
      setIndicadorIe('9')
      setConsumidorFinal(true)
      setUf('EX')
      setMunicipio('EXTERIOR')
      setCodigoMunicipioIbge('9999999')
      if (codigoPais === '1058') {
        setCodigoPais('2496')
        setPais('Estados Unidos')
      }
    }
  }

  // Mudança do Indicador de IE atualiza padrão de consumidor final se Jurídica
  const handleTrocaIndicadorIe = (novoInd: IndicadorIeCliente) => {
    setIndicadorIe(novoInd)
    if (tipoPessoa === 'Jurídica') {
      if (novoInd === '1') {
        setConsumidorFinal(false)
      } else {
        setConsumidorFinal(true)
      }
    }
    if (novoInd !== '1') {
      setErros((prev) => {
        const { inscricao_estadual, ...rest } = prev
        return rest
      })
    }
  }

  // Manipulação de CPF / CNPJ
  const handleDocChange = async (valor: string) => {
    let formatado = valor
    if (tipoPessoa === 'Física') {
      formatado = formatarCPF(valor)
    } else if (tipoPessoa === 'Jurídica') {
      formatado = formatarCNPJ(valor)
    }
    setCpfCnpj(formatado)
    setClienteInativoExistente(null)

    const limpo = normalizarCpfCnpj(formatado)
    setErros((prev) => {
      const { cpf_cnpj, ...rest } = prev
      return rest
    })

    if (tipoPessoa === 'Física' && limpo.length === 11) {
      if (!validarCPF(limpo)) {
        setErros((prev) => ({ ...prev, cpf_cnpj: 'CPF inválido.' }))
        return
      }
      const existencia = await buscarClientePorCpfCnpj(limpo, id)
      if (existencia.ativo) {
        setErros((prev) => ({
          ...prev,
          cpf_cnpj: `CPF já cadastrado para o cliente ativo "${existencia.ativo!.nome_razao_social}" (Código ${existencia.ativo!.codigo}).`,
        }))
      } else if (existencia.inativo) {
        setClienteInativoExistente(existencia.inativo)
      }
    } else if (tipoPessoa === 'Jurídica' && limpo.length === 14) {
      if (!validarCNPJ(limpo)) {
        setErros((prev) => ({ ...prev, cpf_cnpj: 'CNPJ inválido.' }))
        return
      }
      const existencia = await buscarClientePorCpfCnpj(limpo, id)
      if (existencia.ativo) {
        setErros((prev) => ({
          ...prev,
          cpf_cnpj: `CNPJ já cadastrado para o cliente ativo "${existencia.ativo!.nome_razao_social}" (Código ${existencia.ativo!.codigo}).`,
        }))
      } else if (existencia.inativo) {
        setClienteInativoExistente(existencia.inativo)
      }
    }
  }

  // Reativar cliente encontrado
  const handleReativarInativo = async () => {
    if (!clienteInativoExistente) return
    setReativando(true)
    try {
      const reativado = await ativarCliente(clienteInativoExistente.id)
      toast({
        title: 'Cliente reativado',
        description: `O cliente "${reativado.nome_razao_social}" foi reativado com sucesso. Abrindo para edição.`,
      })
      navigate(`/cadastros/clientes/${reativado.id}/editar`)
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Erro ao reativar',
        description: err instanceof Error ? err.message : 'Falha na reativação.',
      })
    } finally {
      setReativando(false)
    }
  }

  // Consulta BrasilAPI CNPJ
  const handleConsultarCnpjBrasilApi = async () => {
    const limpo = normalizarCpfCnpj(cpfCnpj)
    if (!limpo || limpo.length !== 14) {
      toast({
        variant: 'destructive',
        title: 'CNPJ incompleto',
        description: 'Digite os 14 dígitos do CNPJ para efetuar a consulta.',
      })
      return
    }

    setBuscandoCnpjApi(true)
    try {
      const dados = await buscarBrasilApiCnpj(limpo)
      if (!dados) {
        toast({
          variant: 'destructive',
          title: 'CNPJ não encontrado',
          description: 'Não foi possível obter dados na Receita Federal via BrasilAPI.',
        })
        return
      }

      if (dados.razao_social) setNomeRazaoSocial(dados.razao_social.slice(0, 60))
      if (dados.nome_fantasia) setNomeFantasia(dados.nome_fantasia.slice(0, 60))
      if (dados.cep) setCep(formatarCEP(dados.cep))
      if (dados.logradouro) setLogradouro(dados.logradouro)
      if (dados.numero) setNumero(dados.numero)
      if (dados.complemento) setComplemento(dados.complemento)
      if (dados.bairro) setBairro(dados.bairro)
      if (dados.municipio) setMunicipio(dados.municipio)
      if (dados.uf) setUf(dados.uf)
      if (dados.codigo_municipio_ibge) setCodigoMunicipioIbge(String(dados.codigo_municipio_ibge))
      if (dados.ddd_telefone_1) setTelefone(formatarTelefone(dados.ddd_telefone_1))
      if (dados.email) setEmail(dados.email.toLowerCase())

      toast({
        title: 'Dados carregados da BrasilAPI',
        description: `Razão social e endereço preenchidos com base no CNPJ ${formatarCNPJ(limpo)}.`,
      })
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Erro na consulta de CNPJ',
        description: err instanceof Error ? err.message : 'Falha ao consultar API.',
      })
    } finally {
      setBuscandoCnpjApi(false)
    }
  }

  // Consulta ViaCEP Principal
  const handleConsultarViaCep = async (cepInformado: string) => {
    const digitos = (cepInformado || '').replace(/\D/g, '')
    if (digitos.length !== 8) return

    setBuscandoCep(true)
    try {
      const res = await buscarViaCep(digitos)
      if (res && !res.erro) {
        setLogradouro(res.logradouro || '')
        setBairro(res.bairro || '')
        setMunicipio(res.localidade || '')
        setUf(res.uf || '')
        setCodigoMunicipioIbge(res.ibge || '')
        setCodigoPais('1058')
        setPais('Brasil')
        toast({
          title: 'Endereço localizado',
          description: `${res.localidade}/${res.uf} encontrado pelo CEP ${formatarCEP(digitos)}.`,
        })
      } else {
        toast({
          variant: 'destructive',
          title: 'CEP não encontrado',
          description: 'O CEP informado não foi encontrado na base dos Correios.',
        })
      }
    } catch {
      // silencioso
    } finally {
      setBuscandoCep(false)
    }
  }

  // Consulta ViaCEP Entrega
  const handleConsultarEntregaViaCep = async (cepInformado: string) => {
    const digitos = (cepInformado || '').replace(/\D/g, '')
    if (digitos.length !== 8) return

    setBuscandoEntregaCep(true)
    try {
      const res = await buscarViaCep(digitos)
      if (res && !res.erro) {
        setEntregaLogradouro(res.logradouro || '')
        setEntregaBairro(res.bairro || '')
        setEntregaMunicipio(res.localidade || '')
        setEntregaUf(res.uf || '')
        setEntregaCodigoMunicipioIbge(res.ibge || '')
      }
    } catch {
      // silencioso
    } finally {
      setBuscandoEntregaCep(false)
    }
  }

  // Regra de Operação Interestadual com Contribuinte
  const operacaoInterestadualComContribuinte = useMemo(() => {
    if (indicadorIe !== '1') return false
    if (!uf) return false
    const ufEmpresa = (empresaAtiva?.uf || '').toUpperCase()
    const ufCliente = uf.toUpperCase()
    return ufEmpresa && ufCliente && ufEmpresa !== ufCliente && ufCliente !== 'EX'
  }, [indicadorIe, uf, empresaAtiva?.uf])

  // Verificação de alterações
  const estadoAtualParaComparacao = JSON.stringify({
    nomeRazaoSocial,
    cpfCnpj: normalizarCpfCnpj(cpfCnpj),
    tipoPessoa,
    ativo,
  })
  const temAlteracoesNaoSalvas = dadosIniciais && dadosIniciais !== estadoAtualParaComparacao

  const handleTentarVoltar = () => {
    if (temAlteracoesNaoSalvas) {
      setAlertaSairAberto(true)
    } else {
      navigate('/cadastros/clientes')
    }
  }

  // Submissão
  const handleSalvar = async (e: React.FormEvent) => {
    e.preventDefault()

    const novoErros: Record<string, string> = {}
    const nomeLimpo = nomeRazaoSocial.trim()
    if (!nomeLimpo) {
      novoErros.nome_razao_social = 'O nome ou razão social é obrigatório.'
    } else if (nomeLimpo.length > 60) {
      novoErros.nome_razao_social = 'Máximo de 60 caracteres.'
    }

    const docLimpo = normalizarCpfCnpj(cpfCnpj)
    if (tipoPessoa === 'Física') {
      if (!docLimpo) {
        novoErros.cpf_cnpj = 'O CPF é obrigatório para Pessoa Física.'
      } else if (!validarCPF(docLimpo)) {
        novoErros.cpf_cnpj = 'CPF inválido.'
      }
    } else if (tipoPessoa === 'Jurídica') {
      if (!docLimpo) {
        novoErros.cpf_cnpj = 'O CNPJ é obrigatório para Pessoa Jurídica.'
      } else if (!validarCNPJ(docLimpo)) {
        novoErros.cpf_cnpj = 'CNPJ inválido.'
      }
    } else if (tipoPessoa === 'Estrangeiro') {
      if (!idEstrangeiro.trim()) {
        novoErros.id_estrangeiro = 'O documento do estrangeiro é obrigatório.'
      }
    }

    // Indicador de IE
    if (indicadorIe === '1') {
      const ieLimpa = inscricaoEstadual.trim()
      if (!ieLimpa) {
        novoErros.inscricao_estadual = 'Inscrição Estadual é obrigatória para Contribuinte ICMS.'
      } else {
        const checagemIe = validarInscricaoEstadual(ieLimpa, uf)
        if (!checagemIe.valido) {
          novoErros.inscricao_estadual = checagemIe.mensagem || 'Inscrição Estadual inválida.'
        }
      }
    }

    // Bloqueio
    if (bloqueado && !motivoBloqueio.trim()) {
      novoErros.motivo_bloqueio = 'Informe o motivo do bloqueio de vendas.'
    }

    if (Object.keys(novoErros).length > 0) {
      setErros(novoErros)
      const primeiroCampo = Object.keys(novoErros)[0]
      if (
        ['nome_razao_social', 'cpf_cnpj', 'id_estrangeiro', 'inscricao_estadual'].includes(
          primeiroCampo,
        )
      ) {
        setAbaAtiva('dados')
      } else if (['motivo_bloqueio'].includes(primeiroCampo)) {
        setAbaAtiva('comercial')
      }
      toast({
        variant: 'destructive',
        title: 'Verifique os campos obrigatórios',
        description: Object.values(novoErros)[0],
      })
      return
    }

    setSalvando(true)
    try {
      const dadosParaSalvar: Partial<Cliente> = {
        id: ehEdicao ? id : undefined,
        codigo: codigo ? Number(codigo) : undefined,
        tipo_pessoa: tipoPessoa,
        cpf_cnpj: docLimpo || undefined,
        id_estrangeiro: tipoPessoa === 'Estrangeiro' ? idEstrangeiro.trim() : undefined,
        nome_razao_social: nomeLimpo,
        nome_fantasia: nomeFantasia.trim() || undefined,
        rg: tipoPessoa === 'Física' ? rg.trim() || undefined : undefined,
        data_nascimento: tipoPessoa === 'Física' ? dataNascimento || undefined : undefined,
        indicador_ie: indicadorIe,
        inscricao_estadual: indicadorIe !== '9' ? inscricaoEstadual.trim() || undefined : undefined,
        inscricao_municipal: inscricaoMunicipal.trim() || undefined,
        inscricao_suframa: inscricaoSuframa.trim() || undefined,
        consumidor_final: consumidorFinal,
        regime_tributario_cliente:
          regimeTributario !== 'nenhum' ? (regimeTributario as RegimeTributarioCliente) : undefined,
        ativo,

        // Endereço
        cep: cep ? formatarCEP(cep) : undefined,
        logradouro: logradouro.trim() || undefined,
        numero: numero.trim() || undefined,
        complemento: complemento.trim() || undefined,
        bairro: bairro.trim() || undefined,
        municipio: municipio.trim() || undefined,
        codigo_municipio_ibge: codigoMunicipioIbge.trim() || undefined,
        uf: uf || undefined,
        codigo_pais: codigoPais || '1058',
        pais: pais || 'Brasil',

        // Entrega
        entrega_mesmo_endereco: entregaMesmoEndereco,
        entrega_cep: !entregaMesmoEndereco && entregaCep ? formatarCEP(entregaCep) : undefined,
        entrega_logradouro: !entregaMesmoEndereco
          ? entregaLogradouro.trim() || undefined
          : undefined,
        entrega_numero: !entregaMesmoEndereco ? entregaNumero.trim() || undefined : undefined,
        entrega_complemento: !entregaMesmoEndereco
          ? entregaComplemento.trim() || undefined
          : undefined,
        entrega_bairro: !entregaMesmoEndereco ? entregaBairro.trim() || undefined : undefined,
        entrega_municipio: !entregaMesmoEndereco ? entregaMunicipio.trim() || undefined : undefined,
        entrega_codigo_municipio_ibge: !entregaMesmoEndereco
          ? entregaCodigoMunicipioIbge.trim() || undefined
          : undefined,
        entrega_uf: !entregaMesmoEndereco ? entregaUf || undefined : undefined,

        // Contato
        telefone: telefone ? formatarTelefone(telefone) : undefined,
        celular: celular ? formatarTelefone(celular) : undefined,
        whatsapp,
        email: email.trim().toLowerCase() || undefined,
        email_nfe: emailNfe.trim().toLowerCase() || undefined,
        contato_nome: contatoNome.trim() || undefined,

        // Comercial
        vendedor_id: vendedorId !== 'nenhum' ? vendedorId : undefined,
        condicao_pagamento_id: condicaoPagamentoId || undefined,
        limite_credito:
          limiteCredito !== '' ? parseFloat(limiteCredito.replace(',', '.')) : undefined,
        dia_vencimento_preferencial:
          diaVencimentoPreferencial !== '' ? parseInt(diaVencimentoPreferencial, 10) : undefined,
        condicao_pagamento_padrao: condicaoPagamentoPadrao.trim() || undefined,
        desconto_padrao_percentual:
          descontoPadraoPercentual !== ''
            ? parseFloat(descontoPadraoPercentual.replace(',', '.'))
            : undefined,
        bloqueado,
        motivo_bloqueio: bloqueado ? motivoBloqueio.trim() : undefined,
        observacoes: observacoes.trim() || undefined,
        observacao_nota: observacaoNota.trim() || undefined,
      }

      const clienteSalvo = await salvarCliente(dadosParaSalvar)

      toast({
        title: ehEdicao ? 'Cliente atualizado' : 'Cliente cadastrado',
        description: `O cliente "${clienteSalvo.nome_razao_social}" (Código ${clienteSalvo.codigo}) foi gravado com sucesso.`,
      })

      navigate('/cadastros/clientes')
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Falha ao salvar cliente',
        description: err instanceof Error ? err.message : 'Erro no processamento do cadastro',
      })
    } finally {
      setSalvando(false)
    }
  }

  if (carregando) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-500">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        <p className="text-xs">Carregando dados do cliente...</p>
      </div>
    )
  }

  return (
    <div className="space-y-5 max-w-5xl mx-auto pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-200 pb-4">
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={handleTentarVoltar}
            className="h-9 w-9 text-slate-500 hover:text-slate-800"
          >
            <ArrowLeft size={18} />
          </Button>

          <div>
            <div className="flex items-center gap-2">
              <UserCheck className="h-6 w-6 text-blue-600" />
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                {ehEdicao ? `Editar Cliente #${codigo}` : 'Novo Cliente'}
              </h1>
              {codigo && (
                <Badge variant="outline" className="font-mono text-xs">
                  Cód. {codigo}
                </Badge>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Dados cadastrais para faturamento, documentos fiscais e controle de crédito
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleTentarVoltar}
            disabled={salvando}
            className="text-xs h-9"
          >
            Cancelar
          </Button>

          <Button
            type="submit"
            form="form-cliente"
            size="sm"
            disabled={salvando}
            className="text-xs h-9 bg-blue-600 hover:bg-blue-700 text-white font-medium"
          >
            {salvando ? (
              <>
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                Salvando...
              </>
            ) : (
              <>
                <Save size={14} className="mr-1.5" />
                Salvar Cliente
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Alerta de Operação Interestadual com Contribuinte */}
      {operacaoInterestadualComContribuinte && (
        <Alert className="bg-amber-50 border-amber-200 text-amber-900 py-2.5">
          <Info className="h-4 w-4 text-amber-600" />
          <AlertTitle className="text-xs font-semibold">
            Operação interestadual com contribuinte
          </AlertTitle>
          <AlertDescription className="text-xs text-amber-800">
            A UF do cliente ({uf}) é diferente da UF da empresa ativa ({empresaAtiva?.uf || 'ES'}) e
            o cliente é Contribuinte do ICMS. Nas vendas para este destinatário será aplicada a
            alíquota interestadual com eventual partilha/DIFAL conforme legislação tributária
            vigente.
          </AlertDescription>
        </Alert>
      )}

      {/* Alerta de Cliente Inativo com mesmo CPF/CNPJ */}
      {clienteInativoExistente && (
        <Alert className="bg-blue-50 border-blue-200 text-blue-900 py-3">
          <AlertCircle className="h-4 w-4 text-blue-600" />
          <div className="space-y-1">
            <AlertTitle className="text-xs font-semibold">
              Cliente inativo com este documento
            </AlertTitle>
            <AlertDescription className="text-xs text-blue-800">
              Já existe um cliente inativo cadastrado com este documento:{' '}
              <strong>{clienteInativoExistente.nome_razao_social}</strong> (Código{' '}
              {clienteInativoExistente.codigo}). Você pode reativá-lo para manter o histórico de
              vendas.
            </AlertDescription>
            <div className="pt-1.5">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleReativarInativo}
                disabled={reativando}
                className="h-7 text-xs bg-white border-blue-300 text-blue-800 hover:bg-blue-100"
              >
                {reativando ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                )}
                Reativar este cliente agora
              </Button>
            </div>
          </div>
        </Alert>
      )}

      <form id="form-cliente" onSubmit={handleSalvar}>
        <Tabs value={abaAtiva} onValueChange={setAbaAtiva} className="space-y-4">
          <TabsList className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 h-auto p-1 bg-slate-100/80 border border-slate-200 gap-1">
            <TabsTrigger value="dados" className="text-xs py-2">
              <UserCheck size={14} className="mr-1.5 hidden sm:inline" />
              Dados
            </TabsTrigger>
            <TabsTrigger value="endereco" className="text-xs py-2">
              <MapPin size={14} className="mr-1.5 hidden sm:inline" />
              Endereço
            </TabsTrigger>
            <TabsTrigger value="entrega" className="text-xs py-2">
              <MapPin size={14} className="mr-1.5 hidden sm:inline" />
              Entrega
            </TabsTrigger>
            <TabsTrigger value="contato" className="text-xs py-2">
              <Phone size={14} className="mr-1.5 hidden sm:inline" />
              Contato
            </TabsTrigger>
            <TabsTrigger value="comercial" className="text-xs py-2">
              <Briefcase size={14} className="mr-1.5 hidden sm:inline" />
              Comercial
            </TabsTrigger>
            <TabsTrigger value="financeiro" className="text-xs py-2">
              <RotateCcw size={14} className="mr-1.5 hidden sm:inline" />
              Financeiro
            </TabsTrigger>
            <TabsTrigger value="vendas" className="text-xs py-2">
              <ShoppingCart size={14} className="mr-1.5 hidden sm:inline" />
              Vendas
            </TabsTrigger>
            <TabsTrigger value="observacoes" className="text-xs py-2">
              <FileText size={14} className="mr-1.5 hidden sm:inline" />
              Observações
            </TabsTrigger>
          </TabsList>

          {/* ================= ABA 1: DADOS GERAIS ================= */}
          <TabsContent value="dados">
            <Card className="border-slate-200 shadow-2xs">
              <CardContent className="p-5 space-y-5">
                {/* Tipo de Pessoa e Situação */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end pb-4 border-b border-slate-100">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-slate-700">Tipo de Pessoa *</Label>
                    <Select
                      value={tipoPessoa}
                      onValueChange={(val) => handleTrocaTipoPessoa(val as TipoPessoaCliente)}
                    >
                      <SelectTrigger className="h-9 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Física">Pessoa Física</SelectItem>
                        <SelectItem value="Jurídica">Pessoa Jurídica</SelectItem>
                        <SelectItem value="Estrangeiro">Estrangeiro</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-slate-700">
                      Código Sequencial
                    </Label>
                    <Input
                      value={codigo}
                      readOnly
                      disabled
                      className="h-9 text-xs font-mono bg-slate-50 text-slate-500"
                    />
                  </div>

                  <div className="flex items-center space-x-2 pb-2">
                    <Checkbox
                      id="cliente-ativo"
                      checked={ativo}
                      onCheckedChange={(checked) => setAtivo(Boolean(checked))}
                    />
                    <Label htmlFor="cliente-ativo" className="text-xs font-medium cursor-pointer">
                      Cliente Ativo
                    </Label>
                  </div>
                </div>

                {/* Documentos Principais */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  {tipoPessoa === 'Física' && (
                    <>
                      <div className="space-y-1.5">
                        <Label className="text-xs font-semibold text-slate-700">CPF *</Label>
                        <Input
                          value={cpfCnpj}
                          onChange={(e) => handleDocChange(e.target.value)}
                          placeholder="000.000.000-00"
                          className={`h-9 text-xs ${erros.cpf_cnpj ? 'border-red-500' : ''}`}
                        />
                        {erros.cpf_cnpj && (
                          <p className="text-[11px] text-red-600">{erros.cpf_cnpj}</p>
                        )}
                      </div>

                      <div className="space-y-1.5">
                        <Label className="text-xs font-medium text-slate-700">RG</Label>
                        <Input
                          value={rg}
                          onChange={(e) => setRg(e.target.value)}
                          placeholder="Número do RG"
                          className="h-9 text-xs"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <Label className="text-xs font-medium text-slate-700">
                          Data de Nascimento
                        </Label>
                        <Input
                          type="date"
                          value={dataNascimento}
                          onChange={(e) => setDataNascimento(e.target.value)}
                          className="h-9 text-xs"
                        />
                      </div>
                    </>
                  )}

                  {tipoPessoa === 'Jurídica' && (
                    <>
                      <div className="space-y-1.5 sm:col-span-2">
                        <div className="flex items-center justify-between">
                          <Label className="text-xs font-semibold text-slate-700">CNPJ *</Label>
                          <Button
                            type="button"
                            variant="link"
                            size="sm"
                            onClick={handleConsultarCnpjBrasilApi}
                            disabled={buscandoCnpjApi}
                            className="h-auto p-0 text-[11px] text-blue-600 hover:text-blue-700"
                          >
                            {buscandoCnpjApi ? (
                              <span className="flex items-center gap-1">
                                <Loader2 className="h-3 w-3 animate-spin" /> Consultando
                                BrasilAPI...
                              </span>
                            ) : (
                              <span className="flex items-center gap-1">
                                <Search className="h-3 w-3" /> Consultar CNPJ (BrasilAPI)
                              </span>
                            )}
                          </Button>
                        </div>
                        <Input
                          value={cpfCnpj}
                          onChange={(e) => handleDocChange(e.target.value)}
                          placeholder="00.000.000/0000-00"
                          className={`h-9 text-xs ${erros.cpf_cnpj ? 'border-red-500' : ''}`}
                        />
                        {erros.cpf_cnpj && (
                          <p className="text-[11px] text-red-600">{erros.cpf_cnpj}</p>
                        )}
                      </div>

                      <div className="space-y-1.5">
                        <Label className="text-xs font-medium text-slate-700">Nome Fantasia</Label>
                        <Input
                          value={nomeFantasia}
                          maxLength={60}
                          onChange={(e) => setNomeFantasia(e.target.value)}
                          placeholder="Nome Comercial"
                          className="h-9 text-xs"
                        />
                      </div>
                    </>
                  )}

                  {tipoPessoa === 'Estrangeiro' && (
                    <div className="space-y-1.5 sm:col-span-2">
                      <Label className="text-xs font-semibold text-slate-700">
                        Documento do Estrangeiro (ID Estrangeiro) *
                      </Label>
                      <Input
                        value={idEstrangeiro}
                        onChange={(e) => setIdEstrangeiro(e.target.value)}
                        placeholder="Passaporte, Tax ID ou documento de identificação"
                        className={`h-9 text-xs ${erros.id_estrangeiro ? 'border-red-500' : ''}`}
                      />
                      {erros.id_estrangeiro && (
                        <p className="text-[11px] text-red-600">{erros.id_estrangeiro}</p>
                      )}
                    </div>
                  )}
                </div>

                {/* Razão Social / Nome Completo */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-semibold text-slate-700">
                      {tipoPessoa === 'Jurídica' ? 'Razão Social *' : 'Nome Completo *'}
                    </Label>
                    <span className="text-[10px] text-slate-400">{nomeRazaoSocial.length}/60</span>
                  </div>
                  <Input
                    value={nomeRazaoSocial}
                    maxLength={60}
                    onChange={(e) => setNomeRazaoSocial(e.target.value)}
                    placeholder={
                      tipoPessoa === 'Jurídica'
                        ? 'Razão Social conforme contrato/CNPJ'
                        : 'Nome Completo do Cliente'
                    }
                    className={`h-9 text-xs ${erros.nome_razao_social ? 'border-red-500' : ''}`}
                  />
                  {erros.nome_razao_social && (
                    <p className="text-[11px] text-red-600">{erros.nome_razao_social}</p>
                  )}
                </div>

                {/* Fiscal e Tributário do Cliente */}
                <div className="pt-3 border-t border-slate-100">
                  <h3 className="text-xs font-semibold text-slate-800 uppercase tracking-wider mb-3">
                    Enquadramento Fiscal do Destinatário (NF-e / NFC-e / SPED)
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                    {/* Indicador de IE */}
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold text-slate-700">
                        Indicador de IE *
                      </Label>
                      <Select
                        value={indicadorIe}
                        onValueChange={(val) => handleTrocaIndicadorIe(val as IndicadorIeCliente)}
                      >
                        <SelectTrigger className="h-9 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">1 - Contribuinte ICMS</SelectItem>
                          <SelectItem value="2">2 - Contribuinte isento de inscrição</SelectItem>
                          <SelectItem value="9">9 - Não contribuinte</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Inscrição Estadual */}
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold text-slate-700">
                        Inscrição Estadual {indicadorIe === '1' && '*'}
                      </Label>
                      <Input
                        value={inscricaoEstadual}
                        disabled={indicadorIe === '9'}
                        onChange={(e) => setInscricaoEstadual(e.target.value.toUpperCase())}
                        placeholder={indicadorIe === '2' ? 'ISENTO' : 'Número da IE ou ISENTO'}
                        className={`h-9 text-xs ${erros.inscricao_estadual ? 'border-red-500' : ''}`}
                      />
                      {erros.inscricao_estadual && (
                        <p className="text-[11px] text-red-600">{erros.inscricao_estadual}</p>
                      )}
                    </div>

                    {/* Inscrição Municipal */}
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium text-slate-700">
                        Inscrição Municipal
                      </Label>
                      <Input
                        value={inscricaoMunicipal}
                        onChange={(e) => setInscricaoMunicipal(e.target.value)}
                        placeholder="Opcional (para NFS-e)"
                        className="h-9 text-xs"
                      />
                    </div>

                    {/* Inscrição Suframa */}
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium text-slate-700">
                        Inscrição SUFRAMA
                      </Label>
                      <Input
                        value={inscricaoSuframa}
                        onChange={(e) => setInscricaoSuframa(e.target.value)}
                        placeholder="Opcional (Zona Franca)"
                        className="h-9 text-xs"
                      />
                    </div>

                    {/* Regime Tributário (CRT) do Cliente */}
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium text-slate-700">
                        Regime Tributário (CRT do Cliente)
                      </Label>
                      <Select
                        value={regimeTributario}
                        onValueChange={(val) => setRegimeTributario(val)}
                      >
                        <SelectTrigger className="h-9 text-xs">
                          <SelectValue placeholder="Não informado" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="nenhum">Não informado</SelectItem>
                          <SelectItem value="1">1 - Simples Nacional</SelectItem>
                          <SelectItem value="2">2 - Simples Nacional (Sublimite)</SelectItem>
                          <SelectItem value="3">3 - Regime Normal</SelectItem>
                          <SelectItem value="4">4 - Simples Nacional - MEI</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Consumidor Final */}
                    <div className="flex items-center space-x-2 pt-6">
                      <Checkbox
                        id="consumidor-final"
                        checked={consumidorFinal}
                        onCheckedChange={(checked) => setConsumidorFinal(Boolean(checked))}
                      />
                      <div className="grid gap-0.5 leading-none">
                        <Label
                          htmlFor="consumidor-final"
                          className="text-xs font-medium cursor-pointer"
                        >
                          Consumidor Final
                        </Label>
                        <p className="text-[10px] text-slate-500">
                          {consumidorFinal
                            ? 'Uso e consumo próprio (Sim)'
                            : 'Revenda / Industrialização (Não)'}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ================= ABA 2: ENDEREÇO PRINCIPAL ================= */}
          <TabsContent value="endereco">
            <Card className="border-slate-200 shadow-2xs">
              <CardContent className="p-5 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {/* CEP */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-semibold text-slate-700">CEP</Label>
                      {buscandoCep && (
                        <span className="text-[10px] text-blue-600 flex items-center gap-1">
                          <Loader2 className="h-3 w-3 animate-spin" /> Buscando ViaCEP...
                        </span>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Input
                        value={cep}
                        disabled={tipoPessoa === 'Estrangeiro'}
                        onChange={(e) => {
                          const fmt = formatarCEP(e.target.value)
                          setCep(fmt)
                          if (fmt.replace(/\D/g, '').length === 8) {
                            handleConsultarViaCep(fmt)
                          }
                        }}
                        placeholder="00000-000"
                        className="h-9 text-xs"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={buscandoCep || tipoPessoa === 'Estrangeiro'}
                        onClick={() => handleConsultarViaCep(cep)}
                        className="h-9 px-3 text-xs"
                        title="Buscar endereço por CEP"
                      >
                        <Search size={14} />
                      </Button>
                    </div>
                  </div>

                  {/* Logradouro */}
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label className="text-xs font-medium text-slate-700">Logradouro / Rua</Label>
                    <Input
                      value={logradouro}
                      onChange={(e) => setLogradouro(e.target.value)}
                      placeholder="Avenida, Rua, Travessa..."
                      className="h-9 text-xs"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                  {/* Número */}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-slate-700">Número</Label>
                    <Input
                      value={numero}
                      onChange={(e) => setNumero(e.target.value)}
                      placeholder="123 ou S/N"
                      className="h-9 text-xs"
                    />
                  </div>

                  {/* Complemento */}
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label className="text-xs font-medium text-slate-700">Complemento</Label>
                    <Input
                      value={complemento}
                      onChange={(e) => setComplemento(e.target.value)}
                      placeholder="Sala, Apto, Galpão..."
                      className="h-9 text-xs"
                    />
                  </div>

                  {/* Bairro */}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-slate-700">Bairro</Label>
                    <Input
                      value={bairro}
                      onChange={(e) => setBairro(e.target.value)}
                      placeholder="Nome do Bairro"
                      className="h-9 text-xs"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                  {/* Município */}
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label className="text-xs font-semibold text-slate-700">Município</Label>
                    <Input
                      value={municipio}
                      readOnly={tipoPessoa === 'Estrangeiro'}
                      onChange={(e) => setMunicipio(e.target.value)}
                      placeholder="Cidade"
                      className="h-9 text-xs"
                    />
                  </div>

                  {/* UF */}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-slate-700">UF</Label>
                    {tipoPessoa === 'Estrangeiro' ? (
                      <Input
                        value="EX"
                        readOnly
                        disabled
                        className="h-9 text-xs font-mono bg-slate-50"
                      />
                    ) : (
                      <Select value={uf} onValueChange={(val) => setUf(val)}>
                        <SelectTrigger className="h-9 text-xs">
                          <SelectValue placeholder="UF" />
                        </SelectTrigger>
                        <SelectContent>
                          {UFS_BRASIL.map((item) => (
                            <SelectItem key={item} value={item}>
                              {item}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>

                  {/* Código Município IBGE */}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-slate-700">
                      Código IBGE (7 dígitos)
                    </Label>
                    <Input
                      value={codigoMunicipioIbge}
                      readOnly={tipoPessoa === 'Estrangeiro'}
                      onChange={(e) =>
                        setCodigoMunicipioIbge(e.target.value.replace(/\D/g, '').slice(0, 7))
                      }
                      placeholder={tipoPessoa === 'Estrangeiro' ? '9999999' : '3205002'}
                      className="h-9 text-xs font-mono"
                    />
                  </div>
                </div>

                {/* País */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-slate-700">País</Label>
                    {tipoPessoa === 'Estrangeiro' ? (
                      <Select
                        value={codigoPais}
                        onValueChange={(val) => {
                          setCodigoPais(val)
                          const selecionado = PAISES_COMUNS.find((p) => p.codigo === val)
                          if (selecionado) setPais(selecionado.nome)
                        }}
                      >
                        <SelectTrigger className="h-9 text-xs">
                          <SelectValue placeholder="Selecione o país..." />
                        </SelectTrigger>
                        <SelectContent>
                          {PAISES_COMUNS.filter((p) => p.codigo !== '1058').map((p) => (
                            <SelectItem key={p.codigo} value={p.codigo}>
                              {p.nome} ({p.codigo})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        value={`${pais} (BACEN: ${codigoPais})`}
                        readOnly
                        disabled
                        className="h-9 text-xs bg-slate-50 text-slate-600"
                      />
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ================= ABA 3: ENDEREÇO DE ENTREGA ================= */}
          <TabsContent value="entrega">
            <Card className="border-slate-200 shadow-2xs">
              <CardContent className="p-5 space-y-4">
                <div className="flex items-center space-x-2 pb-3 border-b border-slate-100">
                  <Checkbox
                    id="mesmo-endereco"
                    checked={entregaMesmoEndereco}
                    onCheckedChange={(checked) => setEntregaMesmoEndereco(Boolean(checked))}
                  />
                  <Label htmlFor="mesmo-endereco" className="text-xs font-medium cursor-pointer">
                    Entrega no mesmo endereço principal
                  </Label>
                </div>

                {!entregaMesmoEndereco ? (
                  <div className="space-y-4 pt-2">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      {/* CEP Entrega */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <Label className="text-xs font-semibold text-slate-700">
                            CEP de Entrega
                          </Label>
                          {buscandoEntregaCep && (
                            <span className="text-[10px] text-blue-600 flex items-center gap-1">
                              <Loader2 className="h-3 w-3 animate-spin" /> Buscando...
                            </span>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <Input
                            value={entregaCep}
                            onChange={(e) => {
                              const fmt = formatarCEP(e.target.value)
                              setEntregaCep(fmt)
                              if (fmt.replace(/\D/g, '').length === 8) {
                                handleConsultarEntregaViaCep(fmt)
                              }
                            }}
                            placeholder="00000-000"
                            className="h-9 text-xs"
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={buscandoEntregaCep}
                            onClick={() => handleConsultarEntregaViaCep(entregaCep)}
                            className="h-9 px-3 text-xs"
                          >
                            <Search size={14} />
                          </Button>
                        </div>
                      </div>

                      {/* Logradouro Entrega */}
                      <div className="space-y-1.5 sm:col-span-2">
                        <Label className="text-xs font-medium text-slate-700">Logradouro</Label>
                        <Input
                          value={entregaLogradouro}
                          onChange={(e) => setEntregaLogradouro(e.target.value)}
                          placeholder="Rua, Avenida de entrega"
                          className="h-9 text-xs"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                      {/* Número */}
                      <div className="space-y-1.5">
                        <Label className="text-xs font-medium text-slate-700">Número</Label>
                        <Input
                          value={entregaNumero}
                          onChange={(e) => setEntregaNumero(e.target.value)}
                          placeholder="123"
                          className="h-9 text-xs"
                        />
                      </div>

                      {/* Complemento */}
                      <div className="space-y-1.5 sm:col-span-2">
                        <Label className="text-xs font-medium text-slate-700">Complemento</Label>
                        <Input
                          value={entregaComplemento}
                          onChange={(e) => setEntregaComplemento(e.target.value)}
                          placeholder="Galpão, Doca..."
                          className="h-9 text-xs"
                        />
                      </div>

                      {/* Bairro */}
                      <div className="space-y-1.5">
                        <Label className="text-xs font-medium text-slate-700">Bairro</Label>
                        <Input
                          value={entregaBairro}
                          onChange={(e) => setEntregaBairro(e.target.value)}
                          placeholder="Bairro"
                          className="h-9 text-xs"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                      {/* Município */}
                      <div className="space-y-1.5 sm:col-span-2">
                        <Label className="text-xs font-semibold text-slate-700">Município</Label>
                        <Input
                          value={entregaMunicipio}
                          onChange={(e) => setEntregaMunicipio(e.target.value)}
                          placeholder="Cidade de entrega"
                          className="h-9 text-xs"
                        />
                      </div>

                      {/* UF */}
                      <div className="space-y-1.5">
                        <Label className="text-xs font-semibold text-slate-700">UF</Label>
                        <Select value={entregaUf} onValueChange={(val) => setEntregaUf(val)}>
                          <SelectTrigger className="h-9 text-xs">
                            <SelectValue placeholder="UF" />
                          </SelectTrigger>
                          <SelectContent>
                            {UFS_BRASIL.map((item) => (
                              <SelectItem key={item} value={item}>
                                {item}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* IBGE */}
                      <div className="space-y-1.5">
                        <Label className="text-xs font-medium text-slate-700">IBGE</Label>
                        <Input
                          value={entregaCodigoMunicipioIbge}
                          onChange={(e) =>
                            setEntregaCodigoMunicipioIbge(
                              e.target.value.replace(/\D/g, '').slice(0, 7),
                            )
                          }
                          placeholder="Código IBGE"
                          className="h-9 text-xs font-mono"
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="py-8 text-center text-slate-400 text-xs">
                    As entregas e o frete utilizarão o mesmo endereço principal informado na aba{' '}
                    <strong>Endereço</strong>.
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ================= ABA 4: CONTATO ================= */}
          <TabsContent value="contato">
            <Card className="border-slate-200 shadow-2xs">
              <CardContent className="p-5 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {/* Telefone Fixo */}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-slate-700">Telefone Fixo</Label>
                    <Input
                      value={telefone}
                      onChange={(e) => setTelefone(formatarTelefone(e.target.value))}
                      placeholder="(00) 0000-0000"
                      className="h-9 text-xs"
                    />
                  </div>

                  {/* Celular */}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-slate-700">Celular</Label>
                    <Input
                      value={celular}
                      onChange={(e) => setCelular(formatarTelefone(e.target.value))}
                      placeholder="(00) 00000-0000"
                      className="h-9 text-xs"
                    />
                  </div>

                  {/* WhatsApp */}
                  <div className="flex items-center space-x-2 pt-6">
                    <Checkbox
                      id="contato-whatsapp"
                      checked={whatsapp}
                      onCheckedChange={(checked) => setWhatsapp(Boolean(checked))}
                    />
                    <Label
                      htmlFor="contato-whatsapp"
                      className="text-xs font-medium cursor-pointer"
                    >
                      Este número é WhatsApp
                    </Label>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* E-mail Geral */}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-slate-700">
                      E-mail Comercial / Contato
                    </Label>
                    <Input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="contato@cliente.com.br"
                      className="h-9 text-xs"
                    />
                  </div>

                  {/* Nome da Pessoa de Contato */}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-slate-700">
                      Nome do Contato Principal
                    </Label>
                    <Input
                      value={contatoNome}
                      onChange={(e) => setContatoNome(e.target.value)}
                      placeholder="Ex.: João Financeiro, Maria Compras"
                      className="h-9 text-xs"
                    />
                  </div>
                </div>

                {/* E-mail NF-e */}
                <div className="space-y-1.5 pt-2">
                  <Label className="text-xs font-semibold text-slate-700">
                    E-mail para Envio de NF-e / NFC-e (XML e DANFE)
                  </Label>
                  <Input
                    value={emailNfe}
                    onChange={(e) => setEmailNfe(e.target.value)}
                    placeholder="nfe@cliente.com.br; financeiro@cliente.com.br (separar por ponto e vírgula)"
                    className="h-9 text-xs font-mono"
                  />
                  <p className="text-[11px] text-slate-500">
                    Pode conter múltiplos e-mails separados por ponto e vírgula (;) para onde os
                    documentos fiscais autorizados serão disparados automaticamente.
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ================= ABA 5: COMERCIAL ================= */}
          <TabsContent value="comercial">
            <Card className="border-slate-200 shadow-2xs">
              <CardContent className="p-5 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {/* Vendedor Responsável */}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-slate-700">
                      Vendedor Responsável
                    </Label>
                    <Select value={vendedorId} onValueChange={(val) => setVendedorId(val)}>
                      <SelectTrigger className="h-9 text-xs">
                        <SelectValue placeholder="Selecione o vendedor..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="nenhum">Nenhum / Carteira Geral</SelectItem>
                        {vendedores.map((v) => (
                          <SelectItem key={v.id} value={v.id}>
                            {v.nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Limite de Crédito */}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-slate-700">
                      Limite de Crédito (R$)
                    </Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={limiteCredito}
                      onChange={(e) => setLimiteCredito(e.target.value)}
                      placeholder="0,00"
                      className="h-9 text-xs"
                    />
                  </div>

                  {/* Dia de Vencimento Preferencial */}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-slate-700">
                      Dia de Vencimento Preferencial
                    </Label>
                    <Input
                      type="number"
                      min="1"
                      max="31"
                      value={diaVencimentoPreferencial}
                      onChange={(e) => setDiaVencimentoPreferencial(e.target.value)}
                      placeholder="Ex.: 10"
                      className="h-9 text-xs"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Condição de Pagamento Padrão (Select com busca e fallback texto antigo) */}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-slate-700">
                      Condição de Pagamento Padrão
                    </Label>
                    <SelectCondicaoPagamento
                      value={condicaoPagamentoId}
                      onChange={(id) => setCondicaoPagamentoId(id)}
                      uso="Vendas"
                      placeholder="Selecione a condição de pagamento padrão..."
                    />
                    {!condicaoPagamentoId && condicaoPagamentoPadrao && (
                      <p className="text-[11px] text-amber-600 bg-amber-50 border border-amber-200/60 rounded px-2 py-1">
                        <span className="font-medium">Registro anterior (texto):</span> "
                        {condicaoPagamentoPadrao}". Selecione uma condição estruturada acima para
                        atualizar.
                      </p>
                    )}
                  </div>

                  {/* Desconto Padrão (%) */}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-slate-700">
                      Desconto Padrão (%)
                    </Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      value={descontoPadraoPercentual}
                      onChange={(e) => setDescontoPadraoPercentual(e.target.value)}
                      placeholder="Ex.: 5.00"
                      className="h-9 text-xs"
                    />
                  </div>
                </div>

                {/* Bloqueio de Vendas a Prazo */}
                <div className="pt-4 border-t border-slate-100 space-y-3">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="bloqueado-vendas"
                      checked={bloqueado}
                      onCheckedChange={(checked) => setBloqueado(Boolean(checked))}
                    />
                    <div className="grid gap-0.5 leading-none">
                      <Label
                        htmlFor="bloqueado-vendas"
                        className="text-xs font-semibold text-red-600 cursor-pointer"
                      >
                        Bloquear Vendas a Prazo / Faturadas para este Cliente
                      </Label>
                      <p className="text-[10px] text-slate-500">
                        Quando marcado, o sistema impedirá faturamento a prazo, liberando apenas
                        vendas à vista.
                      </p>
                    </div>
                  </div>

                  {bloqueado && (
                    <div className="space-y-1.5 pl-6">
                      <Label className="text-xs font-semibold text-slate-700">
                        Motivo do Bloqueio *
                      </Label>
                      <Input
                        value={motivoBloqueio}
                        onChange={(e) => setMotivoBloqueio(e.target.value)}
                        placeholder="Ex.: Títulos protestados, pendência financeira no Serasa"
                        className={`h-9 text-xs ${erros.motivo_bloqueio ? 'border-red-500' : ''}`}
                      />
                      {erros.motivo_bloqueio && (
                        <p className="text-[11px] text-red-600">{erros.motivo_bloqueio}</p>
                      )}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ================= ABA 6: FINANCEIRO ================= */}
          <TabsContent value="financeiro">
            <Card className="border-slate-200 shadow-2xs">
              <CardContent className="p-5 space-y-5">
                {!ehEdicao ? (
                  <div className="py-12 text-center text-slate-400 text-xs">
                    Salve o cadastro do cliente para habilitar o painel de crédito e títulos a
                    receber.
                  </div>
                ) : carregandoCredito ? (
                  <div className="py-12 flex flex-col items-center justify-center text-slate-500 gap-2">
                    <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
                    <span className="text-xs">Consultando crédito e títulos a receber...</span>
                  </div>
                ) : (
                  <>
                    {/* Quadro de Crédito */}
                    {resumoCredito && (
                      <div className="border rounded-lg p-4 bg-slate-50/70 space-y-3">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-200">
                          <div>
                            <span className="text-xs font-semibold text-slate-800">
                              Situação de Crédito do Cliente
                            </span>
                            <p className="text-[11px] text-slate-500">{resumoCredito.motivo}</p>
                          </div>

                          <div>
                            <Badge
                              className={`text-xs px-3 py-1 font-semibold ${
                                resumoCredito.situacao === 'Liberado'
                                  ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                  : resumoCredito.situacao === 'Atenção'
                                    ? 'bg-amber-100 text-amber-900 border-amber-300'
                                    : 'bg-red-100 text-red-900 border-red-300'
                              }`}
                            >
                              Crédito {resumoCredito.situacao}
                            </Badge>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs text-center">
                          <div className="bg-white p-2.5 rounded-md border border-slate-200">
                            <span className="text-[10px] uppercase text-slate-400 font-semibold block">
                              Total em Aberto
                            </span>
                            <span className="font-mono font-bold text-slate-800 text-sm">
                              R$ {resumoCredito.totalEmAberto.toFixed(2)}
                            </span>
                          </div>

                          <div className="bg-white p-2.5 rounded-md border border-slate-200">
                            <span className="text-[10px] uppercase text-slate-400 font-semibold block">
                              Total Vencido
                            </span>
                            <span
                              className={`font-mono font-bold text-sm ${
                                resumoCredito.totalVencido > 0 ? 'text-red-600' : 'text-slate-800'
                              }`}
                            >
                              R$ {resumoCredito.totalVencido.toFixed(2)}
                            </span>
                          </div>

                          <div className="bg-white p-2.5 rounded-md border border-slate-200">
                            <span className="text-[10px] uppercase text-slate-400 font-semibold block">
                              Maior Atraso
                            </span>
                            <span
                              className={`font-mono font-bold text-sm ${
                                resumoCredito.maiorAtrasoDias > 0
                                  ? 'text-red-600'
                                  : 'text-slate-800'
                              }`}
                            >
                              {resumoCredito.maiorAtrasoDias} dia(s)
                            </span>
                          </div>

                          <div className="bg-white p-2.5 rounded-md border border-slate-200">
                            <span className="text-[10px] uppercase text-slate-400 font-semibold block">
                              Limite Concedido
                            </span>
                            <span className="font-mono font-bold text-slate-800 text-sm">
                              R$ {resumoCredito.limiteCredito.toFixed(2)}
                            </span>
                          </div>

                          <div className="bg-white p-2.5 rounded-md border border-slate-200 col-span-2 sm:col-span-1">
                            <span className="text-[10px] uppercase text-slate-400 font-semibold block">
                              Saldo Disponível
                            </span>
                            <span
                              className={`font-mono font-bold text-sm ${
                                resumoCredito.creditoDisponivel < 0
                                  ? 'text-red-600'
                                  : 'text-emerald-700'
                              }`}
                            >
                              R$ {resumoCredito.creditoDisponivel.toFixed(2)}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Tabela de Títulos a Receber (Em aberto e últimos 12 meses) */}
                    <div className="border rounded-lg bg-white overflow-hidden">
                      <div className="px-3 py-2 bg-slate-100 flex items-center justify-between text-xs font-semibold text-slate-700">
                        <span>Histórico de Títulos a Receber ({titulosCliente.length})</span>
                        <span className="text-[11px] font-normal text-slate-500">
                          Títulos em aberto e faturamentos recentes
                        </span>
                      </div>

                      <div className="overflow-x-auto max-h-80 overflow-y-auto">
                        <table className="w-full text-xs">
                          <thead className="bg-slate-50 border-b text-slate-600 sticky top-0">
                            <tr>
                              <th className="py-2 px-3 text-left">Documento</th>
                              <th className="py-2 px-3 text-left">Vencimento</th>
                              <th className="py-2 px-3 text-left">Descrição</th>
                              <th className="py-2 px-3 text-right">Original</th>
                              <th className="py-2 px-3 text-right">Saldo Aberto</th>
                              <th className="py-2 px-3 text-center">Status</th>
                              <th className="py-2 px-3 text-center">Ação</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {titulosCliente.length === 0 ? (
                              <tr>
                                <td colSpan={7} className="py-8 text-center text-slate-400">
                                  Nenhum título a receber encontrado para este cliente.
                                </td>
                              </tr>
                            ) : (
                              titulosCliente.map((t) => {
                                const saldoAberto = t.saldo ?? t.valor_original
                                const podeReceber = t.status === 'Aberto' || t.status === 'Parcial'
                                const dtVenc = new Date(
                                  t.data_vencimento + 'T00:00:00',
                                ).toLocaleDateString('pt-BR')

                                return (
                                  <tr key={t.id} className="hover:bg-slate-50">
                                    <td className="py-2 px-3 font-mono font-medium text-slate-800">
                                      {t.numero_documento}
                                      <span className="text-[10px] text-slate-400 block">
                                        Parc {t.parcela}
                                      </span>
                                    </td>
                                    <td className="py-2 px-3 font-mono">{dtVenc}</td>
                                    <td
                                      className="py-2 px-3 max-w-[200px] truncate"
                                      title={t.descricao}
                                    >
                                      {t.descricao}
                                    </td>
                                    <td className="py-2 px-3 text-right font-mono">
                                      R$ {t.valor_original.toFixed(2)}
                                    </td>
                                    <td className="py-2 px-3 text-right font-mono font-bold text-slate-900">
                                      R$ {saldoAberto.toFixed(2)}
                                    </td>
                                    <td className="py-2 px-3 text-center">
                                      <Badge
                                        variant="outline"
                                        className={
                                          t.status === 'Recebido'
                                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px]'
                                            : t.status === 'Parcial'
                                              ? 'bg-blue-50 text-blue-700 border-blue-200 text-[10px]'
                                              : 'bg-amber-50 text-amber-700 border-amber-200 text-[10px]'
                                        }
                                      >
                                        {t.status}
                                      </Badge>
                                    </td>
                                    <td className="py-2 px-3 text-center">
                                      {podeReceber && (
                                        <Button
                                          type="button"
                                          size="sm"
                                          variant="secondary"
                                          onClick={() => {
                                            setTituloParaReceberAba(t)
                                            setModalReceberAbaAberto(true)
                                          }}
                                          className="h-6 text-[11px] px-2 text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50"
                                        >
                                          Receber
                                        </Button>
                                      )}
                                    </td>
                                  </tr>
                                )
                              })
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ================= ABA: VENDAS ================= */}
          <TabsContent value="vendas">
            <Card className="border-slate-200 shadow-2xs">
              <CardContent className="p-5 space-y-5">
                {!ehEdicao ? (
                  <div className="py-12 text-center text-slate-400 text-xs">
                    Salve o cadastro do cliente para consultar o histórico de vendas.
                  </div>
                ) : carregandoVendas ? (
                  <div className="py-12 flex flex-col items-center justify-center text-slate-500 gap-2">
                    <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
                    <span className="text-xs">Carregando histórico de vendas...</span>
                  </div>
                ) : (
                  <>
                    {/* Resumo por Ano e Geral */}
                    <div className="space-y-3">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-100">
                        <div>
                          <h3 className="text-xs font-semibold text-slate-800 uppercase tracking-wider">
                            Resumo de Compras por Ano
                          </h3>
                          <p className="text-[11px] text-slate-500">
                            Total geral faturado:{' '}
                            <strong className="text-slate-800">
                              R${' '}
                              {(historicoVendas?.totalGeral || 0).toLocaleString('pt-BR', {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}
                            </strong>{' '}
                            em {historicoVendas?.quantidadeGeral || 0} venda(s) finalizada(s).
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => id && carregarVendasCliente(id)}
                          className="h-7 text-xs"
                        >
                          Atualizar
                        </Button>
                      </div>

                      {!historicoVendas?.totalPorAno || historicoVendas.totalPorAno.length === 0 ? (
                        <div className="p-4 bg-slate-50 border rounded text-xs text-slate-500 text-center">
                          Nenhuma venda finalizada encontrada para este cliente até o momento.
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3">
                          {historicoVendas.totalPorAno.map((anoInfo) => (
                            <div
                              key={anoInfo.ano}
                              className="bg-white p-3 rounded-lg border border-slate-200 shadow-2xs"
                            >
                              <span className="text-[10px] uppercase font-bold text-slate-400 block">
                                Ano {anoInfo.ano}
                              </span>
                              <span className="font-mono font-bold text-slate-900 text-sm block mt-0.5">
                                R${' '}
                                {anoInfo.valorTotal.toLocaleString('pt-BR', {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })}
                              </span>
                              <span className="text-[10px] text-slate-500">
                                {anoInfo.quantidade} {anoInfo.quantidade === 1 ? 'venda' : 'vendas'}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Tabela de Últimas Vendas */}
                    <div className="border rounded-lg bg-white overflow-hidden">
                      <div className="px-3 py-2 bg-slate-100 flex items-center justify-between text-xs font-semibold text-slate-700">
                        <span>Últimas Vendas ({historicoVendas?.ultimasVendas.length || 0})</span>
                        <span className="text-[11px] font-normal text-slate-500">
                          Orçamentos/pedidos finalizados
                        </span>
                      </div>

                      <div className="overflow-x-auto max-h-80 overflow-y-auto">
                        <table className="w-full text-xs">
                          <thead className="bg-slate-50 border-b text-slate-600 sticky top-0">
                            <tr>
                              <th className="py-2 px-3 text-left">Número</th>
                              <th className="py-2 px-3 text-left">Data</th>
                              <th className="py-2 px-3 text-left">Tipo</th>
                              <th className="py-2 px-3 text-center">Status</th>
                              <th className="py-2 px-3 text-right">Total</th>
                              <th className="py-2 px-3 text-center">Ações</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {!historicoVendas?.ultimasVendas ||
                            historicoVendas.ultimasVendas.length === 0 ? (
                              <tr>
                                <td colSpan={6} className="py-8 text-center text-slate-400">
                                  Nenhuma venda registrada para este cliente.
                                </td>
                              </tr>
                            ) : (
                              historicoVendas.ultimasVendas.map((v) => {
                                const dataFmt = v.data_emissao
                                  ? new Date(v.data_emissao + 'T00:00:00').toLocaleDateString(
                                      'pt-BR',
                                    )
                                  : v.created
                                    ? new Date(v.created).toLocaleDateString('pt-BR')
                                    : '-'
                                const valorTotal = Number(v.valor_total) || 0

                                return (
                                  <tr key={v.id} className="hover:bg-slate-50">
                                    <td className="py-2 px-3 font-mono font-medium text-slate-800">
                                      #{String(v.numero).padStart(6, '0')}
                                    </td>
                                    <td className="py-2 px-3 font-mono">{dataFmt}</td>
                                    <td className="py-2 px-3">
                                      <Badge variant="outline" className="text-[10px]">
                                        {v.tipo}
                                      </Badge>
                                    </td>
                                    <td className="py-2 px-3 text-center">
                                      <Badge
                                        className={
                                          v.status === 'Finalizada'
                                            ? 'bg-emerald-100 text-emerald-800 border-emerald-200 text-[10px]'
                                            : v.status === 'Cancelada'
                                              ? 'bg-red-100 text-red-800 border-red-200 text-[10px]'
                                              : 'bg-blue-100 text-blue-800 border-blue-200 text-[10px]'
                                        }
                                      >
                                        {v.status}
                                      </Badge>
                                    </td>
                                    <td className="py-2 px-3 text-right font-mono font-bold text-slate-900">
                                      R${' '}
                                      {valorTotal.toLocaleString('pt-BR', {
                                        minimumFractionDigits: 2,
                                        maximumFractionDigits: 2,
                                      })}
                                    </td>
                                    <td className="py-2 px-3 text-center">
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => navigate(`/vendas/pedidos/${v.id}`)}
                                        className="h-6 text-[11px] px-2 text-blue-600 hover:text-blue-800"
                                      >
                                        Ver Venda
                                      </Button>
                                    </td>
                                  </tr>
                                )
                              })
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ================= ABA 7: OBSERVAÇÕES ================= */}
          <TabsContent value="observacoes">
            <Card className="border-slate-200 shadow-2xs">
              <CardContent className="p-5 space-y-4">
                {/* Observações Internas */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-slate-700">
                    Observações Internas (Cadastrais)
                  </Label>
                  <Textarea
                    rows={4}
                    value={observacoes}
                    onChange={(e) => setObservacoes(e.target.value)}
                    placeholder="Anotações comerciais, histórico de negociações, restrições internas..."
                    className="text-xs"
                  />
                  <p className="text-[10px] text-slate-400">Texto livre visível apenas no ERP.</p>
                </div>

                {/* Observação que sai automaticamente nas Notas */}
                <div className="space-y-1.5 pt-2 border-t border-slate-100">
                  <Label className="text-xs font-semibold text-slate-700">
                    Observação Automática da Nota Fiscal (Informações Complementares)
                  </Label>
                  <Textarea
                    rows={4}
                    value={observacaoNota}
                    onChange={(e) => setObservacaoNota(e.target.value)}
                    placeholder="Ex.: Pedido de compra nº 1234. Entregar das 08h às 12h. Local de descarga doca 2."
                    className="text-xs"
                  />
                  <p className="text-[11px] text-slate-500">
                    Este texto será adicionado automaticamente no campo de Informações
                    Complementares das notas fiscais (NF-e/NFC-e) emitidas para este cliente.
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Barra Flutuante de Ação no Rodapé */}
        <div className="sticky bottom-0 bg-white/95 backdrop-blur-xs border-t border-slate-200 p-3 mt-6 flex items-center justify-between rounded-lg shadow-sm">
          <div className="text-xs text-slate-500">
            {temAlteracoesNaoSalvas ? (
              <span className="text-amber-600 font-medium flex items-center gap-1">
                <AlertCircle size={13} /> Há alterações não salvas no formulário.
              </span>
            ) : (
              <span>Todos os dados estão salvos.</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleTentarVoltar}
              disabled={salvando}
              className="text-xs h-9"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={salvando}
              className="text-xs h-9 bg-blue-600 hover:bg-blue-700 text-white font-medium"
            >
              {salvando ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  Salvando...
                </>
              ) : (
                <>
                  <Save size={14} className="mr-1.5" />
                  Salvar Cliente
                </>
              )}
            </Button>
          </div>
        </div>
      </form>

      {/* Modal de Recebimento rápido a partir da aba Financeiro */}
      {tituloParaReceberAba && (
        <ModalReceberTitulos
          open={modalReceberAbaAberto}
          onOpenChange={(op) => {
            setModalReceberAbaAberto(op)
            if (!op) setTituloParaReceberAba(null)
          }}
          titulos={[tituloParaReceberAba]}
          onSucesso={() => {
            if (id) carregarFinanceiroCliente(id)
          }}
        />
      )}

      {/* Alerta de confirmação para sair sem salvar */}
      <AlertDialog open={alertaSairAberto} onOpenChange={setAlertaSairAberto}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base font-semibold text-slate-900">
              Descartar alterações?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-slate-500">
              Existem alterações não salvas neste cliente. Se você sair agora, as modificações serão
              perdidas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="text-xs">Continuar editando</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => navigate('/cadastros/clientes')}
              className="bg-red-600 hover:bg-red-700 text-white text-xs"
            >
              Sair sem salvar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

export default ClienteForm
