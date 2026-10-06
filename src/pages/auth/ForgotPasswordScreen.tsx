import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Mail, Loader2, CheckCircle2 } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/hooks/use-toast'
import { Logo } from '@/components/Logo'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { requestPasswordReset } = useAuth()
  const { toast } = useToast()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) {
      setError('E-mail é obrigatório.')
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Informe um e-mail válido.')
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      await requestPasswordReset(email)
      setSubmitted(true)
      toast({
        title: 'Solicitação enviada',
        description: 'Se existir uma conta com este e-mail, enviaremos um link de recuperação.',
      })
    } catch {
      // Por segurança nunca expomos se o e-mail existe
      setSubmitted(true)
      toast({
        title: 'Solicitação enviada',
        description: 'Se existir uma conta com este e-mail, enviaremos um link de recuperação.',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 p-4 font-sans text-slate-900">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-6">
          <Logo size="lg" />
        </div>

        <Card className="border-slate-200 shadow-md bg-white">
          <CardHeader className="space-y-1 text-center pb-6">
            <CardTitle className="text-xl font-bold tracking-tight text-slate-900">
              Recuperar Senha
            </CardTitle>
            <CardDescription className="text-sm text-slate-600">
              {submitted
                ? 'Verifique sua caixa de entrada'
                : 'Informe seu e-mail cadastrado para receber instruções de recuperação'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {submitted ? (
              <div className="space-y-4 text-center py-2">
                <div className="mx-auto w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <p className="text-sm text-slate-600">
                  Se existir uma conta com o e-mail{' '}
                  <strong className="text-slate-800 font-medium">{email}</strong>, você receberá um
                  link com instruções para redefinir sua senha em instantes.
                </p>
                <div className="pt-2">
                  <Button asChild variant="outline" className="w-full border-slate-300">
                    <Link to="/login" className="inline-flex items-center justify-center gap-2">
                      <ArrowLeft className="h-4 w-4" />
                      Voltar ao Login
                    </Link>
                  </Button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                <div className="space-y-1.5">
                  <Label htmlFor="email" className="text-sm font-medium text-slate-700">
                    E-mail cadastrado
                  </Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input
                      id="email"
                      type="email"
                      autoComplete="email"
                      placeholder="seu.email@empresa.com.br"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value)
                        if (error) setError(null)
                      }}
                      className={`pl-9 border-slate-300 focus-visible:border-blue-600 focus-visible:ring-blue-100 ${
                        error ? 'border-red-500 focus-visible:ring-red-100' : ''
                      }`}
                      disabled={isSubmitting}
                    />
                  </div>
                  {error && <p className="text-xs text-red-600">{error}</p>}
                </div>

                <Button
                  type="submit"
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium transition-colors h-10 shadow-sm"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Enviando...
                    </>
                  ) : (
                    'Enviar link de recuperação'
                  )}
                </Button>

                <div className="pt-2 text-center">
                  <Link
                    to="/login"
                    className="inline-flex items-center text-xs font-medium text-slate-600 hover:text-slate-900 gap-1"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                    Voltar para a página de login
                  </Link>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
