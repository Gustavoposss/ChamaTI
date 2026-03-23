import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import './App.css'
import { supabase } from './supabaseClient'

const PRIORIDADES = ['Baixa', 'Média', 'Alta']
const TIPOS_PROBLEMA = ['Impressora', 'Computador', 'Rede', 'Material', 'Outro']
const STATUS = ['Aberto', 'Em andamento', 'Aguardando material', 'Concluído']
const TI_ACCESS_CODE = import.meta.env.VITE_TI_ACCESS_CODE || 'hmc-ti'

function formatarId(id) {
  if (id == null) return ''
  const numero = Number(id)
  if (Number.isNaN(numero)) return String(id)
  return String(numero).padStart(3, '0')
}

function prioridadeToClass(prioridade) {
  if (prioridade === 'Alta') return 'prioridade-alta'
  if (prioridade === 'Média') return 'prioridade-media'
  return 'prioridade-baixa'
}

function statusToClass(status) {
  const normalized = status.toLowerCase()
  if (normalized.startsWith('aberto')) return 'status-aberto'
  if (normalized.startsWith('em')) return 'status-andamento'
  if (normalized.startsWith('aguardando')) return 'status-aguardando'
  if (normalized.startsWith('concluído') || normalized.startsWith('concluido')) {
    return 'status-concluido'
  }
  return 'status-aberto'
}

function statusDotClass(status) {
  const normalized = status.toLowerCase()
  if (normalized.startsWith('aberto')) return 'aberto'
  if (normalized.startsWith('em')) return 'andamento'
  if (normalized.startsWith('aguardando')) return 'aguardando'
  if (normalized.startsWith('concluído') || normalized.startsWith('concluido')) {
    return 'concluido'
  }
  return 'aberto'
}

function App({ initialView = 'abrir' }) {
  const navigate = useNavigate()
  const location = useLocation()

  const [view, setView] = useState(initialView)
  const [tickets, setTickets] = useState([])
  const [selectedTicketId, setSelectedTicketId] = useState(null)

  const [loadingTickets, setLoadingTickets] = useState(true)
  const [errorTickets, setErrorTickets] = useState(null)
  const [isOnline, setIsOnline] = useState(() => navigator.onLine)

  const [tecnicoAtual, setTecnicoAtual] = useState(() => {
    const salvo = window.localStorage.getItem('chameti-tecnico-atual')
    return salvo || 'João'
  })

  const [filtroStatus, setFiltroStatus] = useState('todos')
  const [filtroPrioridade, setFiltroPrioridade] = useState('todos')
  const [filtroSetor, setFiltroSetor] = useState('todos')

  const [submitting, setSubmitting] = useState(false)
  const [formErrors, setFormErrors] = useState({})
  const [toast, setToast] = useState(null)
  const [submitSuccessModal, setSubmitSuccessModal] = useState({
    open: false,
    ticketId: null,
    openTickets: 0
  })
  const submitLockRef = useRef(false)
  const lastSubmissionRef = useRef({ signature: '', at: 0 })
  const DUPLICATE_GUARD_WINDOW_MS = 60000

  const [tiAutenticado, setTiAutenticado] = useState(false)
  const [senhaTi, setSenhaTi] = useState('')
  const [loginError, setLoginError] = useState(null)
  const [loginSubmitting, setLoginSubmitting] = useState(false)

  const ticketSelecionado = useMemo(
    () => tickets.find((t) => t.id === selectedTicketId) ?? null,
    [tickets, selectedTicketId]
  )

  const setoresUnicos = useMemo(() => {
    const set = new Set(tickets.map((t) => t.setor))
    return Array.from(set)
  }, [tickets])

  const ticketsFiltrados = useMemo(() => {
    return tickets
      .filter((t) => (filtroStatus === 'todos' ? true : t.status === filtroStatus))
      .filter((t) => (filtroPrioridade === 'todos' ? true : t.prioridade === filtroPrioridade))
      .filter((t) => (filtroSetor === 'todos' ? true : t.setor === filtroSetor))
      .sort((a, b) => {
        const ordemPrioridade = { Alta: 0, Média: 1, Baixa: 2 }
        const pa = ordemPrioridade[a.prioridade] ?? 3
        const pb = ordemPrioridade[b.prioridade] ?? 3
        if (pa !== pb) return pa - pb
        return (Number(a.id) || 0) - (Number(b.id) || 0)
      })
  }, [tickets, filtroStatus, filtroPrioridade, filtroSetor])

  async function recarregarChamados({ silent = false } = {}) {
    if (!navigator.onLine) {
      setIsOnline(false)
      setErrorTickets('Sem conexão com a internet. Verifique sua rede e tente novamente.')
      if (!silent) {
        setLoadingTickets(false)
      }
      return
    }

    if (!silent) {
      setLoadingTickets(true)
      setErrorTickets(null)
    }

    const { data, error } = await supabase
      .from('chamados')
      .select('*')
      .order('id', { ascending: false })

    if (error) {
      const networkError =
        error?.message?.toLowerCase().includes('failed to fetch') ||
        error?.message?.toLowerCase().includes('network')

      if (networkError) {
        setErrorTickets('Falha de rede ao carregar chamados. Verifique sua conexão.')
      } else {
        // eslint-disable-next-line no-console
        console.error('Erro ao carregar chamados:', error)
        setErrorTickets('Não foi possível carregar os chamados. Tente novamente em alguns segundos.')
      }
      if (!silent) {
        setLoadingTickets(false)
      }
      return
    }

    setTickets(data || [])
    if (!selectedTicketId && data && data.length > 0) {
      setSelectedTicketId(data[0].id)
    }
    if (!silent) {
      setLoadingTickets(false)
    }
  }

  useEffect(() => {
    recarregarChamados()
  }, [])

  useEffect(() => {
    const onOnline = () => {
      setIsOnline(true)
      setErrorTickets(null)
      recarregarChamados({ silent: true })
    }
    const onOffline = () => {
      setIsOnline(false)
      setErrorTickets('Sem conexão com a internet. Verifique sua rede e tente novamente.')
    }

    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)

    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [])

  // Mantém o nome do técnico entre atualizações e recargas de página.
  useEffect(() => {
    window.localStorage.setItem('chameti-tecnico-atual', tecnicoAtual)
  }, [tecnicoAtual])

  // Atualização automática dos chamados sem precisar F5.
  useEffect(() => {
    if (!navigator.onLine) return undefined

    const channel = supabase
      .channel('chamados-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'chamados' },
        () => {
          recarregarChamados({ silent: true })
        }
      )
      .subscribe()

    // Fallback para ambientes onde realtime esteja desativado.
    const pollId = window.setInterval(() => {
      if (!navigator.onLine) return
      recarregarChamados({ silent: true })
    }, 15000)

    return () => {
      window.clearInterval(pollId)
      supabase.removeChannel(channel)
    }
  }, [])

  useEffect(() => {
    if (location.pathname === '/ti') {
      const token = window.localStorage.getItem('chameti-ti-auth')
      if (token === 'ok') {
        setTiAutenticado(true)
      }
    }
  }, [location.pathname])

  useEffect(() => {
    if (!toast) return
    const id = window.setTimeout(() => setToast(null), 4000)
    return () => window.clearTimeout(id)
  }, [toast])

  useEffect(() => {
    document.title =
      location.pathname === '/ti'
        ? 'ChameTI | Painel da TI'
        : 'ChameTI | Abrir Chamado'
  }, [location.pathname])

  async function handleCriarChamado(dados) {
    const dataAgora = new Date().toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })

    const novo = {
      solicitante: dados.nome,
      setor: dados.setor,
      tipo: dados.tipo,
      titulo: dados.titulo,
      descricao: dados.descricao,
      localizacao: dados.localizacao,
      prioridade: dados.prioridade,
      status: 'Aberto',
      responsavel: null,
      dataAbertura: dataAgora,
      dataInicio: null,
      dataConclusao: null,
      historico: [
        {
          data: dataAgora,
          descricao: `Chamado aberto por ${dados.nome} (${dados.setor}).`
        }
      ]
    }

    const { data, error } = await supabase.from('chamados').insert(novo).select().single()

    if (error) {
      // eslint-disable-next-line no-console
      console.error('Erro ao criar chamado:', error)
      setToast({
        type: 'error',
        message: 'Não foi possível registrar o chamado. Tente novamente.'
      })
      return null
    }

    setTickets((prev) => [data, ...prev])
    setSelectedTicketId(data.id)
    return data
  }

  async function handleAssumirChamado(id) {
    const dataAgora = new Date().toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })

    const atual = tickets.find((t) => t.id === id)
    if (!atual) return

    const jaTinhaResponsavel = !!atual.responsavel
    const historicoAtualizado = [
      ...(atual.historico || []),
      {
        data: dataAgora,
        descricao: `${
          tecnicoAtual || atual.responsavel || 'Técnico'
        } ${jaTinhaResponsavel ? 'atualizou o atendimento.' : 'assumiu o chamado.'}`
      }
    ]

    const atualizado = {
      ...atual,
      responsavel: tecnicoAtual || atual.responsavel || 'Técnico',
      status: 'Em andamento',
      dataInicio: atual.dataInicio ?? dataAgora,
      historico: historicoAtualizado
    }

    const { data, error } = await supabase
      .from('chamados')
      .update({
        responsavel: atualizado.responsavel,
        status: atualizado.status,
        dataInicio: atualizado.dataInicio,
        historico: atualizado.historico
      })
      .eq('id', id)
      .select()
      .single()

    if (error) {
      // eslint-disable-next-line no-console
      console.error('Erro ao assumir chamado:', error)
      setToast({
        type: 'error',
        message: 'Não foi possível assumir o chamado.'
      })
      return
    }

    setTickets((prev) => prev.map((t) => (t.id === id ? data : t)))
    setSelectedTicketId(id)
  }

  async function handleAtualizarStatus(id, novoStatus, observacaoOpcional) {
    const dataAgora = new Date().toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })

    const atual = tickets.find((t) => t.id === id)
    if (!atual) return

    const historicoExtra =
      observacaoOpcional && observacaoOpcional.trim().length
        ? [
            ...(atual.historico || []),
            { data: dataAgora, descricao: observacaoOpcional.trim() }
          ]
        : atual.historico || []

    const historicoComStatus = [
      ...historicoExtra,
      {
        data: dataAgora,
        descricao: `${tecnicoAtual || atual.responsavel || 'Técnico'} alterou o status para "${novoStatus}".`
      }
    ]

    const responsavelFinal = atual.responsavel || tecnicoAtual || 'Técnico'

    const atualizado = {
      ...atual,
      responsavel: responsavelFinal,
      status: novoStatus,
      dataInicio: atual.dataInicio ?? (novoStatus !== 'Aberto' ? dataAgora : atual.dataInicio),
      dataConclusao: novoStatus === 'Concluído' ? dataAgora : atual.dataConclusao,
      historico: historicoComStatus
    }

    const { data, error } = await supabase
      .from('chamados')
      .update({
        responsavel: atualizado.responsavel,
        status: atualizado.status,
        dataInicio: atualizado.dataInicio,
        dataConclusao: atualizado.dataConclusao,
        historico: atualizado.historico
      })
      .eq('id', id)
      .select()
      .single()

    if (error) {
      // eslint-disable-next-line no-console
      console.error('Erro ao atualizar status:', error)
      setToast({
        type: 'error',
        message: 'Não foi possível atualizar o status.'
      })
      return
    }

    setTickets((prev) => prev.map((t) => (t.id === id ? data : t)))
    setSelectedTicketId(id)
  }

  function handleConcluirChamado(id, observacaoFinal) {
    const textoObs =
      observacaoFinal && observacaoFinal.trim().length
        ? observacaoFinal.trim()
        : 'Chamado concluído.'
    handleAtualizarStatus(id, 'Concluído', textoObs)
  }

  async function handleSubmitForm(event) {
    event.preventDefault()
    if (submitLockRef.current || submitting) return

    const formData = new FormData(event.currentTarget)
    const dados = {
      nome: formData.get('nome')?.toString().trim() ?? '',
      setor: formData.get('setor')?.toString().trim() ?? '',
      tipo: formData.get('tipo')?.toString().trim() ?? '',
      titulo: formData.get('titulo')?.toString().trim() ?? '',
      descricao: formData.get('descricao')?.toString().trim() ?? '',
      localizacao: formData.get('localizacao')?.toString().trim() ?? '',
      prioridade: formData.get('prioridade')?.toString().trim() ?? 'Média'
    }

    const errors = {}
    if (!dados.nome) errors.nome = 'Campo obrigatório'
    if (!dados.setor) errors.setor = 'Campo obrigatório'
    if (!dados.titulo) errors.titulo = 'Campo obrigatório'
    if (!dados.descricao) errors.descricao = 'Campo obrigatório'

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors)
      return
    }

    const signature = JSON.stringify({
      nome: dados.nome,
      setor: dados.setor,
      tipo: dados.tipo,
      titulo: dados.titulo,
      descricao: dados.descricao,
      localizacao: dados.localizacao,
      prioridade: dados.prioridade
    })
    const now = Date.now()
    if (
      lastSubmissionRef.current.signature === signature &&
      now - lastSubmissionRef.current.at < DUPLICATE_GUARD_WINDOW_MS
    ) {
      setToast({
        type: 'error',
        message: 'Solicitação já enviada há instantes. Aguarde até 1 minuto antes de reenviar.'
      })
      return
    }

    setFormErrors({})
    // Marca a assinatura no início da tentativa para bloquear duplo envio mesmo com falha de rede.
    lastSubmissionRef.current = { signature, at: Date.now() }
    submitLockRef.current = true
    setSubmitting(true)
    try {
      const created = await handleCriarChamado(dados)
      if (created) {
        lastSubmissionRef.current = { signature, at: Date.now() }
        event.currentTarget.reset()
        const openTickets = tickets.filter((t) => t.status === 'Aberto').length + 1
        setSubmitSuccessModal({
          open: true,
          ticketId: formatarId(created.id),
          openTickets
        })
      } else {
        setToast({
          type: 'error',
          message:
            'Não foi possível confirmar o envio agora. Evite reenviar imediatamente para não duplicar.'
        })
      }
    } finally {
      submitLockRef.current = false
      setSubmitting(false)
    }
  }

  function handleLoginTiSubmit(e) {
    e.preventDefault()
    setLoginError(null)
    setLoginSubmitting(true)

    window.setTimeout(() => {
      if (!senhaTi) {
        setLoginError('Informe a senha de acesso da TI.')
        setLoginSubmitting(false)
        return
      }

      if (senhaTi !== TI_ACCESS_CODE) {
        setLoginError('Senha inválida.')
        setLoginSubmitting(false)
        return
      }

      window.localStorage.setItem('chameti-ti-auth', 'ok')
      setTiAutenticado(true)
      setLoginSubmitting(false)
      setSenhaTi('')
      setView('dashboard')
      navigate('/ti')
    }, 300)
  }

  if (view === 'abrir') {
    return (
      <div className="min-h-screen bg-background-dark text-slate-100 font-display">
        {!isOnline && (
          <div className="bg-amber-500/20 px-4 py-2 text-center text-xs font-semibold text-amber-200">
            Sem conexão com a internet. Os chamados serão atualizados quando a conexão voltar.
          </div>
        )}
        <div className="mx-auto flex min-h-screen w-full max-w-[980px] flex-col px-4 py-5 md:px-10">
          <header className="mb-6 flex items-center justify-between border-b border-slate-800 pb-6">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/20 text-primary">
                <span className="text-lg font-black">+</span>
              </div>
              <h2 className="text-xl font-black tracking-tight">ChameTI · HMC</h2>
            </div>
          </header>

          <section className="mb-8">
            <h1 className="text-4xl font-black tracking-tight">ChameTI · HMC</h1>
            <p className="mt-2 text-lg text-slate-400">
              Central de chamados da TI · Hospital Municipal de Caucaia
            </p>
          </section>

          <div className="mb-8 flex gap-8 border-b border-slate-800">
            <button
              type="button"
              className="border-b-[3px] border-primary pb-3 text-sm font-bold text-primary"
            >
              Abrir chamado
            </button>
          </div>

          <div className="mb-8 overflow-hidden rounded-xl border border-slate-800 bg-slate-900/50 shadow-lg">
            <div className="flex flex-col sm:flex-row">
              <div
                className="aspect-video w-full bg-cover bg-center sm:w-1/4 sm:aspect-auto"
                style={{
                  backgroundImage:
                    'url("https://lh3.googleusercontent.com/aida-public/AB6AXuBLnoOyU3bqXgEGjXJJdpVsFHm_dos295k5aTKnyirfhcu4luc9hT_OuvoNGb6sJu_u-ZO23dlMdBo-dCzIUHISzAp6JX2qwTVvQttoXYZrg-qiifC08P7mV9KSfIBXmLOXW3PifFWOBa3exD4YKvufb_oCn-EM1-zQ-txOEIyt6W9wD88B_kLB5-WhdLNhKAzOlC4HZkKDNIrt-kcql2AONL1NHKooPAWgbMKGPLPkNscmP-YvgQoklTg7RQ2MTyspbERocPYwUEg")'
                }}
              />
              <div className="flex w-full flex-col justify-center gap-2 px-6 py-5 sm:w-3/4">
                <div className="flex items-center justify-between">
                  <h3 className="text-3xl font-black leading-tight tracking-tight">Abrir novo chamado</h3>
                  <span className="rounded-full bg-primary/20 px-3 py-1 text-xs font-bold text-primary">
                    {tickets.filter((t) => t.status === 'Aberto').length} Chamados Abertos
                  </span>
                </div>
                <p className="text-sm text-slate-400">
                  Registre um novo problema ou solicitacao para a equipe tecnica.
                </p>
              </div>
            </div>
          </div>

          <form className="grid grid-cols-1 gap-6 md:grid-cols-2" onSubmit={handleSubmitForm}>
            <div className="flex flex-col gap-1.5">
              <label className="ml-1 text-sm font-semibold text-slate-300" htmlFor="nome">
                Nome Completo
              </label>
              <input
                className={`w-full rounded-xl border bg-slate-900/60 px-4 py-3 text-white placeholder:text-slate-500 focus:border-primary focus:ring-primary ${
                  formErrors.nome ? 'border-red-400' : 'border-slate-800'
                }`}
                id="nome"
                name="nome"
                placeholder="Ex: Ana Paula"
                type="text"
              />
              {formErrors.nome && <span className="text-xs text-red-300">{formErrors.nome}</span>}
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="ml-1 text-sm font-semibold text-slate-300" htmlFor="setor">
                Setor
              </label>
              <input
                className={`w-full rounded-xl border bg-slate-900/60 px-4 py-3 text-white placeholder:text-slate-500 focus:border-primary focus:ring-primary ${
                  formErrors.setor ? 'border-red-400' : 'border-slate-800'
                }`}
                id="setor"
                name="setor"
                placeholder="Ex: Farmacia"
                type="text"
              />
              {formErrors.setor && <span className="text-xs text-red-300">{formErrors.setor}</span>}
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="ml-1 text-sm font-semibold text-slate-300" htmlFor="tipo">
                Tipo de Chamado
              </label>
              <select
                className="w-full rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3 text-white focus:border-primary focus:ring-primary"
                defaultValue=""
                id="tipo"
                name="tipo"
              >
                <option value="" disabled>
                  Selecione
                </option>
                {TIPOS_PROBLEMA.map((tipo) => (
                  <option key={tipo} value={tipo}>
                    {tipo}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="ml-1 text-sm font-semibold text-slate-300" htmlFor="prioridade">
                Prioridade
              </label>
              <select
                className="w-full rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3 text-white focus:border-primary focus:ring-primary"
                defaultValue="Média"
                id="prioridade"
                name="prioridade"
              >
                {PRIORIDADES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>

            <div className="md:col-span-2 flex flex-col gap-1.5">
              <label className="ml-1 flex justify-between text-sm font-semibold text-slate-300" htmlFor="titulo">
                <span>Resumo do Problema</span>
                <span className="text-xs font-normal text-slate-500">Maximo 120 caracteres</span>
              </label>
              <input
                className={`w-full rounded-xl border bg-slate-900/60 px-4 py-3 text-white placeholder:text-slate-500 focus:border-primary focus:ring-primary ${
                  formErrors.titulo ? 'border-red-400' : 'border-slate-800'
                }`}
                id="titulo"
                maxLength={120}
                name="titulo"
                placeholder="Ex: Impressora nao liga"
                type="text"
              />
              {formErrors.titulo && <span className="text-xs text-red-300">{formErrors.titulo}</span>}
            </div>

            <div className="md:col-span-2 flex flex-col gap-1.5">
              <label className="ml-1 text-sm font-semibold text-slate-300" htmlFor="descricao">
                Descricao Detalhada
              </label>
              <textarea
                className={`w-full resize-none rounded-xl border bg-slate-900/60 px-4 py-3 text-white placeholder:text-slate-500 focus:border-primary focus:ring-primary ${
                  formErrors.descricao ? 'border-red-400' : 'border-slate-800'
                }`}
                id="descricao"
                maxLength={800}
                name="descricao"
                placeholder="Descreva o que aconteceu em detalhes..."
                rows={4}
              />
              {formErrors.descricao && (
                <span className="text-xs text-red-300">{formErrors.descricao}</span>
              )}
            </div>

            <div className="md:col-span-2 flex flex-col gap-1.5">
              <label className="ml-1 text-sm font-semibold text-slate-300" htmlFor="localizacao">
                Localizacao
              </label>
              <input
                className="w-full rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3 text-white placeholder:text-slate-500 focus:border-primary focus:ring-primary"
                id="localizacao"
                name="localizacao"
                placeholder="Bloco A - 2o andar - Sala 203"
                type="text"
              />
            </div>

            <div className="md:col-span-2 flex justify-center pb-16">
              <button
                className="flex h-14 min-w-[280px] items-center justify-center gap-2 rounded-full bg-gradient-to-r from-cyan-400 to-cyan-300 font-black tracking-wide text-slate-900 shadow-xl shadow-cyan-500/20 transition-all hover:scale-105 active:scale-95 disabled:opacity-70"
                disabled={submitting}
                type="submit"
              >
                {submitting ? 'ENVIANDO...' : 'ABRIR CHAMADO PARA TI'}
              </button>
            </div>
          </form>
        </div>

        {submitSuccessModal.open && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4">
            <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
              <h3 className="text-2xl font-black text-primary">Chamado enviado com sucesso!</h3>
              <p className="mt-2 text-sm text-slate-300">
                Seu chamado #{submitSuccessModal.ticketId} foi registrado com sucesso.
              </p>
              <div className="mt-4 rounded-xl border border-cyan-500/40 bg-cyan-500/10 px-4 py-3">
                <p className="text-xs uppercase tracking-wide text-cyan-200">Chamados em aberto agora</p>
                <p className="mt-1 text-3xl font-black text-cyan-300">{submitSuccessModal.openTickets}</p>
              </div>
              <button
                type="button"
                className="mt-6 w-full rounded-xl bg-primary py-3 text-sm font-bold text-slate-900 transition hover:opacity-90"
                onClick={() =>
                  setSubmitSuccessModal({ open: false, ticketId: null, openTickets: 0 })
                }
              >
                Voltar para tela de chamado
              </button>
            </div>
          </div>
        )}

        {toast && (
          <div className="fixed bottom-6 right-6 z-50 rounded-xl border border-emerald-500/50 bg-slate-900 p-4 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-emerald-500 p-1 text-xs font-bold text-white">✓</div>
              <div className="flex flex-col">
                <p className="text-sm font-bold">{toast.type === 'error' ? 'Erro!' : 'Sucesso!'}</p>
                <p className="text-xs text-slate-400">{toast.message}</p>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  if (location.pathname === '/ti' && !tiAutenticado) {
    return (
      <div className="min-h-screen bg-background-dark px-4 py-8 text-slate-100">
        {!isOnline && (
          <div className="mx-auto mb-4 max-w-xl rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-xs font-semibold text-amber-200">
            Sem conexão com a internet no momento.
          </div>
        )}
        <main className="mx-auto max-w-xl rounded-xl border border-slate-800 bg-slate-900/70 p-6">
          <h2 className="mb-2 text-2xl font-black">Acesso da equipe de TI</h2>
          <p className="mb-6 text-sm text-slate-400">
            Informe a senha interna para visualizar e gerenciar os chamados.
          </p>
          <form className="space-y-4" onSubmit={handleLoginTiSubmit}>
            <div>
              <label className="mb-1 block text-sm text-slate-300" htmlFor="senha-ti">
                Senha de acesso
              </label>
              <input
                id="senha-ti"
                name="senha-ti"
                type="password"
                autoComplete="off"
                value={senhaTi}
                onChange={(e) => setSenhaTi(e.target.value)}
                className={`w-full rounded-xl border bg-slate-950/60 px-4 py-3 text-white focus:border-primary focus:ring-primary ${
                  loginError ? 'border-red-400' : 'border-slate-700'
                }`}
                placeholder="Senha fornecida pela coordenação de TI"
              />
              {loginError && <span className="mt-1 block text-xs text-red-300">{loginError}</span>}
            </div>
            <button
              type="submit"
              disabled={loginSubmitting}
              className="w-full rounded-xl bg-primary py-3 text-sm font-bold text-slate-900 transition hover:opacity-90 disabled:opacity-70"
            >
              {loginSubmitting ? 'Verificando...' : 'Entrar no painel da TI'}
            </button>
          </form>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background-dark font-display text-slate-100">
      {!isOnline && (
        <div className="bg-amber-500/20 px-4 py-2 text-center text-xs font-semibold text-amber-200">
          Sem conexão com a internet. A atualização automática será retomada quando a conexão voltar.
        </div>
      )}
      <header className="flex items-center justify-between border-b border-slate-800 px-6 py-3">
        <div className="flex items-center gap-8">
          <div className="flex items-center gap-3 text-primary">
            <div className="h-6 w-6">
              <svg fill="none" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
                <path d="M4 4H17.3334V17.3334H30.6666V30.6666H44V44H4V4Z" fill="currentColor" />
              </svg>
            </div>
            <h2 className="text-lg font-bold tracking-tight text-slate-100">ChameTI · Painel TI</h2>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden items-center rounded-xl bg-slate-800 px-3 py-2 sm:flex">
            <input
              className="w-56 bg-transparent text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none"
              placeholder="Buscar chamados..."
            />
          </div>
          <div className="h-10 w-10 rounded-full border-2 border-primary/30 bg-slate-700" />
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-[1600px] grid-cols-1 gap-6 p-6 xl:grid-cols-12">
        <section className="space-y-6 xl:col-span-8">
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-800 bg-slate-900/50 p-6">
            <div>
              <h1 className="text-4xl font-black">Fila de chamados</h1>
              <p className="text-sm text-slate-400">Monitoramento em tempo real da demanda técnica</p>
            </div>
            <div className="flex items-center gap-3 rounded-xl border border-slate-700 bg-slate-800 px-4 py-3">
              <div className="relative">
                <div className="h-10 w-10 rounded-full bg-slate-600" />
                <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-slate-800 bg-green-500" />
              </div>
              <div>
                <p className="text-xs text-slate-400">Técnico atual</p>
                <input
                  value={tecnicoAtual}
                  onChange={(e) => setTecnicoAtual(e.target.value)}
                  className="w-36 border-0 bg-transparent p-0 text-sm font-bold text-slate-100 focus:outline-none focus:ring-0"
                />
              </div>
            </div>
          </div>

          {errorTickets && (
            <div className="rounded-xl border border-red-500/60 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {errorTickets}{' '}
              <button type="button" onClick={recarregarChamados} className="font-bold text-red-100 underline">
                Tentar novamente
              </button>
            </div>
          )}
          {loadingTickets && !errorTickets && (
            <div className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-slate-300">
              Carregando chamados...
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap gap-3">
              <select
                value={filtroStatus}
                onChange={(e) => setFiltroStatus(e.target.value)}
                className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-sm text-slate-100"
              >
                <option value="todos">Status: Todos</option>
                {STATUS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <select
                value={filtroPrioridade}
                onChange={(e) => setFiltroPrioridade(e.target.value)}
                className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-sm text-slate-100"
              >
                <option value="todos">Prioridade: Todas</option>
                {PRIORIDADES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
              <select
                value={filtroSetor}
                onChange={(e) => setFiltroSetor(e.target.value)}
                className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-sm text-slate-100"
              >
                <option value="todos">Setor: Todos</option>
                {setoresUnicos.map((setor) => (
                  <option key={setor} value={setor}>
                    {setor}
                  </option>
                ))}
              </select>
            </div>
            <div className="text-sm text-slate-400">
              Exibindo <span className="font-bold text-primary">{ticketsFiltrados.length} chamados</span>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="bg-slate-800/50 text-xs uppercase tracking-wider text-slate-400">
                  <th className="px-4 py-4">ID</th>
                  <th className="px-4 py-4">Setor</th>
                  <th className="px-4 py-4">Problema</th>
                  <th className="px-4 py-4">Prioridade</th>
                  <th className="px-4 py-4">Status</th>
                  <th className="px-4 py-4">Responsável</th>
                  <th className="px-4 py-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {ticketsFiltrados.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-6 text-center text-sm text-slate-500">
                      Nenhum chamado encontrado com os filtros atuais.
                    </td>
                  </tr>
                ) : (
                  ticketsFiltrados.map((ticket) => (
                    <tr
                      key={ticket.id}
                      onClick={() => setSelectedTicketId(ticket.id)}
                      className={`cursor-pointer transition ${
                        selectedTicketId === ticket.id ? 'ring-2 ring-inset ring-primary bg-slate-800/40' : 'hover:bg-slate-800/30'
                      } ${ticket.prioridade === 'Alta' ? 'bg-red-900/20 hover:bg-red-900/30' : ''}`}
                    >
                      <td className="px-4 py-4 font-mono text-xs text-slate-400">#{formatarId(ticket.id)}</td>
                      <td className="px-4 py-4 text-sm font-medium">{ticket.setor}</td>
                      <td className="px-4 py-4">
                        <p className="text-sm font-bold">{ticket.titulo}</p>
                        <p className="text-xs text-slate-400">
                          {ticket.tipo} · {ticket.localizacao || 'Local não informado'}
                        </p>
                      </td>
                      <td className="px-4 py-4">
                        <span
                          className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase ${
                            ticket.prioridade === 'Alta'
                              ? 'bg-red-900/50 text-red-300'
                              : ticket.prioridade === 'Média'
                                ? 'bg-blue-900/40 text-blue-300'
                                : 'bg-slate-800 text-slate-300'
                          }`}
                        >
                          {ticket.prioridade}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-xs">
                        <div className="flex items-center gap-2">
                          <span
                            className={`h-2 w-2 rounded-full ${
                              ticket.status === 'Concluído'
                                ? 'bg-green-500'
                                : ticket.status === 'Em andamento'
                                  ? 'bg-blue-500'
                                  : ticket.status === 'Aguardando material'
                                    ? 'bg-amber-500'
                                    : 'bg-cyan-500'
                            }`}
                          />
                          <span>{ticket.status}</span>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-sm">{ticket.responsavel || '--'}</td>
                      <td className="px-4 py-4 text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            className="rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-slate-900"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleAssumirChamado(ticket.id)
                            }}
                          >
                            Assumir
                          </button>
                          {ticket.status !== 'Concluído' && (
                            <button
                              type="button"
                              className="rounded-lg bg-slate-700 px-3 py-1.5 text-xs font-bold"
                              onClick={(e) => {
                                e.stopPropagation()
                                const novoStatus = window.prompt(
                                  'Novo status (Aberto, Em andamento, Aguardando material, Concluído):',
                                  ticket.status
                                )
                                if (!novoStatus || !STATUS.includes(novoStatus)) return
                                const obs = window.prompt('Observação (opcional para o histórico):')
                                handleAtualizarStatus(ticket.id, novoStatus, obs || undefined)
                              }}
                            >
                              Status
                            </button>
                          )}
                          {ticket.status !== 'Concluído' && (
                            <button
                              type="button"
                              className="rounded-lg bg-primary/20 px-3 py-1.5 text-xs font-bold text-primary"
                              onClick={(e) => {
                                e.stopPropagation()
                                const obs = window.prompt(
                                  'Observação final (opcional, ex: "Toner substituído e impressora testada."):'
                                )
                                handleConcluirChamado(ticket.id, obs || undefined)
                              }}
                            >
                              Concluir
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <aside className="space-y-6 xl:col-span-4">
          <div className="flex h-full flex-col rounded-xl border border-slate-800 bg-slate-900">
            {ticketSelecionado ? (
              <>
                <div className="border-b border-slate-800 p-6">
                  <div className="mb-4 flex items-start justify-between">
                    <h2 className="text-lg font-bold">Detalhes do chamado</h2>
                    <span className="rounded bg-slate-800 px-2 py-1 font-mono text-xs text-slate-400">
                      #{formatarId(ticketSelecionado.id)}
                    </span>
                  </div>
                  <h3 className="mb-2 text-2xl font-black text-primary">{ticketSelecionado.titulo}</h3>
                  <p className="text-sm text-slate-400">{ticketSelecionado.descricao}</p>
                </div>

                <div className="grid grid-cols-2 gap-x-4 gap-y-6 border-b border-slate-800 p-6">
                  <div>
                    <p className="mb-1 text-[10px] uppercase tracking-wider text-slate-500">Solicitante</p>
                    <p className="text-sm font-semibold">{ticketSelecionado.solicitante}</p>
                  </div>
                  <div>
                    <p className="mb-1 text-[10px] uppercase tracking-wider text-slate-500">Localização</p>
                    <p className="text-sm font-semibold">{ticketSelecionado.localizacao || 'Não informado'}</p>
                  </div>
                  <div>
                    <p className="mb-1 text-[10px] uppercase tracking-wider text-slate-500">Prioridade</p>
                    <p className="text-sm font-semibold">{ticketSelecionado.prioridade}</p>
                  </div>
                  <div>
                    <p className="mb-1 text-[10px] uppercase tracking-wider text-slate-500">Responsável</p>
                    <p className="text-sm font-semibold">{ticketSelecionado.responsavel || 'Ainda não atribuído'}</p>
                  </div>
                  <div>
                    <p className="mb-1 text-[10px] uppercase tracking-wider text-slate-500">Aberto em</p>
                    <p className="text-sm font-semibold">{ticketSelecionado.dataAbertura || '--'}</p>
                  </div>
                  <div>
                    <p className="mb-1 text-[10px] uppercase tracking-wider text-slate-500">Prazo SLA</p>
                    <p className="text-sm font-semibold text-amber-400">Hoje às 17:00</p>
                  </div>
                </div>

                <div className="flex-1 space-y-4 overflow-y-auto p-6">
                  <h4 className="text-sm font-bold">Histórico do atendimento</h4>
                  {ticketSelecionado.historico?.length ? (
                    ticketSelecionado.historico.map((item, idx) => (
                      <div key={`${ticketSelecionado.id}-hist-${idx}`} className="rounded-lg bg-slate-800/40 p-3">
                        <p className="text-xs font-bold text-slate-200">{item.descricao}</p>
                        <p className="text-[11px] text-slate-500">{item.data}</p>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-slate-500">Nenhum evento registrado ainda para este chamado.</p>
                  )}
                </div>

                <div className="bg-slate-800/30 p-4">
                  <button
                    type="button"
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 font-bold text-slate-900 transition hover:opacity-90"
                    onClick={() => {
                      const obs = window.prompt('Observação final (opcional):')
                      handleConcluirChamado(ticketSelecionado.id, obs || undefined)
                    }}
                  >
                    Atualizar Atendimento
                  </button>
                </div>
              </>
            ) : (
              <div className="p-6 text-sm text-slate-500">Selecione um chamado para ver os detalhes.</div>
            )}
          </div>
        </aside>
      </main>

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 rounded-xl border border-emerald-500/50 bg-slate-900 p-4 shadow-2xl">
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-emerald-500 p-1 text-xs font-bold text-white">✓</div>
            <div className="flex flex-col">
              <p className="text-sm font-bold">{toast.type === 'error' ? 'Erro!' : 'Sucesso!'}</p>
              <p className="text-xs text-slate-400">{toast.message}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
