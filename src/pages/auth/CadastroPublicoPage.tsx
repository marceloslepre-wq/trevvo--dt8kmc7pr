import React, { useState, useEffect, useMemo } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import {
  Check,
  Building2,
  User,
  ShieldCheck,
  Lock,
  Mail,
  Phone,
  Search,
  CheckCircle2,
  Sparkles,
  ArrowRight,
  Loader2,
  AlertCircle,
  HelpCircle,
  FileText,
  Layers,
  Zap,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { useToast } from '@/hooks/use-toast'
import { useAuth } from '@/contexts/AuthContext'
import { useEmpresaAtiva } from '@/contexts/EmpresaContext'
import {
  validarCNPJ,
  formatarCNPJ,
  formatarCEP,
  formatarTelefone,
  buscarViaCep,
  buscarBrasilApiCnpj,
} from '@/lib/validacoes'
import {
  listarPlanosPublicos,
  cadastrarNovoAssinante,
  PlanoPublico,
} from '@/services/assinaturaPublica'

export const CadastroPublicoPage: React.FC = () => {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { toast } = useToast()
  const { login } = useAuth()
  const { selecionarEmpresa, recarregarEmpresas } = useEmpresaAtiva()

  // Plano pré-selecionado via URL: /cadastro?plano=id
  const planoUrl = searchParams.get('plano') || ''

  // Lista de planos do catálogo
  const [planos, setPlanos] = useState<PlanoPublico[]>([])
  const [carregandoPlanos, setCarregandoPlanos] = useState<boolean>(true)
  const [planoSelecionadoId, setPlanoSelecionadoId] = useState<string>('')

  // Dados do responsável
  const [respNome, setRespNome] = useState<string>('')
  const [respEmail, setRespEmail] = useState<string>('')
  const [respTelefone, setRespTelefone] = useState<string>('')
  const [respWhatsapp, setRespWhatsapp] = useState<string>('')
  const [respSenha, setRespSenha] = useState<string>('')
  const [respSenhaConfirm, setRespSenhaConfirm] = useState<string>('')

  // Dados da primeira empresa
  const [empCnpj, setEmpCnpj] = useState<string>('')
  const [empRazaoSocial, setEmpRazaoSocial] = useState<string>('')
  const [empNomeFantasia, setEmpNomeFantasia] = useState<string>('')
  const [empInscricaoEstadual, setEmpInscricaoEstadual] = useState<string>('')
  const [empCrt, setEmpCrt] = useState<string>('1')
  const [empCep, setEmpCep] = useState<string>('')
  const [empLogradouro, setEmpLogradouro] = useState<string>('')
  const [empNumero, setEmpNumero] = useState<string>('')
  const [empComplemento, setEmpComplemento] = useState<string>('')
  const [empBairro, setEmpBairro] = useState<string>('')
  const [empMunicipio, setEmpMunicipio] = useState<string>('')
  const [empCodigoMunicipioIbge, setEmpCodigoMunicipioIbge] = useState<string>('')
  const [empUf, setEmpUf] = useState<string>('ES')

  // Aceite dos termos
  const [termosAceitos, setTermosAceitos] = useState<boolean>(false)
  const [modalTermosAberto, setModalTermosAberto] = useState<boolean>(false)

  // Estados de busca externa
  const [buscandoCnpj, setBuscandoCnpj] = useState<boolean>(false)
  const [buscandoCep, setBuscandoCep] = useState<boolean>(false)

  // Estados de envio
  const [enviando, setEnviando] = useState<boolean>(false)
  const [mensagemStatus, setMensagemStatus] = useState<string>('')
  const [erroBackend, setErroBackend] = useState<string>('')

  // Carregar lista de planos disponíveis
  useEffect(() => {
    let montado = true
    const carregar = async () => {
      try {
        setCarregandoPlanos(true)
        const lista = await listarPlanosPublicos()
        if (!montado) return
        setPlanos(lista)

        if (lista.length > 0) {
          // Se tiver plano na URL, tentar casar por id, por nome ou por etiqueta
          let selecionado = ''
          if (planoUrl) {
            const achadoPorId = lista.find((p) => p.id === planoUrl)
            const achadoPorNome = lista.find((p) => p.nome.toLowerCase() === planoUrl.toLowerCase())
            const achadoPorEtiqueta = lista.find(
              (p) => (p.etiqueta || '').toLowerCase() === planoUrl.toLowerCase(),
            )
            const achado = achadoPorId || achadoPorNome || achadoPorEtiqueta
            if (achado) {
              selecionado = achado.id
            }
          }

          // Se não encontrou pela URL, seleciona o primeiro
          if (!selecionado) {
            selecionado = lista[0].id
          }
          setPlanoSelecionadoId(selecionado)
        }
      } catch (err) {
        console.error('Erro ao carregar planos comerciais:', err)
      } finally {
        if (montado) setCarregandoPlanos(false)
      }
    }
    carregar()
    return () => {
      montado = false
    }
  }, [planoUrl])

  // Plano atualmente selecionado
  const planoAtivo = useMemo(() => {
    return planos.find((p) => p.id === planoSelecionadoId) || null
  }, [planos, planoSelecionadoId])

  // Validações locais
  const cnpjLimpo = useMemo(() => empCnpj.replace(/[^a-zA-Z0-9]/g, ''), [empCnpj])
  const cnpjValido = useMemo(() => {
    if (!empCnpj) return true
    return validarCNPJ(empCnpj)
  }, [empCnpj])

  const emailValido = useMemo(() => {
    if (!respEmail) return true
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(respEmail)
  }, [respEmail])

  const senhasConferem = useMemo(() => {
    if (!respSenhaConfirm) return true
    return respSenha === respSenhaConfirm
  }, [respSenha, respSenhaConfirm])

  const senhaTamanhoOk = useMemo(() => {
    if (!respSenha) return true
    return respSenha.length >= 8
  }, [respSenha])

  // Busca de CNPJ na BrasilAPI
  const handleConsultarCnpj = async () => {
    const limpo = empCnpj.replace(/[^a-zA-Z0-9]/g, '')
    if (limpo.length !== 14) {
      toast({
        title: 'CNPJ incompleto',
        description: 'Informe os 14 dígitos do CNPJ para buscar os dados cadastrais.',
        variant: 'destructive',
      })
      return
    }

    if (!validarCNPJ(empCnpj)) {
      toast({
        title: 'CNPJ inválido',
        description: 'Confira os dígitos informados antes de realizar a busca.',
        variant: 'destructive',
      })
      return
    }

    try {
      setBuscandoCnpj(true)
      const dados = await buscarBrasilApiCnpj(limpo)
      if (dados) {
        if (dados.razao_social) setEmpRazaoSocial(dados.razao_social)
        if (dados.nome_fantasia) {
          setEmpNomeFantasia(dados.nome_fantasia)
        } else if (dados.razao_social && !empNomeFantasia) {
          setEmpNomeFantasia(dados.razao_social)
        }

        if (dados.cep) setEmpCep(formatarCEP(dados.cep))
        if (dados.logradouro) setEmpLogradouro(dados.logradouro)
        if (dados.numero) setEmpNumero(dados.numero)
        if (dados.complemento) setEmpComplemento(dados.complemento)
        if (dados.bairro) setEmpBairro(dados.bairro)
        if (dados.municipio) setEmpMunicipio(dados.municipio)
        if (dados.uf) setEmpUf(dados.uf.toUpperCase())
        if (dados.codigo_municipio_ibge) {
          setEmpCodigoMunicipioIbge(String(dados.codigo_municipio_ibge))
        }

        if (dados.ddd_telefone_1 && !respTelefone) {
          setEmpCnpj((c) => formatarCNPJ(c))
          setRespTelefone(formatarTelefone(dados.ddd_telefone_1))
        }

        toast({
          title: 'Dados localizados!',
          description:
            'Informações preenchidas via BrasilAPI. Você pode editar qualquer campo se necessário.',
        })
      } else {
        toast({
          title: 'CNPJ não encontrado na BrasilAPI',
          description:
            'Não foi possível obter dados automáticos. Preencha os campos da empresa manualmente.',
        })
      }
    } catch (_) {
      toast({
        title: 'Consulta indisponível',
        description:
          'Serviço externo temporariamente instável. Você pode continuar preenchendo manualmente.',
      })
    } finally {
      setBuscandoCnpj(false)
    }
  }

  // Busca de CEP no ViaCEP
  const handleConsultarCep = async (cepParaBuscar?: string) => {
    const cepAlvo = cepParaBuscar !== undefined ? cepParaBuscar : empCep
    const limpo = cepAlvo.replace(/\D/g, '')
    if (limpo.length !== 8) {
      if (cepParaBuscar === undefined) {
        toast({
          title: 'CEP incompleto',
          description: 'Informe os 8 dígitos do CEP para buscar o endereço.',
          variant: 'destructive',
        })
      }
      return
    }

    try {
      setBuscandoCep(true)
      const end = await buscarViaCep(limpo)
      if (end && !end.erro) {
        if (end.logradouro) setEmpLogradouro(end.logradouro)
        if (end.bairro) setEmpBairro(end.bairro)
        if (end.localidade) setEmpMunicipio(end.localidade)
        if (end.uf) setEmpUf(end.uf.toUpperCase())
        if (end.ibge) setEmpCodigoMunicipioIbge(end.ibge)
        toast({
          title: 'Endereço encontrado!',
          description: `${end.logradouro}, ${end.bairro} - ${end.localidade}/${end.uf}`,
        })
      } else if (cepParaBuscar === undefined) {
        toast({
          title: 'CEP não encontrado',
          description: 'Confira o número digitado ou preencha o logradouro manualmente.',
        })
      }
    } catch (_) {
      // Falha não intrusiva
    } finally {
      setBuscandoCep(false)
    }
  }

  // Submissão do formulário
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErroBackend('')

    // Validações obrigatórias
    if (!termosAceitos) {
      toast({
        title: 'Termos de uso',
        description: 'É necessário concordar com os termos de uso para criar sua conta.',
        variant: 'destructive',
      })
      return
    }

    if (!planoSelecionadoId) {
      toast({
        title: 'Selecione um plano',
        description: 'Escolha um plano comercial para sua assinatura.',
        variant: 'destructive',
      })
      return
    }

    if (!respNome.trim()) {
      toast({
        title: 'Nome obrigatório',
        description: 'Informe o nome completo do responsável.',
        variant: 'destructive',
      })
      return
    }

    if (!respEmail.trim() || !emailValido) {
      toast({
        title: 'E-mail inválido',
        description: 'Informe um endereço de e-mail corporativo válido.',
        variant: 'destructive',
      })
      return
    }

    if (!respSenha || respSenha.length < 8) {
      toast({
        title: 'Senha fraca',
        description: 'A senha de acesso deve possuir pelo menos 8 caracteres.',
        variant: 'destructive',
      })
      return
    }

    if (respSenha !== respSenhaConfirm) {
      toast({
        title: 'Senhas divergentes',
        description: 'A confirmação de senha não confere com a senha informada.',
        variant: 'destructive',
      })
      return
    }

    if (!empRazaoSocial.trim()) {
      toast({
        title: 'Razão social obrigatória',
        description: 'Informe a Razão Social da empresa.',
        variant: 'destructive',
      })
      return
    }

    if (!empCnpj.trim() || !validarCNPJ(empCnpj)) {
      toast({
        title: 'CNPJ inválido',
        description: 'Confira os 14 dígitos e dígitos verificadores do CNPJ.',
        variant: 'destructive',
      })
      return
    }

    try {
      setEnviando(true)
      setMensagemStatus('Criando seu ambiente corporativo, empresa e configurações...')

      const payload = {
        plano_id: planoSelecionadoId,
        responsavel: {
          nome: respNome.trim(),
          email: respEmail.trim().toLowerCase(),
          telefone: respTelefone.trim() || undefined,
          whatsapp: respWhatsapp.trim() || undefined,
          senha: respSenha,
        },
        empresa: {
          razao_social: empRazaoSocial.trim(),
          nome_fantasia: (empNomeFantasia || empRazaoSocial).trim(),
          cnpj: formatarCNPJ(empCnpj),
          inscricao_estadual: (empInscricaoEstadual || 'ISENTO').trim(),
          crt: Number(empCrt) || 1,
          cep: empCep.trim() || undefined,
          logradouro: empLogradouro.trim() || undefined,
          numero: empNumero.trim() || 'S/N',
          complemento: empComplemento.trim() || undefined,
          bairro: empBairro.trim() || undefined,
          municipio: empMunicipio.trim() || undefined,
          codigo_municipio_ibge: empCodigoMunicipioIbge.trim() || undefined,
          uf: empUf.trim() || 'ES',
        },
        termos_aceitos: true,
      }

      const resposta = await cadastrarNovoAssinante(payload)

      if (!resposta.sucesso) {
        throw new Error(resposta.mensagem || 'Não foi possível concluir o cadastro.')
      }

      setMensagemStatus('Ambiente configurado com sucesso! Autenticando usuário...')

      // Autenticação direta no PocketBase com o e-mail e a senha criados
      try {
        await login(respEmail.trim().toLowerCase(), respSenha)
      } catch (loginErr: any) {
        console.warn('Falha no auto-login após cadastro:', loginErr)
        toast({
          title: 'Cadastro concluído com sucesso!',
          description:
            'Sua conta foi criada. Por favor, entre com seu e-mail e senha na tela de login.',
        })
        navigate('/login', { replace: true })
        return
      }

      // Se logou com sucesso, selecionar a empresa criada no EmpresaContext
      if (resposta.empresa_id) {
        try {
          selecionarEmpresa(resposta.empresa_id)
          await recarregarEmpresas()
        } catch {
          /* intentionally ignored */
        }
      }

      toast({
        title: 'Bem-vindo ao ERP Gestão Comercial!',
        description: `Seu ambiente corporativo (${resposta.numero_licenca}) foi ativado em período Trial.`,
      })

      // Redireciona direto para o painel operacional
      navigate('/painel', { replace: true })
    } catch (err: any) {
      console.error('Erro ao cadastrar novo assinante:', err)
      const msg =
        err?.data?.error ||
        err?.response?.error ||
        err?.message ||
        'Ocorreu um erro ao processar o cadastro. Verifique os dados e tente novamente.'
      setErroBackend(msg)
      toast({
        title: 'Não foi possível concluir o cadastro',
        description: msg,
        variant: 'destructive',
      })
    } finally {
      setEnviando(false)
      setMensagemStatus('')
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 text-slate-100 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Cabeçalho da Página Pública */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-400/20 text-indigo-300 text-xs font-semibold uppercase tracking-wider">
            <Sparkles size={14} className="text-indigo-400" />
            Experimente Grátis • Sem Cartão de Crédito
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            Comece a usar o <span className="text-indigo-400">ERP Gestão Comercial</span>
          </h1>
          <p className="text-sm sm:text-base text-slate-300 max-w-2xl mx-auto font-normal">
            Cadastre sua empresa em minutos e tenha controle completo de estoque, compras,
            financeiro, vendas, PDV e emissão fiscal com período de testes ativado.
          </p>
          <div className="pt-1">
            <Link
              to="/login"
              className="text-xs text-indigo-300 hover:text-indigo-200 underline underline-offset-4"
            >
              Já possui uma conta? Faça login aqui →
            </Link>
          </div>
        </div>

        {/* Mensagem de Erro do Backend em Destaque */}
        {erroBackend && (
          <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-start gap-3 text-rose-200 text-sm">
            <AlertCircle size={20} className="shrink-0 text-rose-400 mt-0.5" />
            <div className="flex-1">
              <strong className="font-semibold block text-rose-300">Atenção no cadastro:</strong>
              <span>{erroBackend}</span>
            </div>
            <button
              type="button"
              onClick={() => setErroBackend('')}
              className="text-xs text-rose-400 hover:text-rose-200 font-bold"
            >
              ✕
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* SEÇÃO 1: Escolha do Plano Comercial */}
          <Card className="bg-slate-800/80 border-slate-700/80 shadow-xl backdrop-blur-xs text-slate-100">
            <CardHeader className="border-b border-slate-700/60 pb-4">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg font-bold text-white flex items-center gap-2">
                    <Layers size={20} className="text-indigo-400" />
                    1. Escolha seu Plano Comercial
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-400">
                    Selecione o pacote que melhor atende à sua estrutura. Você pode mudar a qualquer
                    momento.
                  </CardDescription>
                </div>
                {planoAtivo && (
                  <Badge className="bg-indigo-600 text-white border-0 font-semibold text-xs">
                    Plano selecionado: {planoAtivo.nome}
                  </Badge>
                )}
              </div>
            </CardHeader>

            <CardContent className="pt-6">
              {carregandoPlanos ? (
                <div className="py-12 flex flex-col items-center justify-center gap-3 text-slate-400">
                  <Loader2 size={24} className="animate-spin text-indigo-400" />
                  <span className="text-xs font-medium">Carregando catálogo de planos...</span>
                </div>
              ) : planos.length === 0 ? (
                <div className="py-8 text-center text-slate-400 text-xs">
                  Nenhum plano comercial disponível no momento. Entre em contato com o suporte.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {planos.map((plano) => {
                    const marcado = plano.id === planoSelecionadoId
                    return (
                      <div
                        key={plano.id}
                        onClick={() => setPlanoSelecionadoId(plano.id)}
                        className={`cursor-pointer rounded-xl border p-4 transition-all relative flex flex-col justify-between ${
                          marcado
                            ? 'border-indigo-500 bg-indigo-950/40 shadow-lg ring-2 ring-indigo-500/50'
                            : 'border-slate-700 bg-slate-900/40 hover:border-slate-600 hover:bg-slate-900/70'
                        }`}
                      >
                        {/* Selo / Etiqueta */}
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div>
                            <span className="font-bold text-base text-white block">
                              {plano.nome}
                            </span>
                            {plano.etiqueta && (
                              <span className="inline-block px-2 py-0.5 rounded text-[10px] font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 mt-1">
                                {plano.etiqueta}
                              </span>
                            )}
                          </div>
                          <div
                            className={`h-5 w-5 rounded-full border flex items-center justify-center shrink-0 ${
                              marcado
                                ? 'border-indigo-400 bg-indigo-600 text-white'
                                : 'border-slate-600'
                            }`}
                          >
                            {marcado && <Check size={12} strokeWidth={3} />}
                          </div>
                        </div>

                        {/* Valor Mensal */}
                        <div className="my-3 py-2 border-y border-slate-700/60">
                          <div className="flex items-baseline gap-1">
                            <span className="text-xs text-slate-400">R$</span>
                            <span className="text-2xl font-black text-white">
                              {plano.valor_mensal.toLocaleString('pt-BR', {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}
                            </span>
                            <span className="text-xs text-slate-400">/mês</span>
                          </div>
                          <span className="text-[11px] text-emerald-400 font-medium block mt-0.5">
                            Comece com período de teste grátis
                          </span>
                        </div>

                        {/* Descrição */}
                        {plano.descricao && (
                          <p className="text-xs text-slate-400 mb-3 min-h-[32px]">
                            {plano.descricao}
                          </p>
                        )}

                        {/* Limites e Recursos */}
                        <div className="space-y-1.5 text-xs text-slate-300 pt-1">
                          <div className="flex items-center gap-1.5">
                            <CheckCircle2 size={14} className="text-emerald-400 shrink-0" />
                            <span>
                              {plano.limite_empresas === 0
                                ? 'Empresas ilimitadas'
                                : `Até ${plano.limite_empresas} ${
                                    plano.limite_empresas === 1 ? 'empresa' : 'empresas'
                                  }`}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <CheckCircle2 size={14} className="text-emerald-400 shrink-0" />
                            <span>
                              {plano.limite_usuarios === 0
                                ? 'Usuários ilimitados'
                                : `Até ${plano.limite_usuarios} usuários`}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5">
                            {plano.permite_nfe ? (
                              <CheckCircle2 size={14} className="text-emerald-400 shrink-0" />
                            ) : (
                              <span className="h-3.5 w-3.5 rounded-full border border-slate-600 inline-block shrink-0" />
                            )}
                            <span
                              className={plano.permite_nfe ? '' : 'text-slate-500 line-through'}
                            >
                              Emissão de NF-e (Mod. 55)
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5">
                            {plano.permite_nfce ? (
                              <CheckCircle2 size={14} className="text-emerald-400 shrink-0" />
                            ) : (
                              <span className="h-3.5 w-3.5 rounded-full border border-slate-600 inline-block shrink-0" />
                            )}
                            <span
                              className={plano.permite_nfce ? '' : 'text-slate-500 line-through'}
                            >
                              NFC-e e Frente de Caixa PDV
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5">
                            {plano.permite_sped ? (
                              <CheckCircle2 size={14} className="text-emerald-400 shrink-0" />
                            ) : (
                              <span className="h-3.5 w-3.5 rounded-full border border-slate-600 inline-block shrink-0" />
                            )}
                            <span
                              className={plano.permite_sped ? '' : 'text-slate-500 line-through'}
                            >
                              SPED Fiscal (EFD ICMS/IPI)
                            </span>
                          </div>
                        </div>

                        {/* Botão de seleção */}
                        <div className="mt-4 pt-3 border-t border-slate-700/60">
                          <Button
                            type="button"
                            size="sm"
                            variant={marcado ? 'default' : 'outline'}
                            onClick={(ev) => {
                              ev.stopPropagation()
                              setPlanoSelecionadoId(plano.id)
                            }}
                            className={`w-full text-xs font-semibold ${
                              marcado
                                ? 'bg-indigo-600 hover:bg-indigo-700 text-white'
                                : 'border-slate-700 text-slate-300 hover:bg-slate-800'
                            }`}
                          >
                            {marcado ? 'Plano Selecionado' : 'Selecionar este plano'}
                          </Button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* SEÇÃO 2: Dados do Responsável (Administrador) */}
          <Card className="bg-slate-800/80 border-slate-700/80 shadow-xl backdrop-blur-xs text-slate-100">
            <CardHeader className="border-b border-slate-700/60 pb-4">
              <CardTitle className="text-lg font-bold text-white flex items-center gap-2">
                <User size={20} className="text-indigo-400" />
                2. Dados do Responsável pela Conta
              </CardTitle>
              <CardDescription className="text-xs text-slate-400">
                Este será o usuário Administrador com acesso total irrestrito ao sistema.
              </CardDescription>
            </CardHeader>

            <CardContent className="pt-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Nome Completo */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-slate-300 flex items-center gap-1">
                    Nome Completo <span className="text-rose-400">*</span>
                  </Label>
                  <Input
                    placeholder="Ex: João da Silva"
                    value={respNome}
                    onChange={(e) => setRespNome(e.target.value)}
                    required
                    className="bg-slate-900/60 border-slate-700 text-white placeholder:text-slate-500 text-xs h-10"
                  />
                </div>

                {/* E-mail de Acesso */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-slate-300 flex items-center justify-between">
                    <span className="flex items-center gap-1">
                      <Mail size={13} className="text-slate-400" />
                      E-mail Corporativo (Login) <span className="text-rose-400">*</span>
                    </span>
                    {!emailValido && respEmail && (
                      <span className="text-[11px] text-rose-400 font-normal">E-mail inválido</span>
                    )}
                  </Label>
                  <Input
                    type="email"
                    placeholder="exemplo@suaempresa.com.br"
                    value={respEmail}
                    onChange={(e) => setRespEmail(e.target.value)}
                    required
                    className={`bg-slate-900/60 border-slate-700 text-white placeholder:text-slate-500 text-xs h-10 ${
                      !emailValido && respEmail ? 'border-rose-500' : ''
                    }`}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Telefone */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-slate-300 flex items-center gap-1">
                    <Phone size={13} className="text-slate-400" />
                    Telefone de Contato
                  </Label>
                  <Input
                    placeholder="(00) 0000-0000"
                    value={respTelefone}
                    onChange={(e) => setRespTelefone(formatarTelefone(e.target.value))}
                    className="bg-slate-900/60 border-slate-700 text-white placeholder:text-slate-500 text-xs h-10"
                  />
                </div>

                {/* WhatsApp */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-slate-300 flex items-center gap-1">
                    <Zap size={13} className="text-emerald-400" />
                    WhatsApp
                  </Label>
                  <Input
                    placeholder="(00) 90000-0000"
                    value={respWhatsapp}
                    onChange={(e) => setRespWhatsapp(formatarTelefone(e.target.value))}
                    className="bg-slate-900/60 border-slate-700 text-white placeholder:text-slate-500 text-xs h-10"
                  />
                </div>
              </div>

              {/* Senha e Confirmação */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-slate-300 flex items-center justify-between">
                    <span className="flex items-center gap-1">
                      <Lock size={13} className="text-slate-400" />
                      Senha de Acesso (Mín. 8 caracteres) <span className="text-rose-400">*</span>
                    </span>
                    {!senhaTamanhoOk && respSenha && (
                      <span className="text-[11px] text-rose-400 font-normal">
                        Mínimo 8 dígitos
                      </span>
                    )}
                  </Label>
                  <Input
                    type="password"
                    placeholder="••••••••"
                    value={respSenha}
                    onChange={(e) => setRespSenha(e.target.value)}
                    required
                    className={`bg-slate-900/60 border-slate-700 text-white placeholder:text-slate-500 text-xs h-10 ${
                      !senhaTamanhoOk && respSenha ? 'border-rose-500' : ''
                    }`}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-slate-300 flex items-center justify-between">
                    <span className="flex items-center gap-1">
                      <Lock size={13} className="text-slate-400" />
                      Confirme a Senha <span className="text-rose-400">*</span>
                    </span>
                    {!senhasConferem && respSenhaConfirm && (
                      <span className="text-[11px] text-rose-400 font-normal">
                        Senhas não conferem
                      </span>
                    )}
                  </Label>
                  <Input
                    type="password"
                    placeholder="••••••••"
                    value={respSenhaConfirm}
                    onChange={(e) => setRespSenhaConfirm(e.target.value)}
                    required
                    className={`bg-slate-900/60 border-slate-700 text-white placeholder:text-slate-500 text-xs h-10 ${
                      !senhasConferem && respSenhaConfirm ? 'border-rose-500' : ''
                    }`}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* SEÇÃO 3: Dados da Primeira Empresa (Matriz) */}
          <Card className="bg-slate-800/80 border-slate-700/80 shadow-xl backdrop-blur-xs text-slate-100">
            <CardHeader className="border-b border-slate-700/60 pb-4">
              <CardTitle className="text-lg font-bold text-white flex items-center gap-2">
                <Building2 size={20} className="text-indigo-400" />
                3. Dados da Primeira Empresa (Matriz)
              </CardTitle>
              <CardDescription className="text-xs text-slate-400">
                Informe o CNPJ para busca automática de dados cadastrais pela BrasilAPI. Você pode
                corrigir qualquer campo.
              </CardDescription>
            </CardHeader>

            <CardContent className="pt-6 space-y-4">
              {/* Linha CNPJ com Busca Automática */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                <div className="md:col-span-8 space-y-1.5">
                  <Label className="text-xs font-medium text-slate-300 flex items-center justify-between">
                    <span className="flex items-center gap-1">
                      CNPJ da Empresa <span className="text-rose-400">*</span>
                    </span>
                    {!cnpjValido && empCnpj && (
                      <span className="text-[11px] text-rose-400 font-normal">CNPJ inválido</span>
                    )}
                  </Label>
                  <Input
                    placeholder="00.000.000/0000-00"
                    value={empCnpj}
                    onChange={(e) => setEmpCnpj(formatarCNPJ(e.target.value))}
                    onBlur={() => {
                      if (cnpjLimpo.length === 14 && validarCNPJ(empCnpj) && !empRazaoSocial) {
                        handleConsultarCnpj()
                      }
                    }}
                    required
                    className={`bg-slate-900/60 border-slate-700 text-white placeholder:text-slate-500 text-xs h-10 ${
                      !cnpjValido && empCnpj ? 'border-rose-500' : ''
                    }`}
                  />
                </div>

                <div className="md:col-span-4">
                  <Button
                    type="button"
                    onClick={handleConsultarCnpj}
                    disabled={buscandoCnpj || cnpjLimpo.length !== 14}
                    className="w-full h-10 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white gap-2"
                  >
                    {buscandoCnpj ? (
                      <>
                        <Loader2 size={15} className="animate-spin" />
                        Buscando dados...
                      </>
                    ) : (
                      <>
                        <Search size={15} />
                        Buscar na BrasilAPI
                      </>
                    )}
                  </Button>
                </div>
              </div>

              {/* Razão Social e Nome Fantasia */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-slate-300 flex items-center gap-1">
                    Razão Social <span className="text-rose-400">*</span>
                  </Label>
                  <Input
                    placeholder="Razão Social completa"
                    value={empRazaoSocial}
                    onChange={(e) => setEmpRazaoSocial(e.target.value)}
                    required
                    className="bg-slate-900/60 border-slate-700 text-white placeholder:text-slate-500 text-xs h-10"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-slate-300">Nome Fantasia</Label>
                  <Input
                    placeholder="Nome Fantasia / Comercial"
                    value={empNomeFantasia}
                    onChange={(e) => setEmpNomeFantasia(e.target.value)}
                    className="bg-slate-900/60 border-slate-700 text-white placeholder:text-slate-500 text-xs h-10"
                  />
                </div>
              </div>

              {/* Inscrição Estadual e CRT */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-slate-300">
                    Inscrição Estadual (ou "ISENTO")
                  </Label>
                  <Input
                    placeholder="ISENTO ou número da IE"
                    value={empInscricaoEstadual}
                    onChange={(e) => setEmpInscricaoEstadual(e.target.value.toUpperCase())}
                    className="bg-slate-900/60 border-slate-700 text-white placeholder:text-slate-500 text-xs h-10 uppercase"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-slate-300">
                    CRT (Código de Regime Tributário)
                  </Label>
                  <Select value={empCrt} onValueChange={setEmpCrt}>
                    <SelectTrigger className="bg-slate-900/60 border-slate-700 text-white text-xs h-10">
                      <SelectValue placeholder="Selecione o CRT" />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-800 border-slate-700 text-white">
                      <SelectItem value="1">1 - Simples Nacional (Padrão ME/EPP)</SelectItem>
                      <SelectItem value="2">
                        2 - Simples Nacional com excesso de sublimite
                      </SelectItem>
                      <SelectItem value="3">3 - Regime Normal (Lucro Presumido / Real)</SelectItem>
                      <SelectItem value="4">4 - Simples Nacional - MEI</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Endereço: CEP com ViaCEP */}
              <div className="pt-2 border-t border-slate-700/60 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-300">
                    Endereço da Empresa Matriz
                  </span>
                  <span className="text-[11px] text-slate-400">Busca rápida via ViaCEP</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                  <div className="md:col-span-4 space-y-1.5">
                    <Label className="text-xs font-medium text-slate-300">CEP</Label>
                    <Input
                      placeholder="00000-000"
                      value={empCep}
                      onChange={(e) => {
                        const fmt = formatarCEP(e.target.value)
                        setEmpCep(fmt)
                        if (fmt.replace(/\D/g, '').length === 8) {
                          handleConsultarCep(fmt)
                        }
                      }}
                      className="bg-slate-900/60 border-slate-700 text-white placeholder:text-slate-500 text-xs h-10"
                    />
                  </div>

                  <div className="md:col-span-6 space-y-1.5">
                    <Label className="text-xs font-medium text-slate-300">Logradouro / Rua</Label>
                    <Input
                      placeholder="Avenida, Rua, Praça..."
                      value={empLogradouro}
                      onChange={(e) => setEmpLogradouro(e.target.value)}
                      className="bg-slate-900/60 border-slate-700 text-white placeholder:text-slate-500 text-xs h-10"
                    />
                  </div>

                  <div className="md:col-span-2 space-y-1.5">
                    <Label className="text-xs font-medium text-slate-300">Número</Label>
                    <Input
                      placeholder="Nº ou S/N"
                      value={empNumero}
                      onChange={(e) => setEmpNumero(e.target.value)}
                      className="bg-slate-900/60 border-slate-700 text-white placeholder:text-slate-500 text-xs h-10"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                  <div className="md:col-span-4 space-y-1.5">
                    <Label className="text-xs font-medium text-slate-300">Complemento</Label>
                    <Input
                      placeholder="Sala, Andar, Galpão..."
                      value={empComplemento}
                      onChange={(e) => setEmpComplemento(e.target.value)}
                      className="bg-slate-900/60 border-slate-700 text-white placeholder:text-slate-500 text-xs h-10"
                    />
                  </div>

                  <div className="md:col-span-4 space-y-1.5">
                    <Label className="text-xs font-medium text-slate-300">Bairro</Label>
                    <Input
                      placeholder="Bairro"
                      value={empBairro}
                      onChange={(e) => setEmpBairro(e.target.value)}
                      className="bg-slate-900/60 border-slate-700 text-white placeholder:text-slate-500 text-xs h-10"
                    />
                  </div>

                  <div className="md:col-span-3 space-y-1.5">
                    <Label className="text-xs font-medium text-slate-300">Município</Label>
                    <Input
                      placeholder="Cidade"
                      value={empMunicipio}
                      onChange={(e) => setEmpMunicipio(e.target.value)}
                      className="bg-slate-900/60 border-slate-700 text-white placeholder:text-slate-500 text-xs h-10"
                    />
                  </div>

                  <div className="md:col-span-1 space-y-1.5">
                    <Label className="text-xs font-medium text-slate-300">UF</Label>
                    <Input
                      maxLength={2}
                      placeholder="UF"
                      value={empUf}
                      onChange={(e) => setEmpUf(e.target.value.toUpperCase())}
                      className="bg-slate-900/60 border-slate-700 text-white placeholder:text-slate-500 text-xs h-10 uppercase text-center"
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* SEÇÃO 4: Aceite dos Termos de Uso e Botão de Ação */}
          <Card className="bg-slate-800/80 border-slate-700/80 shadow-xl backdrop-blur-xs text-slate-100">
            <CardContent className="p-6 space-y-6">
              {/* Checkbox Termos de Uso */}
              <div className="flex items-start gap-3 p-3 rounded-lg bg-slate-900/50 border border-slate-700/60">
                <Checkbox
                  id="termos"
                  checked={termosAceitos}
                  onCheckedChange={(checked) => setTermosAceitos(Boolean(checked))}
                  className="mt-0.5 border-slate-500 data-[state=checked]:bg-indigo-600 data-[state=checked]:border-indigo-600"
                />
                <label
                  htmlFor="termos"
                  className="text-xs text-slate-300 leading-relaxed cursor-pointer select-none"
                >
                  Declaro que li e concordo com os{' '}
                  <button
                    type="button"
                    onClick={() => setModalTermosAberto(true)}
                    className="text-indigo-400 hover:text-indigo-300 underline font-semibold"
                  >
                    Termos de Uso e Política de Privacidade
                  </button>{' '}
                  do sistema ERP Gestão Comercial, e confirmo a veracidade das informações
                  fornecidas para a criação da conta.
                </label>
              </div>

              {/* Botão de Envio */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
                <div className="text-xs text-slate-400 flex items-center gap-2">
                  <ShieldCheck size={16} className="text-emerald-400 shrink-0" />
                  <span>Seus dados são protegidos por criptografia de ponta a ponta.</span>
                </div>

                <Button
                  type="submit"
                  size="lg"
                  disabled={
                    enviando ||
                    !termosAceitos ||
                    !cnpjValido ||
                    !emailValido ||
                    !senhasConferem ||
                    !senhaTamanhoOk
                  }
                  className="w-full sm:w-auto h-12 px-8 text-sm font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg gap-2"
                >
                  {enviando ? (
                    <>
                      <Loader2 size={18} className="animate-spin" />
                      {mensagemStatus || 'Processando cadastro...'}
                    </>
                  ) : (
                    <>
                      Concluir Cadastro e Entrar no ERP
                      <ArrowRight size={18} />
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </form>

        {/* Rodapé da Página Pública */}
        <div className="text-center text-xs text-slate-500 space-y-1">
          <p>© {new Date().getFullYear()} ERP Gestão Comercial. Todos os direitos reservados.</p>
          <p>Ambiente em nuvem de alta disponibilidade multi-tenant com isolamento estrito.</p>
        </div>
      </div>

      {/* Modal de Termos de Uso */}
      <Dialog open={modalTermosAberto} onOpenChange={setModalTermosAberto}>
        <DialogContent className="max-w-2xl bg-slate-900 border-slate-700 text-slate-100 max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-white flex items-center gap-2">
              <FileText size={18} className="text-indigo-400" />
              Termos de Uso e Condições Gerais do SaaS
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-400">
              Leia atentamente os termos antes de concluir seu registro na plataforma.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 text-xs text-slate-300 leading-relaxed py-2">
            <div>
              <h4 className="font-semibold text-white mb-1">1. Objeto e Período de Testes</h4>
              <p>
                O ERP Gestão Comercial disponibiliza o acesso em modalidade Software as a Service
                (SaaS) com período de avaliação (Trial) gratuito. Durante o período de testes, todos
                os recursos do plano selecionado estarão disponíveis para validação operacional.
              </p>
            </div>

            <div>
              <h4 className="font-semibold text-white mb-1">2. Responsabilidade pelos Dados</h4>
              <p>
                O usuário é o único responsável pela precisão e veracidade dos dados fiscais,
                contábeis e cadastrais informados, incluindo documentos emitidos, tributação de
                itens e declarações enviadas aos órgãos competentes (SEFAZ, Receita Federal).
              </p>
            </div>

            <div>
              <h4 className="font-semibold text-white mb-1">
                3. Isolamento e Segurança (Multi-tenant)
              </h4>
              <p>
                Cada assinante possui ambiente estritamente isolado no nível de banco de dados.
                Nenhum dado cadastral ou financeiro é compartilhado com terceiros ou outros
                assinantes da plataforma.
              </p>
            </div>

            <div>
              <h4 className="font-semibold text-white mb-1">4. Limites de Uso</h4>
              <p>
                O uso do sistema deve respeitar os limites contratados de usuários e empresas ativas
                previstos no plano escolhido. A tentativa de burlar as regras de acesso ou segurança
                resultará na suspensão imediata da licença.
              </p>
            </div>

            <div>
              <h4 className="font-semibold text-white mb-1">5. Suporte e Cancelamento</h4>
              <p>
                Ao término do período Trial, a continuidade da utilização dependerá da ativação da
                assinatura comercial regular. Não havendo interesse, a conta poderá ser encerrada
                sem qualquer ônus ou cobrança prévia.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              onClick={() => {
                setTermosAceitos(true)
                setModalTermosAberto(false)
              }}
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold"
            >
              Li e Aceito os Termos
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
export default CadastroPublicoPage
