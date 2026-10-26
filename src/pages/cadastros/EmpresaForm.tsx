import React, { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Building2,
  Save,
  ArrowLeft,
  Search,
  Copy,
  AlertTriangle,
  Upload,
  CheckCircle2,
  Info,
} from 'lucide-react'
import {
  Empresa,
  EmpresaTipo,
  RegimeApuracao,
  RegimePisCofins,
  PerfilSped,
  obterEmpresaPorId,
  obterMatriz,
  criarEmpresa,
  atualizarEmpresa,
  obterUrlLogo,
} from '@/services/empresas'
import { useEmpresaAtiva } from '@/contexts/EmpresaContext'
import {
  validarCNPJ,
  validarCPF,
  validarInscricaoEstadual,
  extrairRaizCNPJ,
  formatarCNPJ,
  formatarCPF,
  formatarCEP,
  formatarTelefone,
  buscarViaCep,
  buscarBrasilApiCnpj,
} from '@/lib/validacoes'
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useToast } from '@/hooks/use-toast'

export const EmpresaForm: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const isEdicao = Boolean(id)
  const navigate = useNavigate()
  const { toast } = useToast()
  const { recarregarEmpresas } = useEmpresaAtiva()

  const [abaAtiva, setAbaAtiva] = useState('identificacao')
  const [carregando, setCarregando] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [consultandoCnpj, setConsultandoCnpj] = useState(false)
  const [consultandoCep, setConsultandoCep] = useState(false)
  const [consultandoCepContador, setConsultandoCepContador] = useState(false)

  // Matriz existente no banco (para filiais)
  const [matrizExistente, setMatrizExistente] = useState<Empresa | null>(null)

  // Logo
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)

  // Aviso de alterações não salvas
  const [foiModificado, setFoiModificado] = useState(false)

  // Diálogo de confirmação de CNPJ com raiz diferente para filial
  const [dialogRaizAberta, setDialogRaizAberta] = useState(false)

  // Estado do formulário
  const [formData, setFormData] = useState<Partial<Empresa>>({
    ativo: true,
    tipo: 'Matriz',
    codigo: undefined,
    razao_social: '',
    nome_fantasia: '',
    cnpj: '',
    inscricao_estadual: '',
    inscricao_estadual_st: '',
    inscricao_municipal: '',
    cnae_principal: '',
    cnaes_secundarios: [],
    data_abertura: '',
    // Regime
    crt: 1,
    regime_apuracao: 'Simples Nacional',
    regime_pis_cofins: undefined,
    aliquota_credito_simples: undefined,
    contribuinte_ipi: false,
    indicador_atividade_sped: 1,
    perfil_sped: 'B',
    obrigado_efd_icms_ipi: false,
    permite_estoque_negativo: false,
    // Endereço
    cep: '',
    logradouro: '',
    numero: '',
    complemento: '',
    bairro: '',
    municipio: '',
    codigo_municipio_ibge: '',
    uf: '',
    codigo_pais: '1058',
    pais: 'Brasil',
    // Contato
    telefone: '',
    celular: '',
    email: '',
    email_fiscal: '',
    site: '',
    // Responsável legal
    responsavel_nome: '',
    responsavel_cpf: '',
    responsavel_cargo: '',
    // Contabilidade
    contador_nome: '',
    contador_cpf: '',
    contador_crc: '',
    contador_cnpj_escritorio: '',
    contador_cep: '',
    contador_logradouro: '',
    contador_numero: '',
    contador_complemento: '',
    contador_bairro: '',
    contador_codigo_municipio_ibge: '',
    contador_telefone: '',
    contador_email: '',
  })

  // Erros de validação nos campos
  const [erros, setErros] = useState<Record<string, string>>({})

  // Carregar dados iniciais (edição ou novo)
  useEffect(() => {
    async function init() {
      setCarregando(true)
      try {
        const matriz = await obterMatriz()
        setMatrizExistente(matriz)

        if (isEdicao && id) {
          const emp = await obterEmpresaPorId(id)
          setFormData({
            ...emp,
            cnaes_secundarios: Array.isArray(emp.cnaes_secundarios) ? emp.cnaes_secundarios : [],
          })
          if (emp.logo) {
            setLogoPreview(obterUrlLogo(emp))
          }
        } else {
          // Novo registro: se já existir matriz, sugere "Filial" por padrão (código gerado no backend ao salvar)
          if (matriz) {
            setFormData((prev) => ({
              ...prev,
              tipo: 'Filial',
              matriz_id: matriz.id,
              codigo: undefined,
              crt: matriz.crt || 1,
              regime_apuracao: matriz.regime_apuracao || 'Simples Nacional',
              obrigado_efd_icms_ipi: matriz.crt === 3,
            }))
          } else {
            setFormData((prev) => ({
              ...prev,
              tipo: 'Matriz',
              codigo: undefined,
            }))
          }
        }
      } catch (err) {
        console.error(err)
        toast({
          variant: 'destructive',
          title: 'Erro ao carregar dados da empresa',
          description: 'Não foi possível buscar as informações no banco.',
        })
      } finally {
        setCarregando(false)
      }
    }
    init()
  }, [id, isEdicao, toast])

  // Ajuste automático de campos condicionados ao CRT
  const handleCrtChange = (novoCrt: number) => {
    setFoiModificado(true)
    let apuracaoPadrao: RegimeApuracao = 'Simples Nacional'
    if (novoCrt === 3) apuracaoPadrao = 'Lucro Presumido'
    if (novoCrt === 4) apuracaoPadrao = 'MEI'

    setFormData((prev) => ({
      ...prev,
      crt: novoCrt,
      regime_apuracao: apuracaoPadrao,
      // Se crt != 3, limpa regime_pis_cofins
      regime_pis_cofins: novoCrt === 3 ? prev.regime_pis_cofins || 'Não cumulativo' : undefined,
      // Se crt != 1 e != 2, limpa aliquota_credito_simples
      aliquota_credito_simples:
        novoCrt === 1 || novoCrt === 2 ? prev.aliquota_credito_simples : undefined,
      // Padrão: sim quando crt = 3, não quando crt = 1 ou 4
      obrigado_efd_icms_ipi: novoCrt === 3,
    }))
  }

  const setCampo = (campo: keyof Empresa, valor: unknown) => {
    setFoiModificado(true)
    setFormData((prev) => ({ ...prev, [campo]: valor }))
    if (erros[campo]) {
      setErros((prev) => {
        const novo = { ...prev }
        delete novo[campo]
        return novo
      })
    }
  }

  // Manipular CEP empresa com busca automática no ViaCEP
  const handleCepChange = async (cepInformado: string) => {
    const formatado = formatarCEP(cepInformado)
    setCampo('cep', formatado)

    const apenasDigitos = cepInformado.replace(/\D/g, '')
    if (apenasDigitos.length === 8) {
      setConsultandoCep(true)
      const dados = await buscarViaCep(apenasDigitos)
      setConsultandoCep(false)
      if (dados && !dados.erro) {
        setFormData((prev) => ({
          ...prev,
          cep: formatado,
          logradouro: dados.logradouro || prev.logradouro,
          bairro: dados.bairro || prev.bairro,
          municipio: dados.localidade || prev.municipio,
          uf: dados.uf || prev.uf,
          codigo_municipio_ibge: dados.ibge || prev.codigo_municipio_ibge,
        }))
        toast({
          title: 'Endereço localizado via CEP',
          description: `${dados.logradouro}, ${dados.bairro} - ${dados.localidade}/${dados.uf}`,
        })
      }
    }
  }

  // Manipular CEP contador com busca automática
  const handleCepContadorChange = async (cepInformado: string) => {
    const formatado = formatarCEP(cepInformado)
    setCampo('contador_cep', formatado)

    const apenasDigitos = cepInformado.replace(/\D/g, '')
    if (apenasDigitos.length === 8) {
      setConsultandoCepContador(true)
      const dados = await buscarViaCep(apenasDigitos)
      setConsultandoCepContador(false)
      if (dados && !dados.erro) {
        setFormData((prev) => ({
          ...prev,
          contador_cep: formatado,
          contador_logradouro: dados.logradouro || prev.contador_logradouro,
          contador_bairro: dados.bairro || prev.contador_bairro,
          contador_codigo_municipio_ibge: dados.ibge || prev.contador_codigo_municipio_ibge,
        }))
      }
    }
  }

  // Consulta de CNPJ na BrasilAPI (quando numérico)
  const handleConsultarCnpj = async () => {
    const cnpjAtual = formData.cnpj || ''
    const apenasDigitos = cnpjAtual.replace(/\D/g, '')

    if (apenasDigitos.length !== 14) {
      toast({
        variant: 'destructive',
        title: 'CNPJ numérico necessário',
        description:
          'A consulta na BrasilAPI funciona para CNPJ de 14 dígitos numéricos. CNPJs alfanuméricos devem ser preenchidos manualmente.',
      })
      return
    }

    try {
      setConsultandoCnpj(true)
      const dados = await buscarBrasilApiCnpj(apenasDigitos)
      if (!dados) {
        toast({
          variant: 'destructive',
          title: 'CNPJ não encontrado',
          description: 'Não foi possível consultar os dados desse CNPJ na BrasilAPI.',
        })
        return
      }

      setFormData((prev) => {
        const novosCnaes: string[] = []
        if (dados.cnaes_secundarios && Array.isArray(dados.cnaes_secundarios)) {
          dados.cnaes_secundarios.forEach((c) => {
            if (c.texto) novosCnaes.push(`${c.codigo} - ${c.texto}`)
          })
        }

        return {
          ...prev,
          razao_social: (dados.razao_social || prev.razao_social || '').slice(0, 60),
          nome_fantasia: (dados.nome_fantasia || prev.nome_fantasia || '').slice(0, 60),
          cnae_principal: dados.cnae_fiscal
            ? String(dados.cnae_fiscal).padStart(7, '0')
            : prev.cnae_principal,
          cnaes_secundarios: novosCnaes.length > 0 ? novosCnaes : prev.cnaes_secundarios,
          data_abertura: dados.data_inicio_atividade || prev.data_abertura,
          cep: dados.cep ? formatarCEP(dados.cep) : prev.cep,
          logradouro: dados.logradouro || prev.logradouro,
          numero: dados.numero || prev.numero,
          complemento: dados.complemento || prev.complemento,
          bairro: dados.bairro || prev.bairro,
          municipio: dados.municipio || prev.municipio,
          uf: dados.uf || prev.uf,
          codigo_municipio_ibge: dados.codigo_municipio_ibge
            ? String(dados.codigo_municipio_ibge)
            : prev.codigo_municipio_ibge,
          telefone: dados.ddd_telefone_1 ? formatarTelefone(dados.ddd_telefone_1) : prev.telefone,
          email: dados.email || prev.email,
        }
      })

      setFoiModificado(true)
      toast({
        title: 'Dados do CNPJ preenchidos',
        description: 'Razão social, nome fantasia, endereço e CNAE foram importados.',
      })
    } catch (err) {
      console.error(err)
      toast({
        variant: 'destructive',
        title: 'Erro na consulta do CNPJ',
        description: 'Falha ao conectar com o serviço da BrasilAPI.',
      })
    } finally {
      setConsultandoCnpj(false)
    }
  }

  // Copiar dados da Matriz para Filial (Regime, Contato, Contabilidade)
  // CNPJ, IE e Endereço NÃO são copiados conforme regra
  const handleCopiarDadosMatriz = () => {
    if (!matrizExistente) {
      toast({
        variant: 'destructive',
        title: 'Matriz não encontrada',
        description: 'Nenhuma matriz cadastrada para copiar os dados.',
      })
      return
    }

    setFormData((prev) => ({
      ...prev,
      // Regime
      crt: matrizExistente.crt,
      regime_apuracao: matrizExistente.regime_apuracao,
      regime_pis_cofins: matrizExistente.regime_pis_cofins,
      aliquota_credito_simples: matrizExistente.aliquota_credito_simples,
      contribuinte_ipi: matrizExistente.contribuinte_ipi,
      indicador_atividade_sped: matrizExistente.indicador_atividade_sped,
      perfil_sped: matrizExistente.perfil_sped,
      obrigado_efd_icms_ipi: matrizExistente.obrigado_efd_icms_ipi,
      // Contato
      telefone: matrizExistente.telefone,
      celular: matrizExistente.celular,
      email: matrizExistente.email,
      email_fiscal: matrizExistente.email_fiscal,
      site: matrizExistente.site,
      // Responsável legal
      responsavel_nome: matrizExistente.responsavel_nome,
      responsavel_cpf: matrizExistente.responsavel_cpf,
      responsavel_cargo: matrizExistente.responsavel_cargo,
      // Contabilidade
      contador_nome: matrizExistente.contador_nome,
      contador_cpf: matrizExistente.contador_cpf,
      contador_crc: matrizExistente.contador_crc,
      contador_cnpj_escritorio: matrizExistente.contador_cnpj_escritorio,
      contador_cep: matrizExistente.contador_cep,
      contador_logradouro: matrizExistente.contador_logradouro,
      contador_numero: matrizExistente.contador_numero,
      contador_complemento: matrizExistente.contador_complemento,
      contador_bairro: matrizExistente.contador_bairro,
      contador_codigo_municipio_ibge: matrizExistente.contador_codigo_municipio_ibge,
      contador_telefone: matrizExistente.contador_telefone,
      contador_email: matrizExistente.contador_email,
    }))

    setFoiModificado(true)
    toast({
      title: 'Dados copiados da Matriz',
      description: 'Regime tributário, contato e contabilidade foram preenchidos com sucesso.',
    })
  }

  // Manipular upload do logo
  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Limite de 2 MB (2 * 1024 * 1024 bytes)
    if (file.size > 2 * 1024 * 1024) {
      toast({
        variant: 'destructive',
        title: 'Arquivo muito grande',
        description: 'A imagem do logotipo deve ter no máximo 2 MB.',
      })
      return
    }

    setLogoFile(file)
    setLogoPreview(URL.createObjectURL(file))
    setFoiModificado(true)
  }

  // Validação completa antes do envio
  const validarFormulario = (): boolean => {
    const novosErros: Record<string, string> = {}

    // Identificação
    if (!formData.tipo) novosErros.tipo = 'Tipo é obrigatório'
    if (formData.tipo === 'Filial' && !formData.matriz_id && !matrizExistente) {
      novosErros.tipo = 'É necessário cadastrar uma Matriz antes da Filial'
    }

    if (isEdicao && (!formData.codigo || Number(formData.codigo) <= 0)) {
      novosErros.codigo = 'Código sequencial é obrigatório'
    }

    if (!formData.razao_social || !formData.razao_social.trim()) {
      novosErros.razao_social = 'Razão Social é obrigatória'
    } else if (formData.razao_social.length > 60) {
      novosErros.razao_social = 'Razão Social deve ter no máximo 60 caracteres'
    }

    if (formData.nome_fantasia && formData.nome_fantasia.length > 60) {
      novosErros.nome_fantasia = 'Nome Fantasia deve ter no máximo 60 caracteres'
    }

    // CNPJ obrigatório e válido
    if (!formData.cnpj) {
      novosErros.cnpj = 'CNPJ é obrigatório'
    } else if (!validarCNPJ(formData.cnpj)) {
      novosErros.cnpj = 'CNPJ inválido (verifique os 14 caracteres e os dígitos verificadores)'
    }

    // Inscrição Estadual (validar se contribuinte, aceita ISENTO, e valida ES com pesos 9 a 2)
    if (formData.inscricao_estadual) {
      const ieValida = validarInscricaoEstadual(formData.inscricao_estadual, formData.uf || '')
      if (!ieValida.valido) {
        novosErros.inscricao_estadual = ieValida.mensagem || 'Inscrição Estadual inválida'
      }
    }

    // CNAE principal: 7 dígitos se preenchido
    if (formData.cnae_principal) {
      const cnaeDigitos = formData.cnae_principal.replace(/\D/g, '')
      if (cnaeDigitos.length !== 7) {
        novosErros.cnae_principal = 'CNAE deve conter 7 dígitos'
      }
    }

    // Regime tributário
    if (!formData.crt) {
      novosErros.crt = 'Código de Regime Tributário (CRT) é obrigatório'
    }

    // Endereço
    if (!formData.codigo_municipio_ibge || !formData.codigo_municipio_ibge.trim()) {
      novosErros.codigo_municipio_ibge = 'Código IBGE do município é obrigatório (7 dígitos)'
    } else if (formData.codigo_municipio_ibge.replace(/\D/g, '').length !== 7) {
      novosErros.codigo_municipio_ibge = 'Código IBGE deve ter exatamente 7 dígitos'
    }

    // Validação de CPF do responsável se preenchido
    if (formData.responsavel_cpf && !validarCPF(formData.responsavel_cpf)) {
      novosErros.responsavel_cpf = 'CPF do responsável legal inválido'
    }

    // Validação de CPF do contador se preenchido
    if (formData.contador_cpf && !validarCPF(formData.contador_cpf)) {
      novosErros.contador_cpf = 'CPF do contador inválido'
    }

    // Validação de CNPJ do escritório de contabilidade se preenchido
    if (formData.contador_cnpj_escritorio && !validarCNPJ(formData.contador_cnpj_escritorio)) {
      novosErros.contador_cnpj_escritorio = 'CNPJ do escritório contábil inválido'
    }

    setErros(novosErros)

    if (Object.keys(novosErros).length > 0) {
      // Se houver erros, avisa qual aba contém erro
      if (
        novosErros.tipo ||
        novosErros.codigo ||
        novosErros.razao_social ||
        novosErros.nome_fantasia ||
        novosErros.cnpj ||
        novosErros.inscricao_estadual ||
        novosErros.cnae_principal
      ) {
        setAbaAtiva('identificacao')
      } else if (novosErros.crt) {
        setAbaAtiva('regime')
      } else if (novosErros.codigo_municipio_ibge) {
        setAbaAtiva('endereco')
      } else if (novosErros.responsavel_cpf) {
        setAbaAtiva('contato')
      } else if (novosErros.contador_cpf || novosErros.contador_cnpj_escritorio) {
        setAbaAtiva('contabilidade')
      }

      toast({
        variant: 'destructive',
        title: 'Verifique os campos obrigatórios',
        description: Object.values(novosErros)[0],
      })
      return false
    }

    return true
  }

  // Submissão do formulário
  const handleSubmit = async (ignorarAlertaRaiz = false) => {
    if (!validarFormulario()) return

    // Regra de filial com raiz diferente da matriz
    if (formData.tipo === 'Filial' && matrizExistente && !ignorarAlertaRaiz) {
      const raizMatriz = extrairRaizCNPJ(matrizExistente.cnpj)
      const raizFilial = extrairRaizCNPJ(formData.cnpj || '')
      if (raizMatriz && raizFilial && raizMatriz !== raizFilial) {
        setDialogRaizAberta(true)
        return
      }
    }

    try {
      setSalvando(true)
      const payloadLimpo = {
        ...formData,
        codigo: formData.codigo ? Number(formData.codigo) : undefined,
        crt: Number(formData.crt),
        aliquota_credito_simples:
          formData.aliquota_credito_simples !== undefined &&
          formData.aliquota_credito_simples !== null
            ? Number(formData.aliquota_credito_simples)
            : undefined,
        indicador_atividade_sped:
          formData.indicador_atividade_sped !== undefined &&
          formData.indicador_atividade_sped !== null
            ? Number(formData.indicador_atividade_sped)
            : undefined,
        matriz_id: formData.tipo === 'Filial' ? formData.matriz_id || matrizExistente?.id : '',
      }

      if (isEdicao && id) {
        await atualizarEmpresa(id, payloadLimpo, logoFile)
        toast({
          title: 'Empresa atualizada com sucesso',
          description: 'Os dados foram salvos e auditados no sistema.',
        })
      } else {
        await criarEmpresa(payloadLimpo, logoFile)
        toast({
          title: 'Empresa cadastrada com sucesso',
          description: 'O novo estabelecimento foi adicionado ao sistema.',
        })
      }

      await recarregarEmpresas()
      setFoiModificado(false)
      navigate('/cadastros/empresas')
    } catch (err: unknown) {
      console.error(err)
      toast({
        variant: 'destructive',
        title: 'Erro ao salvar empresa',
        description:
          err instanceof Error ? err.message : 'Falha ao registrar informações no banco.',
      })
    } finally {
      setSalvando(false)
      setDialogRaizAberta(false)
    }
  }

  return (
    <div className="space-y-5 max-w-5xl mx-auto pb-12">
      {/* Cabeçalho do formulário */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-200 pb-4">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              if (foiModificado) {
                if (window.confirm('Existem alterações não salvas. Deseja realmente sair?')) {
                  navigate('/cadastros/empresas')
                }
              } else {
                navigate('/cadastros/empresas')
              }
            }}
            className="h-8 w-8 text-slate-600 hover:text-slate-900"
            title="Voltar para a listagem"
          >
            <ArrowLeft size={18} />
          </Button>

          <div>
            <div className="flex items-center gap-2">
              <Building2 className="h-6 w-6 text-blue-600" />
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                {isEdicao ? 'Editar Empresa' : 'Nova Empresa'}
              </h1>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              {isEdicao
                ? `Editando ${formData.tipo || 'estabelecimento'} - Código ${formData.codigo}`
                : 'Cadastre a Matriz ou uma Filial com parâmetros contábeis e fiscais'}
            </p>
          </div>
        </div>

        {/* Botão Copiar dados da Matriz quando for filial */}
        <div className="flex items-center gap-2">
          {formData.tipo === 'Filial' && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleCopiarDadosMatriz}
              className="text-xs h-9 border-purple-200 text-purple-700 hover:bg-purple-50"
              title="Copia Regime Tributário, Contato e Contabilidade da Matriz"
            >
              <Copy size={14} className="mr-1.5" />
              Copiar dados da matriz
            </Button>
          )}

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              if (foiModificado) {
                if (window.confirm('Existem alterações não salvas. Deseja cancelar?')) {
                  navigate('/cadastros/empresas')
                }
              } else {
                navigate('/cadastros/empresas')
              }
            }}
            className="text-xs h-9 text-slate-600"
          >
            Cancelar
          </Button>

          <Button
            type="button"
            size="sm"
            onClick={() => handleSubmit(false)}
            disabled={salvando || carregando}
            className="text-xs h-9 bg-blue-600 hover:bg-blue-700 text-white font-medium"
          >
            <Save size={14} className="mr-1.5" />
            {salvando ? 'Salvando...' : 'Salvar Empresa'}
          </Button>
        </div>
      </div>

      {foiModificado && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 flex items-center gap-2 text-xs text-amber-800">
          <Info size={15} className="text-amber-600 flex-shrink-0" />
          <span>Você possui alterações não salvas neste formulário.</span>
        </div>
      )}

      {/* Formulário com Abas */}
      <Tabs value={abaAtiva} onValueChange={setAbaAtiva} className="w-full">
        <TabsList className="grid grid-cols-5 w-full bg-slate-100 p-1 rounded-xl h-auto">
          <TabsTrigger value="identificacao" className="text-xs py-2 data-[state=active]:bg-white">
            Identificação
          </TabsTrigger>
          <TabsTrigger value="regime" className="text-xs py-2 data-[state=active]:bg-white">
            Regime Tributário
          </TabsTrigger>
          <TabsTrigger value="endereco" className="text-xs py-2 data-[state=active]:bg-white">
            Endereço
          </TabsTrigger>
          <TabsTrigger value="contato" className="text-xs py-2 data-[state=active]:bg-white">
            Contato
          </TabsTrigger>
          <TabsTrigger value="contabilidade" className="text-xs py-2 data-[state=active]:bg-white">
            Contabilidade
          </TabsTrigger>
        </TabsList>

        {/* ================= ABA 1: IDENTIFICAÇÃO ================= */}
        <TabsContent value="identificacao" className="mt-4">
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-2xs space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {/* Tipo */}
              <div>
                <Label className="text-xs font-semibold text-slate-700">
                  Tipo de Estabelecimento <span className="text-red-500">*</span>
                </Label>
                <Select
                  value={formData.tipo}
                  onValueChange={(val: EmpresaTipo) => {
                    if (val === 'Matriz' && matrizExistente && matrizExistente.id !== id) {
                      toast({
                        variant: 'destructive',
                        title: 'Matriz já existente',
                        description: `A matriz já é "${matrizExistente.razao_social}". Só pode existir uma Matriz.`,
                      })
                      return
                    }
                    setCampo('tipo', val)
                  }}
                  disabled={isEdicao}
                >
                  <SelectTrigger className="mt-1 text-xs h-9">
                    <SelectValue placeholder="Selecione o tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Matriz">Matriz</SelectItem>
                    <SelectItem value="Filial">Filial</SelectItem>
                  </SelectContent>
                </Select>
                {erros.tipo && <span className="text-[11px] text-red-500">{erros.tipo}</span>}
              </div>

              {/* Código */}
              <div>
                <Label className="text-xs font-semibold text-slate-700">Código Curto</Label>
                <Input
                  type="text"
                  value={formData.codigo || ''}
                  disabled
                  readOnly
                  placeholder="será gerado ao salvar"
                  className="mt-1 text-xs h-9 font-semibold text-slate-800 bg-slate-50"
                />
                {erros.codigo && <span className="text-[11px] text-red-500">{erros.codigo}</span>}
              </div>

              {/* CNPJ com botão de consulta */}
              <div className="md:col-span-2">
                <Label className="text-xs font-semibold text-slate-700">
                  CNPJ (numérico ou alfanumérico) <span className="text-red-500">*</span>
                </Label>
                <div className="flex gap-2 mt-1">
                  <Input
                    type="text"
                    value={formData.cnpj || ''}
                    onChange={(e) => setCampo('cnpj', formatarCNPJ(e.target.value))}
                    className="text-xs h-9 font-mono"
                    placeholder="00.000.000/0000-00"
                    maxLength={18}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleConsultarCnpj}
                    disabled={consultandoCnpj || !formData.cnpj}
                    className="text-xs h-9 px-3 flex-shrink-0 bg-slate-50 border-slate-300 hover:bg-blue-50 hover:text-blue-700"
                    title="Consultar dados via BrasilAPI"
                  >
                    <Search size={14} className="mr-1.5" />
                    {consultandoCnpj ? 'Consultando...' : 'Consultar CNPJ'}
                  </Button>
                </div>
                {erros.cnpj && <span className="text-[11px] text-red-500">{erros.cnpj}</span>}
                <span className="text-[10px] text-slate-400 block mt-0.5">
                  Aceita até 12 caracteres alfanuméricos com os 2 dígitos verificadores oficiais.
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Razão Social */}
              <div>
                <Label className="text-xs font-semibold text-slate-700">
                  Razão Social <span className="text-red-500">*</span> (até 60 caracteres)
                </Label>
                <Input
                  type="text"
                  maxLength={60}
                  value={formData.razao_social || ''}
                  onChange={(e) => setCampo('razao_social', e.target.value)}
                  className="mt-1 text-xs h-9"
                  placeholder="Nome empresarial conforme cartão do CNPJ"
                />
                <div className="flex justify-between items-center text-[10px] text-slate-400 mt-0.5">
                  <span>
                    {erros.razao_social && (
                      <span className="text-red-500">{erros.razao_social}</span>
                    )}
                  </span>
                  <span>{(formData.razao_social || '').length}/60</span>
                </div>
              </div>

              {/* Nome Fantasia */}
              <div>
                <Label className="text-xs font-semibold text-slate-700">
                  Nome Fantasia (até 60 caracteres)
                </Label>
                <Input
                  type="text"
                  maxLength={60}
                  value={formData.nome_fantasia || ''}
                  onChange={(e) => setCampo('nome_fantasia', e.target.value)}
                  className="mt-1 text-xs h-9"
                  placeholder="Nome comercial da loja ou filial"
                />
                <div className="flex justify-between items-center text-[10px] text-slate-400 mt-0.5">
                  <span>
                    {erros.nome_fantasia && (
                      <span className="text-red-500">{erros.nome_fantasia}</span>
                    )}
                  </span>
                  <span>{(formData.nome_fantasia || '').length}/60</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Inscrição Estadual */}
              <div>
                <Label className="text-xs font-semibold text-slate-700">
                  Inscrição Estadual (IE)
                </Label>
                <Input
                  type="text"
                  value={formData.inscricao_estadual || ''}
                  onChange={(e) => setCampo('inscricao_estadual', e.target.value)}
                  className="mt-1 text-xs h-9 uppercase"
                  placeholder="Número da IE ou ISENTO"
                />
                {erros.inscricao_estadual && (
                  <span className="text-[11px] text-red-500">{erros.inscricao_estadual}</span>
                )}
                <span className="text-[10px] text-slate-400 block mt-0.5">
                  Obrigatório para contribuinte de ICMS. Digite ISENTO se for o caso.
                </span>
              </div>

              {/* Inscrição Estadual ST */}
              <div>
                <Label className="text-xs font-semibold text-slate-700">
                  Inscrição Estadual ST (Substituto)
                </Label>
                <Input
                  type="text"
                  value={formData.inscricao_estadual_st || ''}
                  onChange={(e) => setCampo('inscricao_estadual_st', e.target.value)}
                  className="mt-1 text-xs h-9"
                  placeholder="IE de ST em outro estado"
                />
              </div>

              {/* Inscrição Municipal */}
              <div>
                <Label className="text-xs font-semibold text-slate-700">Inscrição Municipal</Label>
                <Input
                  type="text"
                  value={formData.inscricao_municipal || ''}
                  onChange={(e) => setCampo('inscricao_municipal', e.target.value)}
                  className="mt-1 text-xs h-9"
                  placeholder="Número de cadastro na prefeitura"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* CNAE Principal */}
              <div>
                <Label className="text-xs font-semibold text-slate-700">
                  CNAE Principal (7 dígitos)
                </Label>
                <Input
                  type="text"
                  maxLength={10}
                  value={formData.cnae_principal || ''}
                  onChange={(e) => setCampo('cnae_principal', e.target.value)}
                  className="mt-1 text-xs h-9"
                  placeholder="Ex: 4711302"
                />
                {erros.cnae_principal && (
                  <span className="text-[11px] text-red-500">{erros.cnae_principal}</span>
                )}
              </div>

              {/* Data de Abertura */}
              <div>
                <Label className="text-xs font-semibold text-slate-700">Data de Abertura</Label>
                <Input
                  type="date"
                  value={formData.data_abertura ? formData.data_abertura.slice(0, 10) : ''}
                  onChange={(e) => setCampo('data_abertura', e.target.value)}
                  className="mt-1 text-xs h-9"
                />
              </div>

              {/* Logo da Empresa */}
              <div>
                <Label className="text-xs font-semibold text-slate-700">Logotipo (até 2 MB)</Label>
                <div className="flex items-center gap-3 mt-1">
                  {logoPreview ? (
                    <img
                      src={logoPreview}
                      alt="Logo preview"
                      className="h-10 w-10 object-contain rounded-md border border-slate-200 bg-slate-50 p-1"
                    />
                  ) : (
                    <div className="h-10 w-10 rounded-md border border-dashed border-slate-300 flex items-center justify-center bg-slate-50 text-slate-400">
                      <Upload size={16} />
                    </div>
                  )}

                  <label className="cursor-pointer">
                    <span className="text-xs font-medium text-blue-600 hover:text-blue-700 hover:underline">
                      {logoPreview ? 'Trocar imagem' : 'Selecionar arquivo'}
                    </span>
                    <input
                      type="file"
                      accept="image/png, image/jpeg, image/webp, image/svg+xml"
                      onChange={handleLogoUpload}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>
            </div>

            {/* CNAEs Secundários */}
            <div>
              <Label className="text-xs font-semibold text-slate-700">CNAEs Secundários</Label>
              <Input
                type="text"
                placeholder="Separe os CNAEs por vírgula (ex: 4712100, 4721102)"
                value={
                  Array.isArray(formData.cnaes_secundarios)
                    ? formData.cnaes_secundarios.join(', ')
                    : ''
                }
                onChange={(e) => {
                  const itens = e.target.value
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean)
                  setCampo('cnaes_secundarios', itens)
                }}
                className="mt-1 text-xs h-9"
              />
              <span className="text-[10px] text-slate-400 block mt-0.5">
                Preenchido automaticamente ao clicar em &quot;Consultar CNPJ&quot;.
              </span>
            </div>
          </div>
        </TabsContent>

        {/* ================= ABA 2: REGIME TRIBUTÁRIO ================= */}
        <TabsContent value="regime" className="mt-4">
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-2xs space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* CRT */}
              <div>
                <Label className="text-xs font-semibold text-slate-700">
                  Código de Regime Tributário (CRT) <span className="text-red-500">*</span>
                </Label>
                <Select
                  value={String(formData.crt || 1)}
                  onValueChange={(val) => handleCrtChange(Number(val))}
                >
                  <SelectTrigger className="mt-1 text-xs h-9">
                    <SelectValue placeholder="Selecione o CRT" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1 - Simples Nacional</SelectItem>
                    <SelectItem value="2">2 - Simples Nacional - excesso sublimite</SelectItem>
                    <SelectItem value="3">3 - Regime Normal (Lucro Presumido / Real)</SelectItem>
                    <SelectItem value="4">4 - Simples Nacional - MEI</SelectItem>
                  </SelectContent>
                </Select>
                {erros.crt && <span className="text-[11px] text-red-500">{erros.crt}</span>}
              </div>

              {/* Regime de Apuração */}
              <div>
                <Label className="text-xs font-semibold text-slate-700">Regime de Apuração</Label>
                <Select
                  value={formData.regime_apuracao || 'Simples Nacional'}
                  onValueChange={(val: RegimeApuracao) => setCampo('regime_apuracao', val)}
                >
                  <SelectTrigger className="mt-1 text-xs h-9">
                    <SelectValue placeholder="Selecione o regime de apuração" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Simples Nacional">Simples Nacional</SelectItem>
                    <SelectItem value="Lucro Presumido">Lucro Presumido</SelectItem>
                    <SelectItem value="Lucro Real">Lucro Real</SelectItem>
                    <SelectItem value="MEI">MEI</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Campos condicionais ao CRT conforme especificado */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Regime PIS/COFINS (Aparece SOMENTE quando crt = 3) */}
              {Number(formData.crt) === 3 ? (
                <div className="p-3 bg-blue-50/50 rounded-lg border border-blue-100">
                  <Label className="text-xs font-semibold text-slate-800">
                    Regime PIS/COFINS <span className="text-blue-600 font-normal">(CRT = 3)</span>
                  </Label>
                  <Select
                    value={formData.regime_pis_cofins || 'Não cumulativo'}
                    onValueChange={(val: RegimePisCofins) => setCampo('regime_pis_cofins', val)}
                  >
                    <SelectTrigger className="mt-1 text-xs h-9 bg-white">
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Cumulativo">Cumulativo (Lucro Presumido)</SelectItem>
                      <SelectItem value="Não cumulativo">Não cumulativo (Lucro Real)</SelectItem>
                    </SelectContent>
                  </Select>
                  <span className="text-[10px] text-slate-500 block mt-1">
                    Define a cumulatividade de créditos das contribuições federais.
                  </span>
                </div>
              ) : (
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-slate-400 text-xs flex items-center">
                  <span>Regime PIS/COFINS aplicável apenas para Regime Normal (CRT 3).</span>
                </div>
              )}

              {/* Alíquota de Crédito do Simples (Aparece SOMENTE quando crt = 1 ou 2) */}
              {Number(formData.crt) === 1 || Number(formData.crt) === 2 ? (
                <div className="p-3 bg-emerald-50/50 rounded-lg border border-emerald-100">
                  <Label className="text-xs font-semibold text-slate-800">
                    Alíquota de Crédito do Simples (%){' '}
                    <span className="text-emerald-600 font-normal">(CRT 1 ou 2)</span>
                  </Label>
                  <Input
                    type="number"
                    step="0.0001"
                    min="0"
                    max="100"
                    value={formData.aliquota_credito_simples ?? ''}
                    onChange={(e) => setCampo('aliquota_credito_simples', e.target.value)}
                    className="mt-1 text-xs h-9 bg-white"
                    placeholder="Ex: 2.8200"
                  />
                  <span className="text-[10px] text-slate-500 block mt-1">
                    Percentual de crédito de ICMS que pode ser aproveitado pelo destinatário.
                  </span>
                </div>
              ) : (
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-slate-400 text-xs flex items-center">
                  <span>
                    Alíquota de crédito de ICMS aplicável apenas ao Simples Nacional (CRT 1 ou 2).
                  </span>
                </div>
              )}
            </div>

            {/* Parâmetros do SPED e IPI */}
            <div className="pt-2 border-t border-slate-100">
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-3">
                Parâmetros Fiscais e SPED
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Perfil SPED */}
                <div>
                  <Label className="text-xs font-semibold text-slate-700">
                    Perfil do SPED Fiscal (EFD ICMS/IPI)
                  </Label>
                  <Select
                    value={formData.perfil_sped || 'B'}
                    onValueChange={(val: PerfilSped) => setCampo('perfil_sped', val)}
                  >
                    <SelectTrigger className="mt-1 text-xs h-9">
                      <SelectValue placeholder="Selecione o perfil" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="A">Perfil A (Mais detalhado)</SelectItem>
                      <SelectItem value="B">Perfil B (Padrão varejo/comércio)</SelectItem>
                      <SelectItem value="C">Perfil C (Simplificado)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Indicador de Atividade SPED */}
                <div>
                  <Label className="text-xs font-semibold text-slate-700">
                    Indicador de Atividade SPED
                  </Label>
                  <Select
                    value={String(formData.indicador_atividade_sped ?? 1)}
                    onValueChange={(val) => setCampo('indicador_atividade_sped', Number(val))}
                  >
                    <SelectTrigger className="mt-1 text-xs h-9">
                      <SelectValue placeholder="Selecione a atividade" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">0 - Industrial ou equiparado</SelectItem>
                      <SelectItem value="1">1 - Outros (Comércio / Serviços)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Checkboxes: Contribuinte IPI e EFD */}
                <div className="space-y-3 pt-4">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="contribuinte_ipi"
                      checked={Boolean(formData.contribuinte_ipi)}
                      onCheckedChange={(checked) => setCampo('contribuinte_ipi', Boolean(checked))}
                    />
                    <label
                      htmlFor="contribuinte_ipi"
                      className="text-xs font-medium text-slate-700 cursor-pointer leading-none"
                    >
                      Contribuinte do IPI (Indústria ou equiparada)
                    </label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="obrigado_efd_icms_ipi"
                      checked={Boolean(formData.obrigado_efd_icms_ipi)}
                      onCheckedChange={(checked) =>
                        setCampo('obrigado_efd_icms_ipi', Boolean(checked))
                      }
                    />
                    <label
                      htmlFor="obrigado_efd_icms_ipi"
                      className="text-xs font-medium text-slate-700 cursor-pointer leading-none"
                    >
                      Obrigado à EFD ICMS/IPI
                    </label>
                  </div>

                  {/* Bloco Estoque */}
                  <div className="pt-4 mt-2 border-t border-slate-200">
                    <h3 className="text-sm font-semibold text-slate-900 mb-2">Estoque</h3>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="permite_estoque_negativo"
                        checked={Boolean(formData.permite_estoque_negativo)}
                        onCheckedChange={(checked) =>
                          setCampo('permite_estoque_negativo', Boolean(checked))
                        }
                      />
                      <label
                        htmlFor="permite_estoque_negativo"
                        className="text-xs font-medium text-slate-700 cursor-pointer leading-none"
                      >
                        Permitir estoque negativo
                      </label>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1.5 ml-6">
                      Quando desmarcado, saídas ou vendas que ultrapassarem o saldo disponível serão
                      recusadas pelo motor de estoque.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* ================= ABA 3: ENDEREÇO ================= */}
        <TabsContent value="endereco" className="mt-4">
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-2xs space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {/* CEP com busca automática */}
              <div>
                <Label className="text-xs font-semibold text-slate-700">
                  CEP (Busca automática via ViaCEP)
                </Label>
                <div className="relative mt-1">
                  <Input
                    type="text"
                    value={formData.cep || ''}
                    onChange={(e) => handleCepChange(e.target.value)}
                    className="text-xs h-9 font-mono"
                    placeholder="00000-000"
                    maxLength={9}
                  />
                  {consultandoCep && (
                    <span className="absolute right-2 top-2 text-[10px] text-blue-600 animate-pulse">
                      Buscando...
                    </span>
                  )}
                </div>
              </div>

              {/* Logradouro */}
              <div className="md:col-span-2">
                <Label className="text-xs font-semibold text-slate-700">Logradouro / Rua</Label>
                <Input
                  type="text"
                  value={formData.logradouro || ''}
                  onChange={(e) => setCampo('logradouro', e.target.value)}
                  className="mt-1 text-xs h-9"
                  placeholder="Rua, Avenida, Praça..."
                />
              </div>

              {/* Número */}
              <div>
                <Label className="text-xs font-semibold text-slate-700">Número</Label>
                <Input
                  type="text"
                  value={formData.numero || ''}
                  onChange={(e) => setCampo('numero', e.target.value)}
                  className="mt-1 text-xs h-9"
                  placeholder="Ex: 120, S/N"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Complemento */}
              <div>
                <Label className="text-xs font-semibold text-slate-700">Complemento</Label>
                <Input
                  type="text"
                  value={formData.complemento || ''}
                  onChange={(e) => setCampo('complemento', e.target.value)}
                  className="mt-1 text-xs h-9"
                  placeholder="Sala, Andar, Galpão..."
                />
              </div>

              {/* Bairro */}
              <div>
                <Label className="text-xs font-semibold text-slate-700">Bairro</Label>
                <Input
                  type="text"
                  value={formData.bairro || ''}
                  onChange={(e) => setCampo('bairro', e.target.value)}
                  className="mt-1 text-xs h-9"
                  placeholder="Nome do bairro"
                />
              </div>

              {/* Município */}
              <div>
                <Label className="text-xs font-semibold text-slate-700">Município</Label>
                <Input
                  type="text"
                  value={formData.municipio || ''}
                  onChange={(e) => setCampo('municipio', e.target.value)}
                  className="mt-1 text-xs h-9"
                  placeholder="Cidade"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {/* Código IBGE */}
              <div>
                <Label className="text-xs font-semibold text-slate-700">
                  Código IBGE Município <span className="text-red-500">*</span>
                </Label>
                <Input
                  type="text"
                  maxLength={7}
                  value={formData.codigo_municipio_ibge || ''}
                  onChange={(e) => setCampo('codigo_municipio_ibge', e.target.value)}
                  className="mt-1 text-xs h-9 font-mono"
                  placeholder="7 dígitos (ex: 3205309)"
                />
                {erros.codigo_municipio_ibge && (
                  <span className="text-[11px] text-red-500">{erros.codigo_municipio_ibge}</span>
                )}
              </div>

              {/* UF */}
              <div>
                <Label className="text-xs font-semibold text-slate-700">UF (Estado)</Label>
                <Input
                  type="text"
                  maxLength={2}
                  value={formData.uf || ''}
                  onChange={(e) => setCampo('uf', e.target.value.toUpperCase())}
                  className="mt-1 text-xs h-9 uppercase"
                  placeholder="ES, SP, RJ..."
                />
              </div>

              {/* Código País */}
              <div>
                <Label className="text-xs font-semibold text-slate-700">Código País (BACEN)</Label>
                <Input
                  type="text"
                  value={formData.codigo_pais || '1058'}
                  onChange={(e) => setCampo('codigo_pais', e.target.value)}
                  className="mt-1 text-xs h-9"
                  placeholder="1058 (Brasil)"
                />
              </div>

              {/* Nome País */}
              <div>
                <Label className="text-xs font-semibold text-slate-700">País</Label>
                <Input
                  type="text"
                  value={formData.pais || 'Brasil'}
                  onChange={(e) => setCampo('pais', e.target.value)}
                  className="mt-1 text-xs h-9"
                  placeholder="Brasil"
                />
              </div>
            </div>
          </div>
        </TabsContent>

        {/* ================= ABA 4: CONTATO E RESPONSÁVEL ================= */}
        <TabsContent value="contato" className="mt-4">
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-2xs space-y-6">
            <div>
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-3">
                Canais de Comunicação
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Telefone */}
                <div>
                  <Label className="text-xs font-semibold text-slate-700">Telefone Fixo</Label>
                  <Input
                    type="text"
                    value={formData.telefone || ''}
                    onChange={(e) => setCampo('telefone', formatarTelefone(e.target.value))}
                    className="mt-1 text-xs h-9"
                    placeholder="(00) 0000-0000"
                  />
                </div>

                {/* Celular */}
                <div>
                  <Label className="text-xs font-semibold text-slate-700">Celular / WhatsApp</Label>
                  <Input
                    type="text"
                    value={formData.celular || ''}
                    onChange={(e) => setCampo('celular', formatarTelefone(e.target.value))}
                    className="mt-1 text-xs h-9"
                    placeholder="(00) 00000-0000"
                  />
                </div>

                {/* Site */}
                <div>
                  <Label className="text-xs font-semibold text-slate-700">Website</Label>
                  <Input
                    type="text"
                    value={formData.site || ''}
                    onChange={(e) => setCampo('site', e.target.value)}
                    className="mt-1 text-xs h-9"
                    placeholder="https://suaempresa.com.br"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                {/* E-mail geral */}
                <div>
                  <Label className="text-xs font-semibold text-slate-700">E-mail Comercial</Label>
                  <Input
                    type="email"
                    value={formData.email || ''}
                    onChange={(e) => setCampo('email', e.target.value)}
                    className="mt-1 text-xs h-9"
                    placeholder="contato@empresa.com.br"
                  />
                </div>

                {/* E-mail fiscal para envio de XML */}
                <div>
                  <Label className="text-xs font-semibold text-slate-700">
                    E-mail Fiscal (para envio/recebimento de XML)
                  </Label>
                  <Input
                    type="email"
                    value={formData.email_fiscal || ''}
                    onChange={(e) => setCampo('email_fiscal', e.target.value)}
                    className="mt-1 text-xs h-9"
                    placeholder="nfe@empresa.com.br"
                  />
                  <span className="text-[10px] text-slate-400 block mt-0.5">
                    Endereço configurado para notificações fiscais da SEFAZ e fornecedores.
                  </span>
                </div>
              </div>
            </div>

            {/* Responsável Legal */}
            <div className="pt-4 border-t border-slate-100">
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-3">
                Responsável Legal
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label className="text-xs font-semibold text-slate-700">Nome Completo</Label>
                  <Input
                    type="text"
                    value={formData.responsavel_nome || ''}
                    onChange={(e) => setCampo('responsavel_nome', e.target.value)}
                    className="mt-1 text-xs h-9"
                    placeholder="Nome do administrador ou sócio"
                  />
                </div>

                <div>
                  <Label className="text-xs font-semibold text-slate-700">CPF do Responsável</Label>
                  <Input
                    type="text"
                    value={formData.responsavel_cpf || ''}
                    onChange={(e) => setCampo('responsavel_cpf', formatarCPF(e.target.value))}
                    className="mt-1 text-xs h-9 font-mono"
                    placeholder="000.000.000-00"
                    maxLength={14}
                  />
                  {erros.responsavel_cpf && (
                    <span className="text-[11px] text-red-500">{erros.responsavel_cpf}</span>
                  )}
                </div>

                <div>
                  <Label className="text-xs font-semibold text-slate-700">Cargo</Label>
                  <Input
                    type="text"
                    value={formData.responsavel_cargo || ''}
                    onChange={(e) => setCampo('responsavel_cargo', e.target.value)}
                    className="mt-1 text-xs h-9"
                    placeholder="Ex: Diretor, Sócio-Administrador"
                  />
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* ================= ABA 5: CONTABILIDADE (SPED 0100) ================= */}
        <TabsContent value="contabilidade" className="mt-4">
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-2xs space-y-6">
            <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-lg text-xs text-blue-900 flex items-start gap-2">
              <Info size={16} className="text-blue-600 flex-shrink-0 mt-0.5" />
              <div>
                <strong>Registro 0100 do SPED Fiscal:</strong> Estes dados são obrigatórios na
                geração do arquivo da EFD ICMS/IPI para identificar o contabilista responsável pela
                escrituração da empresa.
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label className="text-xs font-semibold text-slate-700">Nome do Contador</Label>
                <Input
                  type="text"
                  value={formData.contador_nome || ''}
                  onChange={(e) => setCampo('contador_nome', e.target.value)}
                  className="mt-1 text-xs h-9"
                  placeholder="Nome completo do contabilista"
                />
              </div>

              <div>
                <Label className="text-xs font-semibold text-slate-700">CPF do Contador</Label>
                <Input
                  type="text"
                  value={formData.contador_cpf || ''}
                  onChange={(e) => setCampo('contador_cpf', formatarCPF(e.target.value))}
                  className="mt-1 text-xs h-9 font-mono"
                  placeholder="000.000.000-00"
                  maxLength={14}
                />
                {erros.contador_cpf && (
                  <span className="text-[11px] text-red-500">{erros.contador_cpf}</span>
                )}
              </div>

              <div>
                <Label className="text-xs font-semibold text-slate-700">Registro CRC</Label>
                <Input
                  type="text"
                  value={formData.contador_crc || ''}
                  onChange={(e) => setCampo('contador_crc', e.target.value)}
                  className="mt-1 text-xs h-9 uppercase"
                  placeholder="Ex: ES-123456/O"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label className="text-xs font-semibold text-slate-700">CNPJ do Escritório</Label>
                <Input
                  type="text"
                  value={formData.contador_cnpj_escritorio || ''}
                  onChange={(e) =>
                    setCampo('contador_cnpj_escritorio', formatarCNPJ(e.target.value))
                  }
                  className="mt-1 text-xs h-9 font-mono"
                  placeholder="00.000.000/0000-00"
                  maxLength={18}
                />
                {erros.contador_cnpj_escritorio && (
                  <span className="text-[11px] text-red-500">{erros.contador_cnpj_escritorio}</span>
                )}
              </div>

              <div>
                <Label className="text-xs font-semibold text-slate-700">Telefone do Contador</Label>
                <Input
                  type="text"
                  value={formData.contador_telefone || ''}
                  onChange={(e) => setCampo('contador_telefone', formatarTelefone(e.target.value))}
                  className="mt-1 text-xs h-9"
                  placeholder="(00) 0000-0000"
                />
              </div>

              <div>
                <Label className="text-xs font-semibold text-slate-700">E-mail do Contador</Label>
                <Input
                  type="email"
                  value={formData.contador_email || ''}
                  onChange={(e) => setCampo('contador_email', e.target.value)}
                  className="mt-1 text-xs h-9"
                  placeholder="contador@escritorio.com.br"
                />
              </div>
            </div>

            {/* Endereço do Escritório Contábil */}
            <div className="pt-2 border-t border-slate-100">
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-3">
                Endereço do Escritório Contábil
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <Label className="text-xs font-semibold text-slate-700">CEP do Contador</Label>
                  <div className="relative mt-1">
                    <Input
                      type="text"
                      value={formData.contador_cep || ''}
                      onChange={(e) => handleCepContadorChange(e.target.value)}
                      className="text-xs h-9 font-mono"
                      placeholder="00000-000"
                      maxLength={9}
                    />
                    {consultandoCepContador && (
                      <span className="absolute right-2 top-2 text-[10px] text-blue-600 animate-pulse">
                        Buscando...
                      </span>
                    )}
                  </div>
                </div>

                <div className="md:col-span-2">
                  <Label className="text-xs font-semibold text-slate-700">Logradouro</Label>
                  <Input
                    type="text"
                    value={formData.contador_logradouro || ''}
                    onChange={(e) => setCampo('contador_logradouro', e.target.value)}
                    className="mt-1 text-xs h-9"
                    placeholder="Rua, Avenida..."
                  />
                </div>

                <div>
                  <Label className="text-xs font-semibold text-slate-700">Número</Label>
                  <Input
                    type="text"
                    value={formData.contador_numero || ''}
                    onChange={(e) => setCampo('contador_numero', e.target.value)}
                    className="mt-1 text-xs h-9"
                    placeholder="Ex: 50"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                <div>
                  <Label className="text-xs font-semibold text-slate-700">Complemento</Label>
                  <Input
                    type="text"
                    value={formData.contador_complemento || ''}
                    onChange={(e) => setCampo('contador_complemento', e.target.value)}
                    className="mt-1 text-xs h-9"
                    placeholder="Sala, Andar..."
                  />
                </div>

                <div>
                  <Label className="text-xs font-semibold text-slate-700">Bairro</Label>
                  <Input
                    type="text"
                    value={formData.contador_bairro || ''}
                    onChange={(e) => setCampo('contador_bairro', e.target.value)}
                    className="mt-1 text-xs h-9"
                    placeholder="Bairro do escritório"
                  />
                </div>

                <div>
                  <Label className="text-xs font-semibold text-slate-700">
                    Código IBGE Município
                  </Label>
                  <Input
                    type="text"
                    maxLength={7}
                    value={formData.contador_codigo_municipio_ibge || ''}
                    onChange={(e) => setCampo('contador_codigo_municipio_ibge', e.target.value)}
                    className="mt-1 text-xs h-9 font-mono"
                    placeholder="7 dígitos IBGE"
                  />
                </div>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Diálogo de confirmação para filial com raiz diferente da matriz */}
      <Dialog open={dialogRaizAberta} onOpenChange={setDialogRaizAberta}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-2 text-amber-600">
              <AlertTriangle className="h-5 w-5" />
              <DialogTitle className="text-base font-bold text-slate-900">
                Aviso: Raiz do CNPJ diferente da Matriz
              </DialogTitle>
            </div>
            <DialogDescription className="text-xs text-slate-600 pt-2 leading-relaxed space-y-2">
              <p>
                O CNPJ informado para esta filial (
                <strong>{formatarCNPJ(formData.cnpj || '')}</strong>) possui os 8 primeiros
                caracteres (raiz) diferentes da Matriz cadastrada (
                <strong>{formatarCNPJ(matrizExistente?.cnpj || '')}</strong>).
              </p>
              <p>
                Normalmente, uma filial compartilha a mesma raiz de 8 caracteres da matriz na
                Receita Federal. Deseja prosseguir com o salvamento mesmo assim?
              </p>
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setDialogRaizAberta(false)}
              className="text-xs"
            >
              Revisar CNPJ
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => handleSubmit(true)}
              className="text-xs bg-amber-600 hover:bg-amber-700 text-white font-medium"
            >
              <CheckCircle2 size={14} className="mr-1.5" />
              Sim, continuar e salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default EmpresaForm
