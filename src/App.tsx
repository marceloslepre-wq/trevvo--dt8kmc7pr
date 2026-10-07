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
import CodigosFiscaisPage from '@/pages/cadastros/CodigosFiscaisPage'
import TabelasFiscaisHubPage from '@/pages/cadastros/TabelasFiscaisHubPage'
import NcmPage from '@/pages/cadastros/NcmPage'
import CestPage from '@/pages/cadastros/CestPage'
import CfopPage from '@/pages/cadastros/CfopPage'
import PerfisTributariosPage from '@/pages/cadastros/PerfisTributariosPage'
import MarcasPage from '@/pages/cadastros/MarcasPage'
import GruposCategoriasPage from '@/pages/cadastros/GruposCategoriasPage'
import ConfiguracoesGeralPage from '@/pages/configuracoes/ConfiguracoesGeralPage'
import LogAuditoriaPage from '@/pages/configuracoes/LogAuditoriaPage'
import ClientesLista from '@/pages/cadastros/ClientesLista'
import ClienteForm from '@/pages/cadastros/ClienteForm'
import FornecedoresLista from '@/pages/cadastros/FornecedoresLista'
import FornecedorForm from '@/pages/cadastros/FornecedorForm'
import ProdutosLista from '@/pages/cadastros/ProdutosLista'
import ProdutoForm from '@/pages/cadastros/ProdutoForm'
import ConferenciaFiscalPage from '@/pages/cadastros/ConferenciaFiscalPage'

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
                    path="/cadastros/tabelas-fiscais/perfis"
                    element={
                      <PermissaoGuard modulo="tabelas_fiscais" acao="ver">
                        <PerfisTributariosPage />
                      </PermissaoGuard>
                    }
                  />

                  {/* Configurações */}
                  <Route
                    path="/configuracoes"
                    element={<Navigate to="/configuracoes/geral" replace />}
                  />
                  <Route
                    path="/configuracoes/geral"
                    element={
                      <PermissaoGuard modulo="configuracoes" acao="ver">
                        <ConfiguracoesGeralPage />
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
