import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from '@/components/ui/toaster'
import { Toaster as Sonner } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AuthProvider } from '@/contexts/AuthContext'
import { ConfiguracoesProvider } from '@/contexts/ConfiguracoesContext'
import { PermissoesProvider } from '@/contexts/PermissoesContext'
import { EmpresaProvider } from '@/contexts/EmpresaContext'
import { ProtectedRoute, PublicOnlyRoute } from '@/components/RouteGuards'
import Layout from '@/components/Layout'
import PermissaoGuard from '@/components/PermissaoGuard'

// Páginas de Autenticação
import LoginScreen from '@/pages/auth/LoginScreen'
import ForgotPasswordScreen from '@/pages/auth/ForgotPasswordScreen'
import ResetPasswordScreen from '@/pages/auth/ResetPasswordScreen'
import VerifyEmailScreen from '@/pages/auth/VerifyEmailScreen'
import ConfirmEmailChangeScreen from '@/pages/auth/ConfirmEmailChangeScreen'

// Páginas do Sistema
import Index from '@/pages/Index'
import { PlaceholderPage } from '@/pages/PlaceholderPage'
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
                {/* Compatibilidade com rota inglesa caso chegue por links legados */}
                <Route path="/forgot-password" element={<Navigate to="/esqueci-senha" replace />} />
                <Route
                  path="/reset-password"
                  element={<Navigate to="/redefinir-senha" replace />}
                />
                <Route path="/verify-email" element={<VerifyEmailScreen />} />
                <Route path="/confirm-email-change" element={<ConfirmEmailChangeScreen />} />

                {/* Rotas Protegidas dentro do Layout */}
                <Route
                  element={
                    <ProtectedRoute>
                      <Layout />
                    </ProtectedRoute>
                  }
                >
                  {/* Rota raiz redireciona para /painel */}
                  <Route path="/" element={<Navigate to="/painel" replace />} />
                  <Route path="/painel" element={<Index />} />
                  {/* Cadastros */}
                  <Route
                    path="/cadastros/empresas"
                    element={
                      <PermissaoGuard modulo="empresas" acao="ver">
                        <EmpresasLista />
                      </PermissaoGuard>
                    }
                  />
                  <Route
                    path="/cadastros/empresas/novo"
                    element={
                      <PermissaoGuard modulo="empresas" acao="criar">
                        <EmpresaForm />
                      </PermissaoGuard>
                    }
                  />
                  <Route
                    path="/cadastros/empresas/:id/editar"
                    element={
                      <PermissaoGuard modulo="empresas" acao="editar">
                        <EmpresaForm />
                      </PermissaoGuard>
                    }
                  />
                  {/* Usuários */}
                  <Route
                    path="/cadastros/usuarios"
                    element={
                      <PermissaoGuard modulo="usuarios" acao="ver">
                        <UsuariosLista />
                      </PermissaoGuard>
                    }
                  />
                  <Route
                    path="/cadastros/usuarios/novo"
                    element={
                      <PermissaoGuard modulo="usuarios" acao="criar">
                        <UsuarioForm />
                      </PermissaoGuard>
                    }
                  />
                  <Route
                    path="/cadastros/usuarios/:id/editar"
                    element={
                      <PermissaoGuard modulo="usuarios" acao="editar">
                        <UsuarioForm />
                      </PermissaoGuard>
                    }
                  />
                  {/* Perfis de Acesso */}
                  <Route
                    path="/cadastros/perfis-acesso"
                    element={
                      <PermissaoGuard modulo="perfis_acesso" acao="ver">
                        <PerfisAcessoLista />
                      </PermissaoGuard>
                    }
                  />
                  <Route
                    path="/cadastros/perfis-acesso/novo"
                    element={
                      <PermissaoGuard modulo="perfis_acesso" acao="criar">
                        <PerfilAcessoForm />
                      </PermissaoGuard>
                    }
                  />
                  <Route
                    path="/cadastros/perfis-acesso/:id/editar"
                    element={
                      <PermissaoGuard modulo="perfis_acesso" acao="editar">
                        <PerfilAcessoForm />
                      </PermissaoGuard>
                    }
                  />
                  <Route
                    path="/cadastros/clientes"
                    element={
                      <PermissaoGuard modulo="clientes" acao="ver">
                        <ClientesLista />
                      </PermissaoGuard>
                    }
                  />
                  <Route
                    path="/cadastros/clientes/novo"
                    element={
                      <PermissaoGuard modulo="clientes" acao="criar">
                        <ClienteForm />
                      </PermissaoGuard>
                    }
                  />
                  <Route
                    path="/cadastros/clientes/:id/editar"
                    element={
                      <PermissaoGuard modulo="clientes" acao="editar">
                        <ClienteForm />
                      </PermissaoGuard>
                    }
                  />
                  <Route
                    path="/cadastros/fornecedores"
                    element={
                      <PermissaoGuard modulo="fornecedores" acao="ver">
                        <FornecedoresLista />
                      </PermissaoGuard>
                    }
                  />
                  <Route
                    path="/cadastros/fornecedores/novo"
                    element={
                      <PermissaoGuard modulo="fornecedores" acao="criar">
                        <FornecedorForm />
                      </PermissaoGuard>
                    }
                  />
                  <Route
                    path="/cadastros/fornecedores/:id/editar"
                    element={
                      <PermissaoGuard modulo="fornecedores" acao="editar">
                        <FornecedorForm />
                      </PermissaoGuard>
                    }
                  />
                  <Route
                    path="/cadastros/produtos"
                    element={
                      <PermissaoGuard modulo="produtos" acao="ver">
                        <ProdutosLista />
                      </PermissaoGuard>
                    }
                  />
                  <Route
                    path="/cadastros/produtos/conferencia"
                    element={
                      <PermissaoGuard modulo="produtos" acao="ver">
                        <ConferenciaFiscalPage />
                      </PermissaoGuard>
                    }
                  />
                  <Route
                    path="/cadastros/produtos/novo"
                    element={
                      <PermissaoGuard modulo="produtos" acao="criar">
                        <ProdutoForm />
                      </PermissaoGuard>
                    }
                  />
                  <Route
                    path="/cadastros/produtos/:id/editar"
                    element={
                      <PermissaoGuard modulo="produtos" acao="editar">
                        <ProdutoForm />
                      </PermissaoGuard>
                    }
                  />
                  <Route
                    path="/cadastros/marcas"
                    element={
                      <PermissaoGuard modulo="marcas" acao="ver">
                        <MarcasPage />
                      </PermissaoGuard>
                    }
                  />
                  <Route
                    path="/cadastros/grupos-categorias"
                    element={
                      <PermissaoGuard modulo="grupos_categorias" acao="ver">
                        <GruposCategoriasPage />
                      </PermissaoGuard>
                    }
                  />
                  <Route
                    path="/cadastros/unidades-medida"
                    element={
                      <PermissaoGuard modulo="unidades_medida" acao="ver">
                        <UnidadesMedidaPage />
                      </PermissaoGuard>
                    }
                  />
                  <Route
                    path="/cadastros/condicoes-pagamento"
                    element={
                      <PermissaoGuard modulo="condicoes_pagamento" acao="ver">
                        <CondicoesPagamentoPage />
                      </PermissaoGuard>
                    }
                  />
                  <Route
                    path="/cadastros/tabelas-fiscais"
                    element={
                      <PermissaoGuard modulo="tabelas_fiscais" acao="ver">
                        <TabelasFiscaisHubPage />
                      </PermissaoGuard>
                    }
                  />
                  <Route
                    path="/cadastros/tabelas-fiscais/codigos"
                    element={
                      <PermissaoGuard modulo="tabelas_fiscais" acao="ver">
                        <CodigosFiscaisPage />
                      </PermissaoGuard>
                    }
                  />
                  <Route
                    path="/cadastros/tabelas-fiscais/ncm"
                    element={
                      <PermissaoGuard modulo="tabelas_fiscais" acao="ver">
                        <NcmPage />
                      </PermissaoGuard>
                    }
                  />
                  <Route
                    path="/cadastros/tabelas-fiscais/cest"
                    element={
                      <PermissaoGuard modulo="tabelas_fiscais" acao="ver">
                        <CestPage />
                      </PermissaoGuard>
                    }
                  />
                  <Route
                    path="/cadastros/tabelas-fiscais/cfop"
                    element={
                      <PermissaoGuard modulo="tabelas_fiscais" acao="ver">
                        <CfopPage />
                      </PermissaoGuard>
                    }
                  />
                  <Route
                    path="/cadastros/tabelas-fiscais/conversao-cfop"
                    element={
                      <PermissaoGuard modulo="tabelas_fiscais" acao="ver">
                        <CfopConversaoPage />
                      </PermissaoGuard>
                    }
                  />
                  <Route
                    path="/cadastros/tabelas-fiscais/perfis"
                    element={
                      <PermissaoGuard modulo="tabelas_fiscais" acao="ver">
                        <PerfisTributariosPage />
                      </PermissaoGuard>
                    }
                  />
                  <Route
                    path="/cadastros/tabelas-fiscais/regras-ncm"
                    element={
                      <PermissaoGuard modulo="tabelas_fiscais" acao="ver">
                        <RegrasFiscaisNcmPage />
                      </PermissaoGuard>
                    }
                  />
                  <Route
                    path="/cadastros/tabelas-fiscais/matriz-icms"
                    element={
                      <PermissaoGuard modulo="tabelas_fiscais" acao="ver">
                        <MatrizIcmsPage />
                      </PermissaoGuard>
                    }
                  />
                  {/* Financeiro: Contas a Pagar, Contas a Receber e Cadastros */}
                  <Route
                    path="/financeiro"
                    element={<Navigate to="/financeiro/contas-pagar" replace />}
                  />
                  <Route
                    path="/financeiro/contas-pagar"
                    element={
                      <PermissaoGuard modulo="financeiro_pagar" acao="ver">
                        <ContasPagarPage />
                      </PermissaoGuard>
                    }
                  />
                  <Route
                    path="/financeiro/receber"
                    element={
                      <PermissaoGuard modulo="financeiro_receber" acao="ver">
                        <ContasReceberPage />
                      </PermissaoGuard>
                    }
                  />
                  <Route
                    path="/financeiro/contas-receber"
                    element={<Navigate to="/financeiro/receber" replace />}
                  />
                  <Route
                    path="/financeiro/dre"
                    element={
                      <PermissaoGuard modulo="financeiro_bancos" acao="ver">
                        <DrePage />
                      </PermissaoGuard>
                    }
                  />
                  <Route
                    path="/financeiro/fluxo-caixa"
                    element={
                      <PermissaoGuard modulo="financeiro_bancos" acao="ver">
                        <FluxoCaixaPage />
                      </PermissaoGuard>
                    }
                  />
                  <Route
                    path="/financeiro/inadimplencia"
                    element={
                      <PermissaoGuard modulo="financeiro_receber" acao="ver">
                        <InadimplenciaPage />
                      </PermissaoGuard>
                    }
                  />
                  <Route
                    path="/financeiro/bancos"
                    element={
                      <PermissaoGuard modulo="financeiro_bancos" acao="ver">
                        <ExtratoBancarioPage />
                      </PermissaoGuard>
                    }
                  />
                  <Route
                    path="/financeiro/extrato"
                    element={<Navigate to="/financeiro/bancos" replace />}
                  />
                  <Route
                    path="/financeiro/conciliacao"
                    element={
                      <PermissaoGuard modulo="financeiro_bancos" acao="ver">
                        <ConciliacaoBancariaPage />
                      </PermissaoGuard>
                    }
                  />
                  <Route
                    path="/financeiro/cadastros"
                    element={<Navigate to="/financeiro/cadastros/plano-contas" replace />}
                  />
                  <Route
                    path="/financeiro/cadastros/plano-contas"
                    element={
                      <PermissaoGuard modulo="financeiro_bancos" acao="ver">
                        <PlanoContasPage />
                      </PermissaoGuard>
                    }
                  />
                  <Route
                    path="/financeiro/cadastros/centros-custo"
                    element={
                      <PermissaoGuard modulo="financeiro_bancos" acao="ver">
                        <CentrosCustoPage />
                      </PermissaoGuard>
                    }
                  />
                  <Route
                    path="/financeiro/cadastros/contas-bancarias"
                    element={
                      <PermissaoGuard modulo="financeiro_bancos" acao="ver">
                        <ContasFinanceirasPage />
                      </PermissaoGuard>
                    }
                  />
                  <Route
                    path="/financeiro/cadastros/formas-pagamento"
                    element={
                      <PermissaoGuard modulo="financeiro_bancos" acao="ver">
                        <FormasPagamentoPage />
                      </PermissaoGuard>
                    }
                  />
                  <Route
                    path="/financeiro/cadastros/configuracoes"
                    element={
                      <PermissaoGuard modulo="financeiro_bancos" acao="ver">
                        <ConfiguracaoFinanceiraPage />
                      </PermissaoGuard>
                    }
                  />
                  {/* Estoque */}
                  <Route path="/estoque" element={<Navigate to="/estoque/posicao" replace />} />
                  <Route
                    path="/estoque/posicao"
                    element={
                      <PermissaoGuard modulo="estoque" acao="ver">
                        <PosicaoEstoquePage />
                      </PermissaoGuard>
                    }
                  />
                  {/* Etapa 3: Compras */}
                  <Route path="/compras" element={<Navigate to="/compras/pedidos" replace />} />
                  <Route
                    path="/compras/pedidos"
                    element={
                      <PermissaoGuard modulo="compras" acao="ver">
                        <PedidosCompraListaPage />
                      </PermissaoGuard>
                    }
                  />
                  <Route
                    path="/compras/pedidos/novo"
                    element={
                      <PermissaoGuard modulo="compras" acao="criar">
                        <PedidoCompraFormPage />
                      </PermissaoGuard>
                    }
                  />
                  <Route
                    path="/compras/pedidos/:id"
                    element={
                      <PermissaoGuard modulo="compras" acao="ver">
                        <PedidoCompraFormPage />
                      </PermissaoGuard>
                    }
                  />
                  <Route
                    path="/compras/pedidos/:id/editar"
                    element={
                      <PermissaoGuard modulo="compras" acao="editar">
                        <PedidoCompraFormPage />
                      </PermissaoGuard>
                    }
                  />
                  {/* Notas Fiscais de Entrada */}
                  <Route
                    path="/compras/notas-entrada"
                    element={
                      <PermissaoGuard modulo="notas_entrada" acao="ver">
                        <NotasEntradaListaPage />
                      </PermissaoGuard>
                    }
                  />
                  <Route
                    path="/compras/notas-entrada/digitar"
                    element={
                      <PermissaoGuard modulo="notas_entrada" acao="criar">
                        <NotaEntradaDigitacaoPage />
                      </PermissaoGuard>
                    }
                  />
                  <Route
                    path="/compras/notas-entrada/:id"
                    element={
                      <PermissaoGuard modulo="notas_entrada" acao="ver">
                        <NotaEntradaConferenciaPage />
                      </PermissaoGuard>
                    }
                  />
                  <Route
                    path="/compras/notas-entrada/:id/conferencia"
                    element={
                      <PermissaoGuard modulo="notas_entrada" acao="ver">
                        <NotaEntradaConferenciaPage />
                      </PermissaoGuard>
                    }
                  />
                  <Route
                    path="/compras/itens-comprados"
                    element={
                      <PermissaoGuard modulo="compras" acao="ver">
                        <ItensCompradosPage />
                      </PermissaoGuard>
                    }
                  />
                  <Route
                    path="/compras/livro-entradas"
                    element={
                      <PermissaoGuard modulo="notas_entrada" acao="ver">
                        <LivroEntradasPage />
                      </PermissaoGuard>
                    }
                  />
                  <Route
                    path="/estoque/sugestao-compra"
                    element={
                      <PermissaoGuard modulo="estoque" acao="ver">
                        <SugestaoCompraPage />
                      </PermissaoGuard>
                    }
                  />
                  <Route
                    path="/estoque/inventarios"
                    element={
                      <PermissaoGuard modulo="estoque" acao="ver">
                        <InventariosListaPage />
                      </PermissaoGuard>
                    }
                  />
                  <Route
                    path="/estoque/inventarios/novo"
                    element={
                      <PermissaoGuard modulo="estoque" acao="criar">
                        <InventarioNovoPage />
                      </PermissaoGuard>
                    }
                  />
                  <Route
                    path="/estoque/inventarios/:id"
                    element={
                      <PermissaoGuard modulo="estoque" acao="ver">
                        <InventarioDetalhePage />
                      </PermissaoGuard>
                    }
                  />
                  <Route
                    path="/estoque/kardex"
                    element={
                      <PermissaoGuard modulo="estoque" acao="ver">
                        <KardexPage />
                      </PermissaoGuard>
                    }
                  />
                  <Route
                    path="/estoque/lancamentos"
                    element={
                      <PermissaoGuard modulo="estoque" acao="criar">
                        <LancamentosEstoquePage />
                      </PermissaoGuard>
                    }
                  />
                  <Route
                    path="/estoque/transferencias"
                    element={
                      <PermissaoGuard modulo="estoque" acao="ver">
                        <TransferenciasListaPage />
                      </PermissaoGuard>
                    }
                  />
                  <Route
                    path="/estoque/transferencias/novo"
                    element={
                      <PermissaoGuard modulo="estoque" acao="criar">
                        <TransferenciaFormPage />
                      </PermissaoGuard>
                    }
                  />
                  <Route
                    path="/estoque/transferencias/:id"
                    element={
                      <PermissaoGuard modulo="estoque" acao="ver">
                        <TransferenciaFormPage />
                      </PermissaoGuard>
                    }
                  />
                  <Route
                    path="/estoque/lotes"
                    element={
                      <PermissaoGuard modulo="estoque" acao="ver">
                        <LotesValidadePage />
                      </PermissaoGuard>
                    }
                  />
                  {/* Vendas e PDV (Etapa 5) */}
                  <Route path="/vendas" element={<Navigate to="/vendas/pedidos" replace />} />
                  <Route
                    path="/vendas/pedidos"
                    element={
                      <PermissaoGuard modulo="vendas" acao="ver">
                        <VendasListaPage />
                      </PermissaoGuard>
                    }
                  />
                  <Route
                    path="/vendas/pedidos/novo"
                    element={
                      <PermissaoGuard modulo="vendas" acao="criar">
                        <VendaFormPage />
                      </PermissaoGuard>
                    }
                  />
                  <Route
                    path="/vendas/pedidos/:id"
                    element={
                      <PermissaoGuard modulo="vendas" acao="ver">
                        <VendaFormPage />
                      </PermissaoGuard>
                    }
                  />
                  <Route
                    path="/vendas/pdv"
                    element={
                      <PermissaoGuard modulo="pdv" acao="ver">
                        <PdvPage />
                      </PermissaoGuard>
                    }
                  />
                  <Route
                    path="/vendas/caixa"
                    element={
                      <PermissaoGuard modulo="caixa" acao="ver">
                        <CaixaPage />
                      </PermissaoGuard>
                    }
                  />
                  <Route
                    path="/vendas/terminais"
                    element={
                      <PermissaoGuard modulo="caixa" acao="ver">
                        <TerminaisPage />
                      </PermissaoGuard>
                    }
                  />
                  <Route
                    path="/vendas/trocas"
                    element={
                      <PermissaoGuard modulo="vendas" acao="criar">
                        <TrocasDevolucoesPage />
                      </PermissaoGuard>
                    }
                  />
                  <Route
                    path="/vendas/devolucoes"
                    element={<Navigate to="/vendas/trocas" replace />}
                  />
                  <Route
                    path="/vendas/comissoes"
                    element={
                      <PermissaoGuard modulo="vendas" acao="ver">
                        <ComissoesPage />
                      </PermissaoGuard>
                    }
                  />
                  <Route
                    path="/vendas/consultas"
                    element={
                      <PermissaoGuard modulo="vendas" acao="ver">
                        <ConsultasVendasPage />
                      </PermissaoGuard>
                    }
                  />
                  <Route
                    path="/vendas/configuracoes"
                    element={
                      <PermissaoGuard modulo="vendas" acao="ver">
                        <ConfigVendasPage />
                      </PermissaoGuard>
                    }
                  />
                  {/* Módulo Fiscal (Etapa 6) */}
                  <Route path="/fiscal" element={<Navigate to="/fiscal/configuracoes" replace />} />
                  <Route
                    path="/fiscal/configuracoes"
                    element={
                      <PermissaoGuard modulo="notas_saida" acao="ver">
                        <ConfiguracaoEmissaoFiscalPage />
                      </PermissaoGuard>
                    }
                  />
                  <Route
                    path="/fiscal/documentos"
                    element={
                      <PermissaoGuard modulo="notas_saida" acao="ver">
                        <DocumentosFiscaisPage />
                      </PermissaoGuard>
                    }
                  />
                  <Route
                    path="/fiscal/intermediadores"
                    element={
                      <PermissaoGuard modulo="notas_saida" acao="ver">
                        <IntermediadoresPage />
                      </PermissaoGuard>
                    }
                  />
                  <Route path="/fiscal/inutilizacao" element={<InutilizacaoPage />} />
                  {/* Configurações */}
                  <Route
                    path="/configuracoes"
                    element={<Navigate to="/configuracoes/geral" replace />}
                  />{' '}
                  <Route
                    path="/configuracoes/geral"
                    element={
                      <PermissaoGuard modulo="configuracoes" acao="ver">
                        <ConfiguracoesGeralPage />
                      </PermissaoGuard>
                    }
                  />
                  <Route
                    path="/configuracoes/fiscal"
                    element={
                      <PermissaoGuard modulo="config_fiscal" acao="ver">
                        <ConfiguracaoFiscalPage />
                      </PermissaoGuard>
                    }
                  />
                  <Route
                    path="/configuracoes/auditoria"
                    element={
                      <PermissaoGuard modulo="configuracoes" acao="ver">
                        <LogAuditoriaPage />
                      </PermissaoGuard>
                    }
                  />
                  <Route
                    path="/configuracoes/integridade-estoque"
                    element={
                      <PermissaoGuard modulo="configuracoes" acao="ver">
                        <IntegridadeEstoquePage />
                      </PermissaoGuard>
                    }
                  />
                  <Route
                    path="/configuracoes/integridade-financeiro"
                    element={
                      <PermissaoGuard modulo="configuracoes" acao="ver">
                        <IntegridadeFinanceiroPage />
                      </PermissaoGuard>
                    }
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
