import React, { useState, useEffect, useMemo } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import {
  Truck,
  Building2,
  User,
  Globe2,
  ArrowLeft,
  Save,
  Loader2,
  Search,
  AlertCircle,
  RotateCcw,
  MapPin,
  Phone,
  Briefcase,
  Landmark,
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
import {
  Fornecedor,
  TipoPessoaFornecedor,
  IndicadorIeFornecedor,
  CrtFornecedor,
  TipoFornecedor,
  TipoContaBancaria,
  TipoChavePix,
  obterFornecedorPorId,
  obterProximoCodigoFornecedor,
  salvarFornecedor,
  ativarFornecedor,
  buscarFornecedorPorCpfCnpj,
  validarDadosFornecedor,
  normalizarCpfCnpj,
} from '@/services/fornecedores'
import {
  listarNotasDoFornecedorComTotais,
  HistoricoNotasFornecedorResultado,
} from '@/services/consultasCompras'
import { obterResumoFinanceiroFornecedor, ResumoFinanceiroFornecedor } from '@/services/financeiro'
import { useEmpresaAtiva } from '@/contexts/EmpresaContext'
import { usePermissoes } from '@/contexts/PermissoesContext'
import { SelectCondicaoPagamento } from '@/components/SelectCondicaoPagamento'
import { Receipt, DollarSign } from 'lucide-react'
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

const OPCOES_TIPO_FORNECEDOR: TipoFornecedor[] = [
  'Mercadorias',
  'Serviços',
  'Transportadora',
  'Uso e consumo',
  'Outros',
]

export const FornecedorForm: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { toast } = useToast()
  const { empresaAtiva } = useEmpresaAtiva()
  const { pode } = usePermissoes()
  const podeVerFinanceiro = pode('financeiro_pagar', 'ver')

  const ehEdicao = Boolean(id)

  const [carregando, setCarregando] = useState(ehEdicao)
  const [salvando, setSalvando] = useState(false)
  const [abaAtiva, setAbaAtiva] = useState('dados')

  // Histórico de Notas de Entrada
  const [historicoNotas, setHistoricoNotas] = useState<HistoricoNotasFornecedorResultado>({
    notas: [],
    totaisPorAno: [],
    totalGeralNotas: 0,
    valorGeralTotal: 0,
  })
  const [carregandoNotas, setCarregandoNotas] = useState(false)

  // Resumo Financeiro (Últimos 12 meses: abertos, vencidos, pagos e totais)
  const [resumoFinanceiro, setResumoFinanceiro] = useState<ResumoFinanceiroFornecedor>({
    abertos: { quantidade: 0, valorTotal: 0, titulos: [] },
    vencidos: { quantidade: 0, valorTotal: 0, titulos: [] },
    pagos: { quantidade: 0, valorTotal: 0, titulos: [] },
    totaisGerais: { quantidadeTotal: 0, valorOriginalTotal: 0, valorPagoTotal: 0, saldoTotal: 0 },
  })
  const [carregandoFinanceiro, setCarregandoFinanceiro] = useState(false)

  // Identificação
  const [codigo, setCodigo] = useState<number | string>('')
  const [tipoPessoa, setTipoPessoa] = useState<TipoPessoaFornecedor>('Jurídica')
  const [cpfCnpj, setCpfCnpj] = useState('')
  const [idEstrangeiro, setIdEstrangeiro] = useState('')
  const [razaoSocial, setRazaoSocial] = useState('')
  const [nomeFantasia, setNomeFantasia] = useState('')
  const [indicadorIe, setIndicadorIe] = useState<IndicadorIeFornecedor>('1')
  const [inscricaoEstadual, setInscricaoEstadual] = useState('')
  const [inscricaoMunicipal, setInscricaoMunicipal] = useState('')
  const [inscricaoSuframa, setInscricaoSuframa] = useState('')
  const [crtFornecedor, setCrtFornecedor] = useState<string>('nenhum')
  const [tiposFornecedor, setTiposFornecedor] = useState<TipoFornecedor[]>(['Mercadorias'])
  const [produtorRural, setProdutorRural] = useState(false)
  const [ativo, setAtivo] = useState(true)

  // Endereço
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

  // Contato
  const [telefone, setTelefone] = useState('')
  const [celular, setCelular] = useState('')
  const [email, setEmail] = useState('')
  const [emailFinanceiro, setEmailFinanceiro] = useState('')
  const [site, setSite] = useState('')
  const [contatoNome, setContatoNome] = useState('')
  const [contatoCargo, setContatoCargo] = useState('')
  const [contatoTelefone, setContatoTelefone] = useState('')

  // Comercial
  const [prazoEntregaDias, setPrazoEntregaDias] = useState<string>('')
  const [condicaoPagamentoId, setCondicaoPagamentoId] = useState<string>('')
  const [condicaoPagamentoPadrao, setCondicaoPagamentoPadrao] = useState<string>('')
  const [pedidoMinimo, setPedidoMinimo] = useState<string>('')
  const [representanteNome, setRepresentanteNome] = useState('')
  const [representanteTelefone, setRepresentanteTelefone] = useState('')
  const [representanteEmail, setRepresentanteEmail] = useState('')

  // Dados bancários
  const [bancoCodigo, setBancoCodigo] = useState('')
  const [bancoNome, setBancoNome] = useState('')
  const [agencia, setAgencia] = useState('')
  const [conta, setConta] = useState('')
  const [tipoConta, setTipoConta] = useState<string>('nenhum')
  const [titular, setTitular] = useState('')
  const [cpfCnpjTitular, setCpfCnpjTitular] = useState('')
  const [pixTipo, setPixTipo] = useState<string>('nenhum')
  const [pixChave, setPixChave] = useState('')

  // Outros
  const [observacoes, setObservacoes] = useState('')

  // Erros e avisos
  const [erros, setErros] = useState<Record<string, string>>({})
  const [buscandoCnpjApi, setBuscandoCnpjApi] = useState(false)
  const [fornecedorInativoExistente, setFornecedorInativoExistente] = useState<Fornecedor | null>(
    null,
  )
  const [reativando, setReativando] = useState(false)

  // Alterações não salvas
  const [dadosIniciais, setDadosIniciais] = useState<string>('')
  const [alertaSairAberto, setAlertaSairAberto] = useState(false)

  // Carregar dados se edição
  useEffect(() => {
    if (ehEdicao && id) {
      setCarregando(true)
      obterFornecedorPorId(id)
        .then((f) => {
          setCodigo(f.codigo)
          setTipoPessoa(f.tipo_pessoa || 'Jurídica')
          if (f.tipo_pessoa === 'Física') {
            setCpfCnpj(f.cpf_cnpj ? formatarCPF(f.cpf_cnpj) : '')
          } else if (f.tipo_pessoa === 'Jurídica') {
            setCpfCnpj(f.cpf_cnpj ? formatarCNPJ(f.cpf_cnpj) : '')
          } else {
            setCpfCnpj(f.cpf_cnpj || '')
          }
          setIdEstrangeiro(f.id_estrangeiro || '')
          setRazaoSocial(f.razao_social || '')
          setNomeFantasia(f.nome_fantasia || '')
          setIndicadorIe((f.indicador_ie as IndicadorIeFornecedor) || '1')
          setInscricaoEstadual(f.inscricao_estadual || '')
          setInscricaoMunicipal(f.inscricao_municipal || '')
          setInscricaoSuframa(f.inscricao_suframa || '')
          setCrtFornecedor(f.crt_fornecedor || 'nenhum')
          setTiposFornecedor(
            Array.isArray(f.tipo_fornecedor) && f.tipo_fornecedor.length > 0
              ? f.tipo_fornecedor
              : ['Mercadorias'],
          )
          setProdutorRural(f.produtor_rural ?? false)
          setAtivo(f.ativo ?? true)

          // Endereço
          setCep(f.cep ? formatarCEP(f.cep) : '')
          setLogradouro(f.logradouro || '')
          setNumero(f.numero || '')
          setComplemento(f.complemento || '')
          setBairro(f.bairro || '')
          setMunicipio(f.municipio || '')
          setCodigoMunicipioIbge(f.codigo_municipio_ibge || '')
          setUf(f.uf || '')
          setCodigoPais(f.codigo_pais || '1058')
          setPais(f.pais || 'Brasil')

          // Contato
          setTelefone(f.telefone ? formatarTelefone(f.telefone) : '')
          setCelular(f.celular ? formatarTelefone(f.celular) : '')
          setEmail(f.email || '')
          setEmailFinanceiro(f.email_financeiro || '')
          setSite(f.site || '')
          setContatoNome(f.contato_nome || '')
          setContatoCargo(f.contato_cargo || '')
          setContatoTelefone(f.contato_telefone ? formatarTelefone(f.contato_telefone) : '')

          // Comercial
          setPrazoEntregaDias(
            f.prazo_entrega_dias !== undefined && f.prazo_entrega_dias !== null
              ? String(f.prazo_entrega_dias)
              : '',
          )
          setCondicaoPagamentoId(f.condicao_pagamento_id || '')
          setCondicaoPagamentoPadrao(f.condicao_pagamento_padrao || '')
          setPedidoMinimo(
            f.pedido_minimo !== undefined && f.pedido_minimo !== null
              ? String(f.pedido_minimo)
              : '',
          )
          setRepresentanteNome(f.representante_nome || '')
          setRepresentanteTelefone(
            f.representante_telefone ? formatarTelefone(f.representante_telefone) : '',
          )
          setRepresentanteEmail(f.representante_email || '')

          // Dados bancários
          setBancoCodigo(f.banco_codigo || '')
          setBancoNome(f.banco_nome || '')
          setAgencia(f.agencia || '')
          setConta(f.conta || '')
          setTipoConta(f.tipo_conta || 'nenhum')
          setTitular(f.titular || '')
          setCpfCnpjTitular(
            f.cpf_cnpj_titular
              ? f.cpf_cnpj_titular.length > 11
                ? formatarCNPJ(f.cpf_cnpj_titular)
                : formatarCPF(f.cpf_cnpj_titular)
              : '',
          )
          setPixTipo(f.pix_tipo || 'nenhum')
          setPixChave(f.pix_chave || '')

          // Outros
          setObservacoes(f.observacoes || '')

          // Carregar notas de entrada do fornecedor
          setCarregandoNotas(true)
          listarNotasDoFornecedorComTotais(f.id, empresaAtiva?.id)
            .then(setHistoricoNotas)
            .catch((e) => console.warn('Erro ao carregar notas do fornecedor:', e))
            .finally(() => setCarregandoNotas(false))

          // Carregar resumo financeiro do fornecedor (últimos 12 meses) se usuário tiver permissão em financeiro_pagar
          if (podeVerFinanceiro) {
            setCarregandoFinanceiro(true)
            obterResumoFinanceiroFornecedor(f.id, empresaAtiva?.id)
              .then(setResumoFinanceiro)
              .catch((e) => console.warn('Erro ao carregar resumo financeiro do fornecedor:', e))
              .finally(() => setCarregandoFinanceiro(false))
          }

          // Inicial para rastrear dirty
          setDadosIniciais(
            JSON.stringify({
              razaoSocial: f.razao_social,
              cpfCnpj: f.cpf_cnpj,
              tipoPessoa: f.tipo_pessoa,
              ativo: f.ativo,
            }),
          )
        })
        .catch((err) => {
          toast({
            variant: 'destructive',
            title: 'Erro ao carregar fornecedor',
            description: err instanceof Error ? err.message : 'Falha ao buscar dados',
          })
          navigate('/cadastros/fornecedores')
        })
        .finally(() => setCarregando(false))
    } else {
      obterProximoCodigoFornecedor()
        .then((cod) => {
          setCodigo(cod)
          setDadosIniciais(
            JSON.stringify({
              razaoSocial: '',
              cpfCnpj: '',
              tipoPessoa: 'Jurídica',
              ativo: true,
            }),
          )
        })
        .catch(console.error)
    }
  }, [ehEdicao, id, navigate, toast])

  // Troca de tipo de pessoa
  const handleTrocaTipoPessoa = (novoTipo: TipoPessoaFornecedor) => {
    setTipoPessoa(novoTipo)
    setCpfCnpj('')
    setFornecedorInativoExistente(null)
    setErros((prev) => {
      const { cpf_cnpj, id_estrangeiro, ...rest } = prev
      return rest
    })

    if (novoTipo === 'Física') {
      setIndicadorIe('9') // Não contribuinte
      setCodigoPais('1058')
      setPais('Brasil')
      if (uf === 'EX') setUf('')
      if (municipio === 'EXTERIOR') setMunicipio('')
      if (codigoMunicipioIbge === '9999999') setCodigoMunicipioIbge('')
    } else if (novoTipo === 'Jurídica') {
      setIndicadorIe('1') // Contribuinte ICMS
      setCodigoPais('1058')
      setPais('Brasil')
      if (uf === 'EX') setUf('')
      if (municipio === 'EXTERIOR') setMunicipio('')
      if (codigoMunicipioIbge === '9999999') setCodigoMunicipioIbge('')
    } else if (novoTipo === 'Estrangeiro') {
      setIndicadorIe('9')
      setUf('EX')
      setMunicipio('EXTERIOR')
      setCodigoMunicipioIbge('9999999')
      if (codigoPais === '1058') {
        setCodigoPais('2496')
        setPais('Estados Unidos')
      }
    }
  }

  // Manipulação de documento CPF / CNPJ
  const handleDocChange = async (valor: string) => {
    let formatado = valor
    if (tipoPessoa === 'Física') {
      formatado = formatarCPF(valor)
    } else if (tipoPessoa === 'Jurídica') {
      formatado = formatarCNPJ(valor)
    }
    setCpfCnpj(formatado)
    setFornecedorInativoExistente(null)

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
      const existencia = await buscarFornecedorPorCpfCnpj(limpo, id)
      if (existencia.ativo) {
        setErros((prev) => ({
          ...prev,
          cpf_cnpj: `CPF já cadastrado para o fornecedor ativo "${existencia.ativo!.razao_social}" (Código ${existencia.ativo!.codigo}).`,
        }))
      } else if (existencia.inativo) {
        setFornecedorInativoExistente(existencia.inativo)
      }
    } else if (tipoPessoa === 'Jurídica' && limpo.length === 14) {
      if (!validarCNPJ(limpo)) {
        setErros((prev) => ({ ...prev, cpf_cnpj: 'CNPJ inválido.' }))
        return
      }
      const existencia = await buscarFornecedorPorCpfCnpj(limpo, id)
      if (existencia.ativo) {
        setErros((prev) => ({
          ...prev,
          cpf_cnpj: `CNPJ já cadastrado para o fornecedor ativo "${existencia.ativo!.razao_social}" (Código ${existencia.ativo!.codigo}).`,
        }))
      } else if (existencia.inativo) {
        setFornecedorInativoExistente(existencia.inativo)
      }
    }
  }

  // Reativar fornecedor inativo existente
  const handleReativarInativo = async () => {
    if (!fornecedorInativoExistente) return
    setReativando(true)
    try {
      const reativado = await ativarFornecedor(fornecedorInativoExistente.id)
      toast({
        title: 'Fornecedor reativado',
        description: `O fornecedor "${reativado.razao_social}" foi reativado com sucesso. Abrindo para edição.`,
      })
      navigate(`/cadastros/fornecedores/${reativado.id}/editar`)
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

      if (dados.razao_social) setRazaoSocial(dados.razao_social.slice(0, 60))
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

  // Consulta ViaCEP
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

  // Alternar seleção múltipla de tipos de fornecedor
  const toggleTipoFornecedor = (tipo: TipoFornecedor) => {
    setTiposFornecedor((prev) =>
      prev.includes(tipo) ? prev.filter((t) => t !== tipo) : [...prev, tipo],
    )
  }

  // Comparação para alterações não salvas
  const estadoAtualParaComparacao = JSON.stringify({
    razaoSocial,
    cpfCnpj: normalizarCpfCnpj(cpfCnpj),
    tipoPessoa,
    ativo,
  })
  const temAlteracoesNaoSalvas = dadosIniciais && dadosIniciais !== estadoAtualParaComparacao

  const handleTentarVoltar = () => {
    if (temAlteracoesNaoSalvas) {
      setAlertaSairAberto(true)
    } else {
      navigate('/cadastros/fornecedores')
    }
  }

  // Salvar
  const handleSalvar = async (e: React.FormEvent) => {
    e.preventDefault()

    const novoErros: Record<string, string> = {}
    const razaoLimpa = razaoSocial.trim()
    if (!razaoLimpa) {
      novoErros.razao_social = 'A razão social é obrigatória.'
    } else if (razaoLimpa.length > 60) {
      novoErros.razao_social = 'Máximo de 60 caracteres.'
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

    if (Object.keys(novoErros).length > 0) {
      setErros(novoErros)
      const primeiroCampo = Object.keys(novoErros)[0]
      if (
        ['razao_social', 'cpf_cnpj', 'id_estrangeiro', 'inscricao_estadual'].includes(primeiroCampo)
      ) {
        setAbaAtiva('dados')
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
      const dadosParaSalvar: Partial<Fornecedor> = {
        id: ehEdicao ? id : undefined,
        codigo: codigo ? Number(codigo) : undefined,
        tipo_pessoa: tipoPessoa,
        cpf_cnpj: docLimpo || undefined,
        id_estrangeiro: tipoPessoa === 'Estrangeiro' ? idEstrangeiro.trim() : undefined,
        razao_social: razaoLimpa,
        nome_fantasia: nomeFantasia.trim() || undefined,
        indicador_ie: indicadorIe,
        inscricao_estadual: indicadorIe !== '9' ? inscricaoEstadual.trim() || undefined : undefined,
        inscricao_municipal: inscricaoMunicipal.trim() || undefined,
        inscricao_suframa: inscricaoSuframa.trim() || undefined,
        crt_fornecedor: crtFornecedor !== 'nenhum' ? (crtFornecedor as CrtFornecedor) : undefined,
        tipo_fornecedor: tiposFornecedor.length > 0 ? tiposFornecedor : undefined,
        produtor_rural: produtorRural,
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

        // Contato
        telefone: telefone ? formatarTelefone(telefone) : undefined,
        celular: celular ? formatarTelefone(celular) : undefined,
        email: email.trim().toLowerCase() || undefined,
        email_financeiro: emailFinanceiro.trim().toLowerCase() || undefined,
        site: site.trim() || undefined,
        contato_nome: contatoNome.trim() || undefined,
        contato_cargo: contatoCargo.trim() || undefined,
        contato_telefone: contatoTelefone ? formatarTelefone(contatoTelefone) : undefined,

        // Comercial
        prazo_entrega_dias: prazoEntregaDias !== '' ? parseInt(prazoEntregaDias, 10) : undefined,
        condicao_pagamento_id: condicaoPagamentoId || undefined,
        condicao_pagamento_padrao: condicaoPagamentoPadrao.trim() || undefined,
        pedido_minimo: pedidoMinimo !== '' ? parseFloat(pedidoMinimo.replace(',', '.')) : undefined,
        representante_nome: representanteNome.trim() || undefined,
        representante_telefone: representanteTelefone
          ? formatarTelefone(representanteTelefone)
          : undefined,
        representante_email: representanteEmail.trim().toLowerCase() || undefined,

        // Bancário
        banco_codigo: bancoCodigo.trim() || undefined,
        banco_nome: bancoNome.trim() || undefined,
        agencia: agencia.trim() || undefined,
        conta: conta.trim() || undefined,
        tipo_conta: tipoConta !== 'nenhum' ? (tipoConta as TipoContaBancaria) : undefined,
        titular: titular.trim() || undefined,
        cpf_cnpj_titular: normalizarCpfCnpj(cpfCnpjTitular) || undefined,
        pix_tipo: pixTipo !== 'nenhum' ? (pixTipo as TipoChavePix) : undefined,
        pix_chave: pixChave.trim() || undefined,

        // Outros
        observacoes: observacoes.trim() || undefined,
      }

      const fornecedorSalvo = await salvarFornecedor(dadosParaSalvar)

      toast({
        title: ehEdicao ? 'Fornecedor atualizado' : 'Fornecedor cadastrado',
        description: `O fornecedor "${fornecedorSalvo.razao_social}" (Código ${fornecedorSalvo.codigo}) foi gravado com sucesso.`,
      })

      navigate('/cadastros/fornecedores')
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Falha ao salvar fornecedor',
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
        <p className="text-xs">Carregando dados do fornecedor...</p>
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
              <Truck className="h-6 w-6 text-blue-600" />
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                {ehEdicao ? `Editar Fornecedor #${codigo}` : 'Novo Fornecedor'}
              </h1>
              {codigo && (
                <Badge variant="outline" className="font-mono text-xs">
                  Cód. {codigo}
                </Badge>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Dados para entrada de notas, contas a pagar e SPED (registro 0150)
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
            form="form-fornecedor"
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
                Salvar Fornecedor
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Alerta de Fornecedor Inativo com mesmo CPF/CNPJ */}
      {fornecedorInativoExistente && (
        <Alert className="bg-blue-50 border-blue-200 text-blue-900 py-3">
          <AlertCircle className="h-4 w-4 text-blue-600" />
          <div className="space-y-1">
            <AlertTitle className="text-xs font-semibold">
              Fornecedor inativo com este documento
            </AlertTitle>
            <AlertDescription className="text-xs text-blue-800">
              Já existe um fornecedor inativo cadastrado com este documento:{' '}
              <strong>{fornecedorInativoExistente.razao_social}</strong> (Código{' '}
              {fornecedorInativoExistente.codigo}). Você pode reativá-lo para manter o histórico de
              compras e notas fiscais.
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
                Reativar este fornecedor agora
              </Button>
            </div>
          </div>
        </Alert>
      )}

      <form id="form-fornecedor" onSubmit={handleSalvar}>
        <Tabs value={abaAtiva} onValueChange={setAbaAtiva} className="space-y-4">
          <TabsList
            className={`grid ${ehEdicao ? 'grid-cols-4 sm:grid-cols-8' : 'grid-cols-3 sm:grid-cols-6'} h-auto p-1 bg-slate-100/80 border border-slate-200`}
          >
            <TabsTrigger value="dados" className="text-xs py-2">
              <Truck size={14} className="mr-1.5 hidden sm:inline" />
              Dados
            </TabsTrigger>
            <TabsTrigger value="endereco" className="text-xs py-2">
              <MapPin size={14} className="mr-1.5 hidden sm:inline" />
              Endereço
            </TabsTrigger>
            <TabsTrigger value="contato" className="text-xs py-2">
              <Phone size={14} className="mr-1.5 hidden sm:inline" />
              Contato
            </TabsTrigger>
            <TabsTrigger value="comercial" className="text-xs py-2">
              <Briefcase size={14} className="mr-1.5 hidden sm:inline" />
              Comercial
            </TabsTrigger>
            <TabsTrigger value="bancarios" className="text-xs py-2">
              <Landmark size={14} className="mr-1.5 hidden sm:inline" />
              Dados bancários
            </TabsTrigger>
            {ehEdicao && (
              <TabsTrigger value="notas" className="text-xs py-2">
                <Receipt size={14} className="mr-1.5 hidden sm:inline" />
                Notas {historicoNotas.totalGeralNotas > 0 && `(${historicoNotas.totalGeralNotas})`}
              </TabsTrigger>
            )}
            {ehEdicao && podeVerFinanceiro && (
              <TabsTrigger value="financeiro" className="text-xs py-2">
                <DollarSign size={14} className="mr-1.5 hidden sm:inline" />
                Financeiro{' '}
                {resumoFinanceiro.totaisGerais.quantidadeTotal > 0 &&
                  `(${resumoFinanceiro.totaisGerais.quantidadeTotal})`}
              </TabsTrigger>
            )}
            <TabsTrigger value="observacoes" className="text-xs py-2">
              <FileText size={14} className="mr-1.5 hidden sm:inline" />
              Observações
            </TabsTrigger>
          </TabsList>

          {/* ================= ABA 1: DADOS ================= */}
          <TabsContent value="dados">
            <Card className="border-slate-200 shadow-2xs">
              <CardContent className="p-5 space-y-5">
                {/* Tipo de Pessoa e Situação */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end pb-4 border-b border-slate-100">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-slate-700">Tipo de Pessoa *</Label>
                    <Select
                      value={tipoPessoa}
                      onValueChange={(val) => handleTrocaTipoPessoa(val as TipoPessoaFornecedor)}
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
                      id="fornecedor-ativo"
                      checked={ativo}
                      onCheckedChange={(checked) => setAtivo(Boolean(checked))}
                    />
                    <Label
                      htmlFor="fornecedor-ativo"
                      className="text-xs font-medium cursor-pointer"
                    >
                      Fornecedor Ativo
                    </Label>
                  </div>
                </div>

                {/* Documentos Principais */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  {tipoPessoa === 'Física' && (
                    <div className="space-y-1.5 sm:col-span-2">
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
                        Identificação Estrangeiro (ID Estrangeiro) *
                      </Label>
                      <Input
                        value={idEstrangeiro}
                        onChange={(e) => setIdEstrangeiro(e.target.value)}
                        placeholder="Passaporte, Tax ID ou código oficial no país de origem"
                        className={`h-9 text-xs ${erros.id_estrangeiro ? 'border-red-500' : ''}`}
                      />
                      {erros.id_estrangeiro && (
                        <p className="text-[11px] text-red-600">{erros.id_estrangeiro}</p>
                      )}
                    </div>
                  )}
                </div>

                {/* Razão Social */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-semibold text-slate-700">
                      {tipoPessoa === 'Jurídica' ? 'Razão Social *' : 'Nome Completo *'}
                    </Label>
                    <span className="text-[10px] text-slate-400">{razaoSocial.length}/60</span>
                  </div>
                  <Input
                    value={razaoSocial}
                    maxLength={60}
                    onChange={(e) => setRazaoSocial(e.target.value)}
                    placeholder={
                      tipoPessoa === 'Jurídica'
                        ? 'Razão Social oficial do fornecedor'
                        : 'Nome Completo do Fornecedor'
                    }
                    className={`h-9 text-xs ${erros.razao_social ? 'border-red-500' : ''}`}
                  />
                  {erros.razao_social && (
                    <p className="text-[11px] text-red-600">{erros.razao_social}</p>
                  )}
                </div>

                {/* Fiscal: IE, CRT, Tipo Fornecedor, Produtor Rural */}
                <div className="pt-3 border-t border-slate-100 space-y-4">
                  <h3 className="text-xs font-semibold text-slate-800 uppercase tracking-wider">
                    Enquadramento Fiscal e Tributário (Entrada de Notas e SPED 0150)
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                    {/* Indicador de IE */}
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold text-slate-700">
                        Indicador de IE *
                      </Label>
                      <Select
                        value={indicadorIe}
                        onValueChange={(val) => {
                          setIndicadorIe(val as IndicadorIeFornecedor)
                          if (val !== '1') {
                            setErros((prev) => {
                              const { inscricao_estadual, ...rest } = prev
                              return rest
                            })
                          }
                        }}
                      >
                        <SelectTrigger className="h-9 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">1 - Contribuinte ICMS</SelectItem>
                          <SelectItem value="2">2 - Contribuinte isento</SelectItem>
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
                        placeholder="Opcional (para NFS-e tomador)"
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
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 items-center">
                    {/* CRT Fornecedor */}
                    <div className="space-y-1.5 sm:col-span-2">
                      <Label className="text-xs font-semibold text-slate-700">
                        CRT do Fornecedor (Crédito de ICMS na Entrada)
                      </Label>
                      <Select value={crtFornecedor} onValueChange={(val) => setCrtFornecedor(val)}>
                        <SelectTrigger className="h-9 text-xs">
                          <SelectValue placeholder="Selecione o regime (CRT)" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="nenhum">Não informado</SelectItem>
                          <SelectItem value="1">
                            1 - Simples Nacional (crédito permitido conforme alíquota da nota)
                          </SelectItem>
                          <SelectItem value="2">
                            2 - Simples Nacional - excesso de sublimite de receita bruta
                          </SelectItem>
                          <SelectItem value="3">
                            3 - Regime Normal (Lucro Presumido / Real - tributação integral)
                          </SelectItem>
                          <SelectItem value="4">
                            4 - Simples Nacional - MEI (sem destaque de crédito)
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Produtor Rural */}
                    <div className="flex items-center space-x-2 pt-5">
                      <Checkbox
                        id="fornecedor-rural"
                        checked={produtorRural}
                        onCheckedChange={(checked) => setProdutorRural(Boolean(checked))}
                      />
                      <div className="grid gap-0.5 leading-none">
                        <Label
                          htmlFor="fornecedor-rural"
                          className="text-xs font-medium cursor-pointer"
                        >
                          Produtor Rural
                        </Label>
                        <p className="text-[10px] text-slate-500">
                          Emite Nota Fiscal Avulsa ou de Produtor
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Multiseleção Tipo de Fornecedor */}
                  <div className="space-y-2 pt-2">
                    <Label className="text-xs font-semibold text-slate-700">
                      Tipo(s) de Fornecedor (pode marcar mais de um)
                    </Label>
                    <div className="flex flex-wrap gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
                      {OPCOES_TIPO_FORNECEDOR.map((opcao) => {
                        const marcado = tiposFornecedor.includes(opcao)
                        return (
                          <label
                            key={opcao}
                            className="flex items-center space-x-2 text-xs text-slate-700 cursor-pointer select-none"
                          >
                            <Checkbox
                              checked={marcado}
                              onCheckedChange={() => toggleTipoFornecedor(opcao)}
                            />
                            <span>{opcao}</span>
                          </label>
                        )
                      })}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ================= ABA 2: ENDEREÇO ================= */}
          <TabsContent value="endereco">
            <Card className="border-slate-200 shadow-2xs">
              <CardContent className="p-5 space-y-4">
                {tipoPessoa === 'Estrangeiro' && (
                  <Alert className="bg-slate-50 border-slate-200 text-slate-800 py-2.5">
                    <Globe2 className="h-4 w-4 text-emerald-600" />
                    <AlertTitle className="text-xs font-semibold">
                      Fornecedor Estrangeiro
                    </AlertTitle>
                    <AlertDescription className="text-xs text-slate-600">
                      Conforme o padrão fiscal (SPED/NF-e), a UF é fixada em "EX", o município em
                      "EXTERIOR" e o código IBGE em 9999999. Escolha o país correspondente.
                    </AlertDescription>
                  </Alert>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                  {/* CEP */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-semibold text-slate-700">CEP</Label>
                      {buscandoCep && (
                        <span className="text-[10px] text-blue-600 flex items-center gap-1">
                          <Loader2 className="h-3 w-3 animate-spin" /> ViaCEP
                        </span>
                      )}
                    </div>
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
                  </div>

                  {/* Logradouro */}
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label className="text-xs font-semibold text-slate-700">Logradouro / Rua</Label>
                    <Input
                      value={logradouro}
                      onChange={(e) => setLogradouro(e.target.value)}
                      placeholder="Avenida, Rua, Travessa..."
                      className="h-9 text-xs"
                    />
                  </div>

                  {/* Número */}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-slate-700">Número</Label>
                    <Input
                      value={numero}
                      onChange={(e) => setNumero(e.target.value)}
                      placeholder="123 ou S/N"
                      className="h-9 text-xs"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                  {/* Complemento */}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-slate-700">Complemento</Label>
                    <Input
                      value={complemento}
                      onChange={(e) => setComplemento(e.target.value)}
                      placeholder="Sala, Galpão, Bloco"
                      className="h-9 text-xs"
                    />
                  </div>

                  {/* Bairro */}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-slate-700">Bairro</Label>
                    <Input
                      value={bairro}
                      onChange={(e) => setBairro(e.target.value)}
                      placeholder="Bairro ou distrito"
                      className="h-9 text-xs"
                    />
                  </div>

                  {/* Município */}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-slate-700">Município</Label>
                    <Input
                      value={municipio}
                      disabled={tipoPessoa === 'Estrangeiro'}
                      onChange={(e) => setMunicipio(e.target.value)}
                      placeholder="Cidade"
                      className="h-9 text-xs"
                    />
                  </div>

                  {/* UF */}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-slate-700">UF</Label>
                    {tipoPessoa === 'Estrangeiro' ? (
                      <Input value="EX" disabled className="h-9 text-xs bg-slate-50 font-mono" />
                    ) : (
                      <Select value={uf} onValueChange={(val) => setUf(val)}>
                        <SelectTrigger className="h-9 text-xs">
                          <SelectValue placeholder="UF" />
                        </SelectTrigger>
                        <SelectContent>
                          {UFS_BRASIL.map((u) => (
                            <SelectItem key={u} value={u}>
                              {u}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
                  {/* Código Município IBGE */}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-slate-700">
                      Código Município IBGE (7 dígitos)
                    </Label>
                    <Input
                      value={codigoMunicipioIbge}
                      disabled={tipoPessoa === 'Estrangeiro'}
                      onChange={(e) => setCodigoMunicipioIbge(e.target.value.replace(/\D/g, ''))}
                      placeholder="Ex: 3205309"
                      className="h-9 text-xs font-mono"
                    />
                  </div>

                  {/* Código do País */}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-slate-700">
                      Código do País (Bacen)
                    </Label>
                    <Input
                      value={codigoPais}
                      onChange={(e) => setCodigoPais(e.target.value)}
                      placeholder="1058"
                      className="h-9 text-xs font-mono"
                    />
                  </div>

                  {/* Nome do País */}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-slate-700">País</Label>
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
                          <SelectValue placeholder="Selecione o país" />
                        </SelectTrigger>
                        <SelectContent>
                          {PAISES_COMUNS.map((p) => (
                            <SelectItem key={p.codigo} value={p.codigo}>
                              {p.nome} ({p.codigo})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        value={pais}
                        onChange={(e) => setPais(e.target.value)}
                        placeholder="Brasil"
                        className="h-9 text-xs"
                      />
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ================= ABA 3: CONTATO ================= */}
          <TabsContent value="contato">
            <Card className="border-slate-200 shadow-2xs">
              <CardContent className="p-5 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {/* Telefone */}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-slate-700">Telefone Fixo</Label>
                    <Input
                      value={telefone}
                      onChange={(e) => setTelefone(formatarTelefone(e.target.value))}
                      placeholder="(00) 0000-0000"
                      className="h-9 text-xs"
                    />
                  </div>

                  {/* Celular */}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-slate-700">
                      Celular / WhatsApp
                    </Label>
                    <Input
                      value={celular}
                      onChange={(e) => setCelular(formatarTelefone(e.target.value))}
                      placeholder="(00) 00000-0000"
                      className="h-9 text-xs"
                    />
                  </div>

                  {/* Site */}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-slate-700">Site / Portal</Label>
                    <Input
                      value={site}
                      onChange={(e) => setSite(e.target.value)}
                      placeholder="https://..."
                      className="h-9 text-xs"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* E-mail principal */}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-slate-700">E-mail Principal</Label>
                    <Input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="contato@fornecedor.com.br"
                      className="h-9 text-xs"
                    />
                  </div>

                  {/* E-mail financeiro */}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-slate-700">
                      E-mail Financeiro / Cobrança
                    </Label>
                    <Input
                      type="email"
                      value={emailFinanceiro}
                      onChange={(e) => setEmailFinanceiro(e.target.value)}
                      placeholder="financeiro@fornecedor.com.br"
                      className="h-9 text-xs"
                    />
                  </div>
                </div>

                {/* Contato interno */}
                <div className="pt-3 border-t border-slate-100">
                  <h3 className="text-xs font-semibold text-slate-800 uppercase tracking-wider mb-3">
                    Pessoa de Contato no Fornecedor
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium text-slate-700">Nome do Contato</Label>
                      <Input
                        value={contatoNome}
                        onChange={(e) => setContatoNome(e.target.value)}
                        placeholder="Ex: Carlos Oliveira"
                        className="h-9 text-xs"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium text-slate-700">Cargo / Função</Label>
                      <Input
                        value={contatoCargo}
                        onChange={(e) => setContatoCargo(e.target.value)}
                        placeholder="Ex: Gerente de Contas"
                        className="h-9 text-xs"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium text-slate-700">Telefone Direto</Label>
                      <Input
                        value={contatoTelefone}
                        onChange={(e) => setContatoTelefone(formatarTelefone(e.target.value))}
                        placeholder="(00) 00000-0000"
                        className="h-9 text-xs"
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ================= ABA 4: COMERCIAL ================= */}
          <TabsContent value="comercial">
            <Card className="border-slate-200 shadow-2xs">
              <CardContent className="p-5 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {/* Prazo de entrega */}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-slate-700">
                      Prazo de Entrega (dias)
                    </Label>
                    <Input
                      type="number"
                      min="0"
                      value={prazoEntregaDias}
                      onChange={(e) => setPrazoEntregaDias(e.target.value)}
                      placeholder="Ex: 5"
                      className="h-9 text-xs"
                    />
                  </div>

                  {/* Pedido mínimo */}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-slate-700">
                      Pedido Mínimo (R$)
                    </Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={pedidoMinimo}
                      onChange={(e) => setPedidoMinimo(e.target.value)}
                      placeholder="0,00"
                      className="h-9 text-xs font-mono"
                    />
                  </div>

                  {/* Condição de pagamento padrão (Select com busca e fallback texto antigo) */}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-slate-700">
                      Condição de Pagamento Padrão
                    </Label>
                    <SelectCondicaoPagamento
                      value={condicaoPagamentoId}
                      onChange={(id) => setCondicaoPagamentoId(id)}
                      uso="Compras"
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
                </div>

                {/* Representante / Vendedor Externo */}
                <div className="pt-3 border-t border-slate-100">
                  <h3 className="text-xs font-semibold text-slate-800 uppercase tracking-wider mb-3">
                    Representante Comercial / Vendedor do Fornecedor
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium text-slate-700">
                        Nome do Representante
                      </Label>
                      <Input
                        value={representanteNome}
                        onChange={(e) => setRepresentanteNome(e.target.value)}
                        placeholder="Ex: Marcos Representações"
                        className="h-9 text-xs"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium text-slate-700">
                        Telefone do Representante
                      </Label>
                      <Input
                        value={representanteTelefone}
                        onChange={(e) => setRepresentanteTelefone(formatarTelefone(e.target.value))}
                        placeholder="(00) 00000-0000"
                        className="h-9 text-xs"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium text-slate-700">
                        E-mail do Representante
                      </Label>
                      <Input
                        type="email"
                        value={representanteEmail}
                        onChange={(e) => setRepresentanteEmail(e.target.value)}
                        placeholder="representante@email.com"
                        className="h-9 text-xs"
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ================= ABA 5: DADOS BANCÁRIOS ================= */}
          <TabsContent value="bancarios">
            <Card className="border-slate-200 shadow-2xs">
              <CardContent className="p-5 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {/* Banco Código */}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-slate-700">
                      Código do Banco (3 dígitos)
                    </Label>
                    <Input
                      maxLength={3}
                      value={bancoCodigo}
                      onChange={(e) => setBancoCodigo(e.target.value.replace(/\D/g, ''))}
                      placeholder="Ex: 001, 237, 341"
                      className="h-9 text-xs font-mono"
                    />
                  </div>

                  {/* Nome do Banco */}
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label className="text-xs font-semibold text-slate-700">Nome do Banco</Label>
                    <Input
                      value={bancoNome}
                      onChange={(e) => setBancoNome(e.target.value)}
                      placeholder="Ex: Banco do Brasil, Bradesco, Itaú"
                      className="h-9 text-xs"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {/* Agência */}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-slate-700">Agência</Label>
                    <Input
                      value={agencia}
                      onChange={(e) => setAgencia(e.target.value)}
                      placeholder="Ex: 1234-5"
                      className="h-9 text-xs font-mono"
                    />
                  </div>

                  {/* Conta */}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-slate-700">Conta</Label>
                    <Input
                      value={conta}
                      onChange={(e) => setConta(e.target.value)}
                      placeholder="Ex: 98765-4"
                      className="h-9 text-xs font-mono"
                    />
                  </div>

                  {/* Tipo de Conta */}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-slate-700">Tipo de Conta</Label>
                    <Select value={tipoConta} onValueChange={(val) => setTipoConta(val)}>
                      <SelectTrigger className="h-9 text-xs">
                        <SelectValue placeholder="Selecione o tipo" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="nenhum">Não informado</SelectItem>
                        <SelectItem value="Corrente">Corrente</SelectItem>
                        <SelectItem value="Poupança">Poupança</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Titular */}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-slate-700">
                      Titular da Conta Bancária
                    </Label>
                    <Input
                      value={titular}
                      onChange={(e) => setTitular(e.target.value)}
                      placeholder="Nome ou Razão do Titular"
                      className="h-9 text-xs"
                    />
                  </div>

                  {/* CPF/CNPJ Titular */}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-slate-700">
                      CPF / CNPJ do Titular
                    </Label>
                    <Input
                      value={cpfCnpjTitular}
                      onChange={(e) => {
                        const limpo = e.target.value.replace(/[^a-zA-Z0-9]/g, '')
                        if (limpo.length <= 11) {
                          setCpfCnpjTitular(formatarCPF(e.target.value))
                        } else {
                          setCpfCnpjTitular(formatarCNPJ(e.target.value))
                        }
                      }}
                      placeholder="Documento do titular da conta"
                      className="h-9 text-xs font-mono"
                    />
                  </div>
                </div>

                {/* Chave PIX */}
                <div className="pt-3 border-t border-slate-100">
                  <h3 className="text-xs font-semibold text-slate-800 uppercase tracking-wider mb-3">
                    Pagamento via PIX
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium text-slate-700">
                        Tipo de Chave PIX
                      </Label>
                      <Select value={pixTipo} onValueChange={(val) => setPixTipo(val)}>
                        <SelectTrigger className="h-9 text-xs">
                          <SelectValue placeholder="Tipo de Chave" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="nenhum">Nenhum</SelectItem>
                          <SelectItem value="CPF/CNPJ">CPF / CNPJ</SelectItem>
                          <SelectItem value="E-mail">E-mail</SelectItem>
                          <SelectItem value="Telefone">Telefone</SelectItem>
                          <SelectItem value="Chave aleatória">Chave aleatória</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1.5 sm:col-span-2">
                      <Label className="text-xs font-medium text-slate-700">Chave PIX</Label>
                      <Input
                        value={pixChave}
                        onChange={(e) => setPixChave(e.target.value)}
                        placeholder="Informe a chave PIX para transferências"
                        className="h-9 text-xs font-mono"
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ================= ABA: NOTAS DE ENTRADA ================= */}
          {ehEdicao && (
            <TabsContent value="notas">
              <Card className="border-slate-200 shadow-2xs">
                <CardContent className="p-5 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
                    <div>
                      <h3 className="font-semibold text-slate-900 text-sm flex items-center gap-2">
                        <Receipt className="h-4 w-4 text-blue-600" />
                        Notas Fiscais de Entrada do Fornecedor
                      </h3>
                      <p className="text-slate-500 text-[11px] mt-0.5">
                        Histórico completo de notas de entrada emitidas por este fornecedor com
                        consolidação por ano.
                      </p>
                    </div>

                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        if (id) {
                          setCarregandoNotas(true)
                          listarNotasDoFornecedorComTotais(id, empresaAtiva?.id)
                            .then(setHistoricoNotas)
                            .finally(() => setCarregandoNotas(false))
                        }
                      }}
                      className="h-7 text-xs text-blue-600"
                    >
                      <RotateCcw
                        className={`h-3.5 w-3.5 mr-1 ${carregandoNotas ? 'animate-spin' : ''}`}
                      />
                      Atualizar
                    </Button>
                  </div>

                  {carregandoNotas ? (
                    <div className="py-8 text-center text-slate-400">
                      <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2 text-blue-600" />
                      <p className="text-xs">Carregando notas do fornecedor...</p>
                    </div>
                  ) : historicoNotas.notas.length === 0 ? (
                    <div className="py-8 text-center text-slate-400 border border-dashed border-slate-200 rounded-lg">
                      <Receipt className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                      <p className="font-medium text-slate-600">Nenhuma nota fiscal registrada</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        As notas fiscais deste fornecedor aparecerão aqui quando forem importadas ou
                        digitadas no módulo de Compras.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {/* Totais por Ano */}
                      <div>
                        <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
                          Totais Anuais de Compras
                        </h4>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                          {historicoNotas.totaisPorAno.map((ta) => (
                            <div
                              key={ta.ano}
                              className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex flex-col justify-between"
                            >
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-bold text-slate-800">{ta.ano}</span>
                                <Badge variant="secondary" className="text-[10px]">
                                  {ta.quantidadeNotas} {ta.quantidadeNotas === 1 ? 'nota' : 'notas'}
                                </Badge>
                              </div>
                              <div className="text-sm font-bold text-blue-700 font-mono mt-1">
                                R${' '}
                                {ta.valorTotal.toLocaleString('pt-BR', {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })}
                              </div>
                            </div>
                          ))}

                          <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg flex flex-col justify-between">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-blue-900">Total Geral</span>
                              <Badge className="bg-blue-600 text-[10px]">
                                {historicoNotas.totalGeralNotas} notas
                              </Badge>
                            </div>
                            <div className="text-sm font-bold text-blue-900 font-mono mt-1">
                              R${' '}
                              {historicoNotas.valorGeralTotal.toLocaleString('pt-BR', {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Lista de Notas */}
                      <div className="border border-slate-200 rounded-lg overflow-x-auto">
                        <table className="w-full text-left text-xs border-collapse">
                          <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 uppercase text-[10px] font-semibold">
                            <tr>
                              <th className="p-2.5">Data Entrada</th>
                              <th className="p-2.5">Data Emissão</th>
                              <th className="p-2.5">Nota Fiscal</th>
                              <th className="p-2.5">Tipo</th>
                              <th className="p-2.5">Status</th>
                              <th className="p-2.5 text-right">Valor Total</th>
                              <th className="p-2.5 text-center">Ações</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {historicoNotas.notas.map((n) => (
                              <tr key={n.id} className="hover:bg-slate-50">
                                <td className="p-2.5 font-mono text-slate-700 whitespace-nowrap">
                                  {n.data_entrada
                                    ? new Date(n.data_entrada).toLocaleDateString('pt-BR')
                                    : '—'}
                                </td>
                                <td className="p-2.5 font-mono text-slate-600 whitespace-nowrap">
                                  {n.data_emissao
                                    ? new Date(n.data_emissao).toLocaleDateString('pt-BR')
                                    : '—'}
                                </td>
                                <td className="p-2.5 whitespace-nowrap">
                                  <span className="font-mono font-semibold text-slate-800">
                                    Nº {n.numero}
                                  </span>
                                  <span className="text-[10px] text-slate-400 font-mono ml-1">
                                    (Mod {n.modelo || '55'}
                                    {n.serie ? `/${n.serie}` : ''})
                                  </span>
                                </td>
                                <td className="p-2.5 whitespace-nowrap text-slate-600">
                                  {n.tipo_entrada || 'Normal'}
                                </td>
                                <td className="p-2.5 whitespace-nowrap">
                                  <Badge
                                    variant={
                                      n.status === 'Lançada'
                                        ? 'default'
                                        : n.status === 'Cancelada'
                                          ? 'destructive'
                                          : 'secondary'
                                    }
                                    className="text-[10px]"
                                  >
                                    {n.status}
                                  </Badge>
                                </td>
                                <td className="p-2.5 text-right font-mono font-bold text-slate-900 whitespace-nowrap">
                                  R${' '}
                                  {n.valor_total.toLocaleString('pt-BR', {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                  })}
                                </td>
                                <td className="p-2.5 text-center whitespace-nowrap">
                                  <Button
                                    asChild
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 text-[11px] text-blue-600 hover:text-blue-800 p-1"
                                  >
                                    <Link to={`/compras/notas-entrada/${n.id}/conferencia`}>
                                      Ver Nota
                                    </Link>
                                  </Button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          )}

          {/* ================= ABA: FINANCEIRO (CONTAS A PAGAR) ================= */}
          {ehEdicao && podeVerFinanceiro && (
            <TabsContent value="financeiro">
              <Card className="border-slate-200 shadow-2xs">
                <CardContent className="p-5 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
                    <div>
                      <h3 className="font-semibold text-slate-900 text-sm flex items-center gap-2">
                        <DollarSign className="h-4 w-4 text-emerald-600" />
                        Títulos a Pagar do Fornecedor (Últimos 12 Meses)
                      </h3>
                      <p className="text-slate-500 text-[11px] mt-0.5">
                        Consolidação de títulos em aberto, vencidos e liquidados nos últimos 12
                        meses.
                      </p>
                    </div>

                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        if (id) {
                          setCarregandoFinanceiro(true)
                          obterResumoFinanceiroFornecedor(id, empresaAtiva?.id)
                            .then(setResumoFinanceiro)
                            .finally(() => setCarregandoFinanceiro(false))
                        }
                      }}
                      className="h-7 text-xs text-blue-600"
                    >
                      <RotateCcw
                        className={`h-3.5 w-3.5 mr-1 ${carregandoFinanceiro ? 'animate-spin' : ''}`}
                      />
                      Atualizar
                    </Button>
                  </div>

                  {carregandoFinanceiro ? (
                    <div className="py-8 text-center text-slate-400">
                      <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2 text-blue-600" />
                      <p className="text-xs">Carregando dados financeiros...</p>
                    </div>
                  ) : resumoFinanceiro.totaisGerais.quantidadeTotal === 0 ? (
                    <div className="py-8 text-center text-slate-400 border border-dashed border-slate-200 rounded-lg">
                      <DollarSign className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                      <p className="font-medium text-slate-600">
                        Nenhum título a pagar nos últimos 12 meses
                      </p>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Os títulos manuais ou gerados pelas notas de entrada aparecerão consolidados
                        aqui.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {/* Cartões de Totais: Abertos, Vencidos, Pagos e Saldo */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-lg">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-blue-900">Em Aberto</span>
                            <Badge variant="outline" className="text-[10px] bg-white text-blue-700">
                              {resumoFinanceiro.abertos.quantidade} títulos
                            </Badge>
                          </div>
                          <div className="text-sm font-bold text-blue-700 font-mono mt-1">
                            R${' '}
                            {resumoFinanceiro.abertos.valorTotal.toLocaleString('pt-BR', {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </div>
                        </div>

                        <div className="p-3 bg-red-50/70 border border-red-200 rounded-lg">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-red-900">Vencidos</span>
                            <Badge variant="outline" className="text-[10px] bg-white text-red-700">
                              {resumoFinanceiro.vencidos.quantidade} títulos
                            </Badge>
                          </div>
                          <div className="text-sm font-bold text-red-700 font-mono mt-1">
                            R${' '}
                            {resumoFinanceiro.vencidos.valorTotal.toLocaleString('pt-BR', {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </div>
                        </div>

                        <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-lg">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-emerald-900">Pagos</span>
                            <Badge
                              variant="outline"
                              className="text-[10px] bg-white text-emerald-700"
                            >
                              {resumoFinanceiro.pagos.quantidade} títulos
                            </Badge>
                          </div>
                          <div className="text-sm font-bold text-emerald-700 font-mono mt-1">
                            R${' '}
                            {resumoFinanceiro.pagos.valorTotal.toLocaleString('pt-BR', {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </div>
                        </div>

                        <div className="p-3 bg-slate-100 border border-slate-200 rounded-lg">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-slate-800">
                              Saldo Devedor Total
                            </span>
                            <Badge variant="secondary" className="text-[10px]">
                              {resumoFinanceiro.abertos.quantidade +
                                resumoFinanceiro.vencidos.quantidade}{' '}
                              abertos
                            </Badge>
                          </div>
                          <div className="text-sm font-bold text-slate-900 font-mono mt-1">
                            R${' '}
                            {resumoFinanceiro.totaisGerais.saldoTotal.toLocaleString('pt-BR', {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </div>
                        </div>
                      </div>

                      {/* Lista resumida dos títulos recentes */}
                      <div className="border border-slate-200 rounded-lg overflow-x-auto">
                        <table className="w-full text-left text-xs border-collapse">
                          <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 uppercase text-[10px] font-semibold">
                            <tr>
                              <th className="p-2.5">Vencimento</th>
                              <th className="p-2.5">Documento</th>
                              <th className="p-2.5">Parcela</th>
                              <th className="p-2.5">Descrição</th>
                              <th className="p-2.5 text-right">Original</th>
                              <th className="p-2.5 text-right">Pago</th>
                              <th className="p-2.5 text-right">Saldo</th>
                              <th className="p-2.5 text-center">Situação</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {[
                              ...resumoFinanceiro.vencidos.titulos,
                              ...resumoFinanceiro.abertos.titulos,
                              ...resumoFinanceiro.pagos.titulos,
                            ]
                              .slice(0, 50)
                              .map((t) => (
                                <tr key={t.id} className="hover:bg-slate-50">
                                  <td className="p-2.5 font-mono text-slate-700 whitespace-nowrap">
                                    {new Date(t.data_vencimento + 'T00:00:00').toLocaleDateString(
                                      'pt-BR',
                                    )}
                                  </td>
                                  <td className="p-2.5 font-mono font-semibold text-slate-800 whitespace-nowrap">
                                    {t.numero_documento}
                                  </td>
                                  <td className="p-2.5 font-mono text-slate-600 whitespace-nowrap">
                                    {t.parcela}
                                  </td>
                                  <td className="p-2.5 text-slate-700 max-w-[200px] truncate">
                                    {t.descricao}
                                  </td>
                                  <td className="p-2.5 text-right font-mono text-slate-700 whitespace-nowrap">
                                    R$ {t.valor_original.toFixed(2)}
                                  </td>
                                  <td className="p-2.5 text-right font-mono text-emerald-700 whitespace-nowrap">
                                    R$ {t.valor_pago.toFixed(2)}
                                  </td>
                                  <td className="p-2.5 text-right font-mono font-bold text-slate-900 whitespace-nowrap">
                                    R$ {t.saldo.toFixed(2)}
                                  </td>
                                  <td className="p-2.5 text-center whitespace-nowrap">
                                    <Badge
                                      variant="outline"
                                      className={
                                        t.status === 'Pago'
                                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px]'
                                          : t.data_vencimento <
                                              new Date().toISOString().slice(0, 10)
                                            ? 'bg-red-50 text-red-700 border-red-200 text-[10px]'
                                            : 'bg-blue-50 text-blue-700 border-blue-200 text-[10px]'
                                      }
                                    >
                                      {t.status === 'Em aberto' &&
                                      t.data_vencimento < new Date().toISOString().slice(0, 10)
                                        ? 'Vencido'
                                        : t.status}
                                    </Badge>
                                  </td>
                                </tr>
                              ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          )}

          {/* ================= ABA 6: OBSERVAÇÕES ================= */}
          <TabsContent value="observacoes">
            <Card className="border-slate-200 shadow-2xs">
              <CardContent className="p-5 space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-slate-700">
                    Anotações e Observações Internas
                  </Label>
                  <Textarea
                    rows={8}
                    value={observacoes}
                    onChange={(e) => setObservacoes(e.target.value)}
                    placeholder="Observações de compras, histórico de negociação, regras específicas do fornecedor..."
                    className="text-xs resize-y"
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </form>

      {/* Alerta de confirmação para sair sem salvar */}
      <AlertDialog open={alertaSairAberto} onOpenChange={setAlertaSairAberto}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-sm font-bold text-slate-900">
              Alterações não salvas
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-slate-500">
              Você realizou alterações no cadastro deste fornecedor que ainda não foram salvas. Se
              sair agora, as modificações serão descartadas. Deseja realmente sair?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="text-xs">Continuar editando</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => navigate('/cadastros/fornecedores')}
              className="text-xs bg-red-600 hover:bg-red-700 text-white"
            >
              Descartar e Sair
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

export default FornecedorForm
