'use client'

import { useState, useEffect, useRef } from 'react'

interface Comment {
  id: string
  task_id: string
  user_id: string
  user_nombre: string
  user_iniciales: string
  texto: string
  created_at: string
}

interface Props {
  taskId: string
  currentUserId: string
  accentColor: string
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'ahora'
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h`
  const days = Math.floor(hrs / 24)
  return `${days}d`
}

export default function CommentsTab({ taskId, currentUserId, accentColor }: Props) {
  const [comments, setComments] = useState<Comment[]>([])
  const [texto, setTexto] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch(`/api/tasks/${taskId}/comments`)
      .then(r => r.json())
      .then(data => { setComments(Array.isArray(data) ? data : []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [taskId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [comments])

  async function send() {
    if (!texto.trim() || sending) return
    setSending(true)
    try {
      const res = await fetch(`/api/tasks/${taskId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texto: texto.trim() }),
      })
      if (res.ok) {
        const comment = await res.json()
        setComments(prev => [...prev, comment])
        setTexto('')
      }
    } catch { /* ignore */ }
    setSending(false)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}>
      <div style={{ fontSize: 12, color: '#4A4540' }}>Cargando comentarios...</div>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0, height: '100%' }}>
      {/* Comments list */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
        {comments.length === 0 && (
          <div style={{ textAlign: 'center', padding: '32px 16px' }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>💬</div>
            <div style={{ fontSize: 12, color: '#4A4540' }}>Sin comentarios aún.</div>
            <div style={{ fontSize: 11, color: '#3A3530', marginTop: 4 }}>Sé el primero en escribir.</div>
          </div>
        )}
        {comments.map((c, idx) => {
          const isMe = c.user_id === currentUserId
          const prev = comments[idx - 1]
          const gapHrs = prev
            ? (new Date(c.created_at).getTime() - new Date(prev.created_at).getTime()) / 3_600_000
            : 0
          const showGap = gapHrs >= 24
          const gapLabel = gapHrs >= 48
            ? `${Math.round(gapHrs / 24)} días sin actividad`
            : 'Un día sin actividad'
          return (
            <div key={c.id}>
              {showGap && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '8px 0' }}>
                  <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.06)' }} />
                  <span style={{ fontSize: 9, color: '#5A5450', letterSpacing: 0.8, whiteSpace: 'nowrap' }}>
                    {gapLabel}
                  </span>
                  <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.06)' }} />
                </div>
              )}
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flexDirection: isMe ? 'row-reverse' : 'row' }}>
                {/* Avatar */}
                <div style={{ width: 30, height: 30, borderRadius: '50%', background: isMe ? accentColor : '#2A2A2A', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: isMe ? '#080808' : '#8A8076', flexShrink: 0 }}>
                  {c.user_iniciales}
                </div>
                {/* Bubble */}
                <div style={{ maxWidth: '75%' }}>
                  <div style={{ fontSize: 9, color: '#5A5450', marginBottom: 4, textAlign: isMe ? 'right' : 'left', letterSpacing: 0.5 }}>
                    {isMe ? 'Tú' : c.user_nombre} · {timeAgo(c.created_at)}
                  </div>
                  <div style={{
                    padding: '10px 14px', borderRadius: isMe ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                    background: isMe ? `${accentColor}18` : '#1A1A1A',
                    border: `1px solid ${isMe ? `${accentColor}30` : 'rgba(255,255,255,0.06)'}`,
                    fontSize: 13, color: '#E8DFC8', lineHeight: 1.5,
                    wordBreak: 'break-word',
                  }}>
                    {c.texto}
                  </div>
                </div>
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 14, flexShrink: 0 }}>
        <textarea
          value={texto}
          onChange={e => setTexto(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Escribe un comentario... (Enter para enviar)"
          rows={2}
          style={{ flex: 1, resize: 'none', borderRadius: 12, fontSize: 14, padding: '10px 14px', minHeight: 48 }}
        />
        <button
          onClick={send}
          disabled={!texto.trim() || sending}
          style={{
            width: 44, height: 44, borderRadius: 12, flexShrink: 0, cursor: texto.trim() ? 'pointer' : 'default',
            background: texto.trim() ? accentColor : 'rgba(255,255,255,0.05)',
            border: 'none', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center',
            opacity: sending ? 0.5 : 1, transition: 'all 0.15s',
          }}>
          {sending ? '⏳' : '↑'}
        </button>
      </div>
    </div>
  )
}
