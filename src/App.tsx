import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from '@/components/ui/toaster'
import { Toaster as Sonner } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AuthProvider } from '@/contexts/AuthContext'
import { ConfiguracoesProvider } from '@/contexts/ConfiguracoesContext'
import { PermissoesProvider } from '@/contexts/PermissoesContext'
import { EmpresaProvider } from '@/contexts/EmpresaContext'
import { ProtectedRoute, PublicOnlyRoute, MasterRoute } from '@/components/RouteGuards'
import MasterPage from '@/pages/master/MasterPage'
import Layout from '@/components/Layout'
import RedirecionarRaiz from '@/components/destinoInicial'

// Páginas de Autenticação
import LoginScreen from '@/pages/auth/LoginScreen'
import ForgotPasswordScreen from '@/pages/auth/ForgotPasswordScreen'
import ResetPasswordScreen from '@/pages/auth/ResetPasswordScreen'
import VerifyEmailScreen from '@/pages/auth/VerifyEmailScreen'
import ConfirmEmailChangeScreen from '@/pages/auth/ConfirmEmailChangeScreen'
import CadastroPublicoPage from '@/pages/auth/CadastroPublicoPage'

// Páginas do Sistema
import Index from '@/pages/Index'
import EmpresasLista from '@/pages/cadastros/EmpresasLista'
import EmpresaForm from '@/pages/cadastros/EmpresaForm'
import PerfisAcessoLista from '@/pages/cadastros/PerfisAcessoLista'
import PerfilAcessoForm from '@/pages/cadastros/PerfilAcessoForm'
import UsuariosLista from '@/pages/cadastros/UsuariosLista'
import UsuarioForm from '@/pages/cadastros/UsuarioForm'
import UnidadesMedidaPage from '@/pages/cadastros/UnidadesMedidaPage'
import CondicoesPagamentoPage from '@/pages/cadastros/CondicoesPagamentoPage'
import CodigosFiscaisPage from '@/pages/cadastros/CodigosFiscaisPage'
import TabelasFiscaisHubPage from '@/pages/cadastros/TabelasFiscaisHubPage'
import NcmPage from '@/pages/cadastros/NcmPage'
import CestPage from '@/pages/cadastros/CestPage'
import CfopPage from '@/pages/cadastros/CfopPage'
import CfopConversaoPage from '@/pages/cadastros/CfopConversaoPage'
import PerfisTributariosPage from '@/pages/cadastros/PerfisTributariosPage'
import RegrasFiscaisNcmPage from '@/pages/cadastros/RegrasFiscaisNcmPage'
import MatrizIcmsPage from '@/pages/cadastros/MatrizIcmsPage'
import MarcasPage from '@/pages/cadastros/MarcasPage'
import NotasEntradaListaPage from '@/pages/compras/NotasEntradaListaPage'
import NotaEntradaConferenciaPage from '@/pages/compras/NotaEntradaConferenciaPage'
import NotaEntradaDigitacaoPage from '@/pages/compras/NotaEntradaDigitacaoPage'
import ItensCompradosPage from '@/pages/compras/ItensCompradosPage'
import LivroEntradasPage from '@/pages/compras/LivroEntradasPage'
import GruposCategoriasPage from '@/pages/cadastros/GruposCategoriasPage'
import ConfiguracoesGeralPage from '@/pages/configuracoes/ConfiguracoesGeralPage'
import ConfiguracaoFiscalPage from '@/pages/configuracoes/ConfiguracaoFiscalPage'
import IntegridadeEstoquePage from '@/pages/configuracoes/IntegridadeEstoquePage'
import LogAuditoriaPage from '@/pages/configuracoes/LogAuditoriaPage'
import MercadoLivrePage from '@/pages/configuracoes/MercadoLivrePage'
import TrayPage from '@/pages/configuracoes/TrayPage'
import PedidosCompraListaPage from '@/pages/compras/PedidosCompraListaPage'
import PedidoCompraFormPage from '@/pages/compras/PedidoCompraFormPage'
import PosicaoEstoquePage from '@/pages/estoque/PosicaoEstoquePage'
import SugestaoCompraPage from '@/pages/estoque/SugestaoCompraPage'
import KardexPage from '@/pages/estoque/KardexPage'
import LancamentosEstoquePage from '@/pages/estoque/LancamentosEstoquePage'
import LotesValidadePage from '@/pages/estoque/LotesValidadePage'
import TransferenciasListaPage from '@/pages/estoque/TransferenciasListaPage'
import TransferenciaFormPage from '@/pages/estoque/TransferenciaFormPage'
import InventariosListaPage from '@/pages/estoque/InventariosListaPage'
import InventarioNovoPage from '@/pages/estoque/InventarioNovoPage'
import InventarioDetalhePage from '@/pages/estoque/InventarioDetalhePage'
import ClientesLista from '@/pages/cadastros/ClientesLista'
import ClienteForm from '@/pages/cadastros/ClienteForm'
import FornecedoresLista from '@/pages/cadastros/FornecedoresLista'
import FornecedorForm from '@/pages/cadastros/FornecedorForm'
import ProdutosLista from '@/pages/cadastros/ProdutosLista'
import ProdutoForm from '@/pages/cadastros/ProdutoForm'
import ConferenciaFiscalPage from '@/pages/cadastros/ConferenciaFiscalPage'

// Páginas do Financeiro
import { ContasPagarPage } from '@/pages/financeiro/ContasPagarPage'
import { ContasReceberPage } from '@/pages/financeiro/ContasReceberPage'
import { ExtratoBancarioPage } from '@/pages/financeiro/ExtratoBancarioPage'
import { ConciliacaoBancariaPage } from '@/pages/financeiro/ConciliacaoBancariaPage'
import PlanoContasPage from '@/pages/financeiro/cadastros/PlanoContasPage'
import CentrosCustoPage from '@/pages/financeiro/cadastros/CentrosCustoPage'
import ContasFinanceirasPage from '@/pages/financeiro/cadastros/ContasFinanceirasPage'
import FormasPagamentoPage from '@/pages/financeiro/cadastros/FormasPagamentoPage'
import ConfiguracaoFinanceiraPage from '@/pages/financeiro/cadastros/ConfiguracaoFinanceiraPage'
import DrePage from '@/pages/financeiro/DrePage'
import { FluxoCaixaPage } from '@/pages/financeiro/FluxoCaixaPage'
import { InadimplenciaPage } from '@/pages/financeiro/InadimplenciaPage'
import IntegridadeFinanceiroPage from '@/pages/configuracoes/IntegridadeFinanceiroPage'

// Páginas de Vendas e PDV (Etapa 5)
import ConfigVendasPage from '@/pages/vendas/ConfigVendasPage'
import TerminaisPage from '@/pages/vendas/TerminaisPage'
import CaixaPage from '@/pages/vendas/CaixaPage'
import VendasListaPage from '@/pages/vendas/pedidos/VendasListaPage'
import VendaFormPage from '@/pages/vendas/pedidos/VendaFormPage'
import PdvPage from '@/pages/vendas/pdv/PdvPage'
import { TrocasDevolucoesPage } from '@/pages/vendas/TrocasDevolucoesPage'
import { ComissoesPage } from '@/pages/vendas/ComissoesPage'
import { ConsultasVendasPage } from '@/pages/vendas/ConsultasVendasPage'

// Páginas Fiscais (Etapa 6)
import ConfiguracaoEmissaoFiscalPage from '@/pages/fiscal/ConfiguracaoEmissaoFiscalPage'
import DocumentosFiscaisPage from '@/pages/fiscal/DocumentosFiscaisPage'
import IntermediadoresPage from '@/pages/fiscal/IntermediadoresPage'
import InutilizacaoPage from '@/pages/fiscal/InutilizacaoPage'
import ExportarXmlsPage from '@/pages/fiscal/ExportarXmlsPage'
import ConfiguracaoSpedPage from '@/pages/fiscal/ConfiguracaoSpedPage'
import SpedFiscalPage from '@/pages/fiscal/SpedFiscalPage'
import SpedRelatorioConferenciaPage from '@/pages/fiscal/SpedRelatorioConferenciaPage'
import LivroSaidasPage from '@/pages/fiscal/LivroSaidasPage'
import ResumoIcmsPage from '@/pages/fiscal/ResumoIcmsPage'

// Páginas de Relatórios (Etapa 8)
import CentralRelatoriosPage from '@/pages/relatorios/CentralRelatoriosPage'
import PainelGrupoPage from '@/pages/relatorios/PainelGrupoPage'
import VendasCanaisPage from '@/pages/relatorios/VendasCanaisPage'
import EstoqueGerencialPage from '@/pages/relatorios/EstoqueGerencialPage'
import ContasPagarPorVencimentoPage from '@/pages/relatorios/ContasPagarVencimentoPage'
import RelatorioPersonalizadoPage from '@/pages/relatorios/RelatorioPersonalizadoPage'

/**
 * PERMISSÕES DE ROTAS (fonte única: src/config/tabelaRotas.ts)
 *
 * O <GuardaRota> dentro do Layout.tsx envolve o <Outlet /> e resolve,
 * por localização (com suporte a :id), o módulo/ação exigidos por cada rota:
 *  - rota na tabela  -> pode(modulo, acaoMinima) da tabela;
 *  - rota FORA da tabela -> só administrador (perfis_acesso.administrador = true);
 *  - administrador    -> acesso total (regra do próprio pode()).
 * Rotas públicas (/login, /esqueci-senha, /redefinir-senha, /verify-email,
 * /confirm-email-change, /cadastro) ficam FORA do Layout, sem guard de permissão.
 */
const App = () => (
  <BrowserRouter>
    <AuthProvider>
      <ConfiguracoesProvider>
        <PermissoesProvider>
          <EmpresaProvider>
            <TooltipProvider>
              <Toaster />
              <Sonner />
              <Routes>
                {/* Rotas Públicas de Autenticação */}
                <Route
                  path="/login"
                  element={
                    <PublicOnlyRoute>
                      <LoginScreen />
                    </PublicOnlyRoute>
                  }
                />
                <Route
                  path="/cadastro"
                  element={
                    <PublicOnlyRoute>
                      <CadastroPublicoPage />
                    </PublicOnlyRoute>
                  }
                />
                <Route
                  path="/esqueci-senha"
                  element={
                    <PublicOnlyRoute>
                      <ForgotPasswordScreen />
                    </PublicOnlyRoute>
                  }
                />
                <Route
                  path="/redefinir-senha"
                  element={
                    <PublicOnlyRoute>
                      <ResetPasswordScreen />
                    </PublicOnlyRoute>
                  }
                />
                {/* Rota Protegida Exclusiva do Painel Master (Prompt 9.7a) */}
                <Route
                  path="/master"
                  element={
                    <MasterRoute>
                      <MasterPage />
                    </MasterRoute>
                  }
                />

                {/* Compatibilidade com rota inglesa caso chegue por links legados */}
                <Route path="/forgot-password" element={<Navigate to="/esqueci-senha" replace />} />
                <Route
                  path="/reset-password"
                  element={<Navigate to="/redefinir-senha" replace />}
                />
                <Route path="/verify-email" element={<VerifyEmailScreen />} />
                <Route path="/confirm-email-change" element={<ConfirmEmailChangeScreen />} />

                {/* Rotas Protegidas dentro do Layout — guard único pelo GuardaRota */}
                <Route
                  element={
                    <ProtectedRoute>
                      <Layout />
                    </ProtectedRoute>
                  }
                >
                  {/* Rota raiz: NUNCA passa pela exigência de módulo — resolve o
                      destino pelo perfil (admin/painel -> /painel; senão PDV; senão
                      primeira rota permitida do menu, ver destinoInicial.tsx) */}
                  <Route path="/" element={<RedirecionarRaiz />} />
                  <Route path="/painel" element={<Index />} />
                  <Route path="/painel-grupo" element={<PainelGrupoPage />} />
                  {/* Cadastros */}
                  <Route path="/cadastros/empresas" element={<EmpresasLista />} />
                  <Route path="/cadastros/empresas/novo" element={<EmpresaForm />} />
                  <Route path="/cadastros/empresas/:id/editar" element={<EmpresaForm />} />
                  {/* Usuários */}
                  <Route path="/cadastros/usuarios" element={<UsuariosLista />} />
                  <Route path="/cadastros/usuarios/novo" element={<UsuarioForm />} />
                  <Route path="/cadastros/usuarios/:id/editar" element={<UsuarioForm />} />
                  {/* Perfis de Acesso */}
                  <Route path="/cadastros/perfis-acesso" element={<PerfisAcessoLista />} />
                  <Route path="/cadastros/perfis-acesso/novo" element={<PerfilAcessoForm />} />
                  <Route
                    path="/cadastros/perfis-acesso/:id/editar"
                    element={<PerfilAcessoForm />}
                  />
                  <Route path="/cadastros/clientes" element={<ClientesLista />} />
                  <Route path="/cadastros/clientes/novo" element={<ClienteForm />} />
                  <Route path="/cadastros/clientes/:id/editar" element={<ClienteForm />} />
                  <Route path="/cadastros/fornecedores" element={<FornecedoresLista />} />
                  <Route path="/cadastros/fornecedores/novo" element={<FornecedorForm />} />
                  <Route path="/cadastros/fornecedores/:id/editar" element={<FornecedorForm />} />
                  <Route path="/cadastros/produtos" element={<ProdutosLista />} />
                  <Route
                    path="/cadastros/produtos/conferencia"
                    element={<ConferenciaFiscalPage />}
                  />
                  <Route path="/cadastros/produtos/novo" element={<ProdutoForm />} />
                  <Route path="/cadastros/produtos/:id/editar" element={<ProdutoForm />} />
                  <Route path="/cadastros/marcas" element={<MarcasPage />} />
                  <Route path="/cadastros/grupos-categorias" element={<GruposCategoriasPage />} />
                  <Route path="/cadastros/unidades-medida" element={<UnidadesMedidaPage />} />
                  <Route
                    path="/cadastros/condicoes-pagamento"
                    element={<CondicoesPagamentoPage />}
                  />
                  <Route path="/cadastros/tabelas-fiscais" element={<TabelasFiscaisHubPage />} />
                  <Route
                    path="/cadastros/tabelas-fiscais/codigos"
                    element={<CodigosFiscaisPage />}
                  />
                  <Route path="/cadastros/tabelas-fiscais/ncm" element={<NcmPage />} />
                  <Route path="/cadastros/tabelas-fiscais/cest" element={<CestPage />} />
                  <Route path="/cadastros/tabelas-fiscais/cfop" element={<CfopPage />} />
                  <Route
                    path="/cadastros/tabelas-fiscais/conversao-cfop"
                    element={<CfopConversaoPage />}
                  />
                  <Route
                    path="/cadastros/tabelas-fiscais/perfis"
                    element={<PerfisTributariosPage />}
                  />
                  <Route
                    path="/cadastros/tabelas-fiscais/regras-ncm"
                    element={<RegrasFiscaisNcmPage />}
                  />
                  <Route
                    path="/cadastros/tabelas-fiscais/matriz-icms"
                    element={<MatrizIcmsPage />}
                  />
                  {/* Financeiro: Contas a Pagar, Contas a Receber e Cadastros */}
                  <Route
                    path="/financeiro"
                    element={<Navigate to="/financeiro/contas-pagar" replace />}
                  />
                  <Route path="/financeiro/contas-pagar" element={<ContasPagarPage />} />
                  <Route path="/financeiro/receber" element={<ContasReceberPage />} />
                  <Route
                    path="/financeiro/contas-receber"
                    element={<Navigate to="/financeiro/receber" replace />}
                  />
                  <Route path="/financeiro/dre" element={<DrePage />} />
                  <Route path="/financeiro/fluxo-caixa" element={<FluxoCaixaPage />} />
                  <Route path="/financeiro/inadimplencia" element={<InadimplenciaPage />} />
                  <Route path="/financeiro/bancos" element={<ExtratoBancarioPage />} />
                  <Route
                    path="/financeiro/extrato"
                    element={<Navigate to="/financeiro/bancos" replace />}
                  />
                  <Route path="/financeiro/conciliacao" element={<ConciliacaoBancariaPage />} />
                  <Route
                    path="/financeiro/cadastros"
                    element={<Navigate to="/financeiro/cadastros/plano-contas" replace />}
                  />
                  <Route path="/financeiro/cadastros/plano-contas" element={<PlanoContasPage />} />
                  <Route
                    path="/financeiro/cadastros/centros-custo"
                    element={<CentrosCustoPage />}
                  />
                  <Route
                    path="/financeiro/cadastros/contas-bancarias"
                    element={<ContasFinanceirasPage />}
                  />
                  <Route
                    path="/financeiro/cadastros/formas-pagamento"
                    element={<FormasPagamentoPage />}
                  />
                  <Route
                    path="/financeiro/cadastros/configuracoes"
                    element={<ConfiguracaoFinanceiraPage />}
                  />
                  {/* Estoque */}
                  <Route path="/estoque" element={<Navigate to="/estoque/posicao" replace />} />
                  <Route path="/estoque/posicao" element={<PosicaoEstoquePage />} />
                  {/* Etapa 3: Compras */}
                  <Route path="/compras" element={<Navigate to="/compras/pedidos" replace />} />
                  <Route path="/compras/pedidos" element={<PedidosCompraListaPage />} />
                  <Route path="/compras/pedidos/novo" element={<PedidoCompraFormPage />} />
                  <Route path="/compras/pedidos/:id" element={<PedidoCompraFormPage />} />
                  <Route path="/compras/pedidos/:id/editar" element={<PedidoCompraFormPage />} />
                  {/* Notas Fiscais de Entrada */}
                  <Route path="/compras/notas-entrada" element={<NotasEntradaListaPage />} />
                  <Route
                    path="/compras/notas-entrada/digitar"
                    element={<NotaEntradaDigitacaoPage />}
                  />
                  <Route
                    path="/compras/notas-entrada/novo"
                    element={<NotaEntradaDigitacaoPage />}
                  />
                  <Route
                    path="/compras/notas-entrada/:id"
                    element={<NotaEntradaConferenciaPage />}
                  />
                  <Route
                    path="/compras/notas-entrada/:id/conferencia"
                    element={<NotaEntradaConferenciaPage />}
                  />
                  <Route path="/compras/itens-comprados" element={<ItensCompradosPage />} />
                  <Route path="/compras/livro-entradas" element={<LivroEntradasPage />} />
                  <Route path="/estoque/sugestao-compra" element={<SugestaoCompraPage />} />
                  <Route path="/estoque/inventarios" element={<InventariosListaPage />} />
                  <Route path="/estoque/inventarios/novo" element={<InventarioNovoPage />} />
                  <Route path="/estoque/inventarios/:id" element={<InventarioDetalhePage />} />
                  <Route path="/estoque/kardex" element={<KardexPage />} />
                  <Route path="/estoque/lancamentos" element={<LancamentosEstoquePage />} />
                  <Route path="/estoque/transferencias" element={<TransferenciasListaPage />} />
                  <Route path="/estoque/transferencias/novo" element={<TransferenciaFormPage />} />
                  <Route path="/estoque/transferencias/:id" element={<TransferenciaFormPage />} />
                  <Route path="/estoque/lotes" element={<LotesValidadePage />} />
                  {/* Vendas e PDV (Etapa 5) */}
                  <Route path="/vendas" element={<Navigate to="/vendas/pedidos" replace />} />
                  <Route path="/vendas/pedidos" element={<VendasListaPage />} />
                  <Route path="/vendas/pedidos/novo" element={<VendaFormPage />} />
                  <Route path="/vendas/pedidos/:id" element={<VendaFormPage />} />
                  <Route path="/vendas/pdv" element={<PdvPage />} />
                  <Route path="/vendas/caixa" element={<CaixaPage />} />
                  <Route path="/vendas/terminais" element={<TerminaisPage />} />
                  <Route path="/vendas/trocas" element={<TrocasDevolucoesPage />} />
                  <Route
                    path="/vendas/devolucoes"
                    element={<Navigate to="/vendas/trocas" replace />}
                  />
                  <Route path="/vendas/comissoes" element={<ComissoesPage />} />
                  <Route path="/vendas/consultas" element={<ConsultasVendasPage />} />
                  <Route path="/vendas/configuracoes" element={<ConfigVendasPage />} />
                  {/* Módulo Fiscal (Etapa 6) */}
                  <Route path="/fiscal" element={<Navigate to="/fiscal/configuracoes" replace />} />
                  <Route path="/fiscal/configuracoes" element={<ConfiguracaoEmissaoFiscalPage />} />
                  <Route path="/fiscal/documentos" element={<DocumentosFiscaisPage />} />
                  <Route path="/fiscal/intermediadores" element={<IntermediadoresPage />} />
                  <Route path="/fiscal/inutilizacao" element={<InutilizacaoPage />} />
                  <Route path="/fiscal/exportar-xmls" element={<ExportarXmlsPage />} />
                  <Route path="/fiscal/sped" element={<SpedFiscalPage />} />
                  <Route path="/fiscal/sped/configuracoes" element={<ConfiguracaoSpedPage />} />
                  <Route
                    path="/fiscal/sped/:id/relatorio"
                    element={<SpedRelatorioConferenciaPage />}
                  />
                  <Route path="/fiscal/livro-saidas" element={<LivroSaidasPage />} />
                  <Route path="/fiscal/resumo-icms" element={<ResumoIcmsPage />} />
                  {/* Relatórios (Etapa 8) */}
                  <Route path="/relatorios" element={<CentralRelatoriosPage />} />
                  <Route path="/relatorios/vendas-canais" element={<VendasCanaisPage />} />
                  <Route path="/relatorios/estoque-gerencial" element={<EstoqueGerencialPage />} />
                  <Route
                    path="/relatorios/contas-pagar"
                    element={<ContasPagarPorVencimentoPage />}
                  />
                  <Route
                    path="/relatorios/personalizado"
                    element={<RelatorioPersonalizadoPage />}
                  />
                  {/* Configurações */}
                  <Route
                    path="/configuracoes"
                    element={<Navigate to="/configuracoes/geral" replace />}
                  />
                  <Route path="/configuracoes/geral" element={<ConfiguracoesGeralPage />} />
                  <Route path="/configuracoes/fiscal" element={<ConfiguracaoFiscalPage />} />
                  <Route path="/configuracoes/tray" element={<TrayPage />} />
                  <Route path="/configuracoes/mercado-livre" element={<MercadoLivrePage />} />
                  <Route path="/configuracoes/auditoria" element={<LogAuditoriaPage />} />
                  <Route
                    path="/configuracoes/integridade-estoque"
                    element={<IntegridadeEstoquePage />}
                  />
                  <Route
                    path="/configuracoes/integridade-financeiro"
                    element={<IntegridadeFinanceiroPage />}
                  />
                </Route>

                {/* Rota desconhecida redireciona para /painel */}
                <Route path="*" element={<Navigate to="/painel" replace />} />
              </Routes>
            </TooltipProvider>
          </EmpresaProvider>
        </PermissoesProvider>
      </ConfiguracoesProvider>
    </AuthProvider>
  </BrowserRouter>
)

export default App
