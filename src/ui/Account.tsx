import { useState, type FormEvent } from 'react'
import {
  cloudConfigured,
  deleteAccount,
  replaceLocalData,
  sendEmailCode,
  signInWithGoogle,
  signOut,
  syncNow,
  useCloud,
  verifyEmailCode,
} from '../sync/cloud'
import { Sheet } from './common'

function Privacy({ onClose }: { onClose: () => void }) {
  return (
    <Sheet title="Конфиденциальность" onClose={onClose}>
      <div className="card prose">
        <p>
          <b>Без аккаунта</b> все записи хранятся только на вашем устройстве и никуда не отправляются.
        </p>
        <p>
          <b>С аккаунтом</b> на сервере (Supabase) хранятся: адрес электронной почты, с которым вы вошли, и ваши записи —
          тренировки, подходы, вес тела, упражнения и шаблоны. Они нужны только для того, чтобы показывать вам ваши
          данные на разных устройствах.
        </p>
        <p>
          Доступ к записям есть только у вашего аккаунта. Данные не продаются, не передаются третьим лицам и не
          используются для рекламы. Аналитики и рекламных трекеров в приложении нет.
        </p>
        <p>
          При входе через Google приложение получает от Google только адрес почты и имя; пароль от Google ему не
          передаётся.
        </p>
        <p>
          <b>Удаление.</b> Кнопка «Удалить аккаунт» в настройках сразу и безвозвратно удаляет учётную запись и все записи
          на сервере. Записи на устройстве остаются, пока вы не удалите приложение или данные сайта.
        </p>
      </div>
    </Sheet>
  )
}

function SignIn() {
  const [email, setEmail] = useState('')
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = async (action: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await action()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  const send = (e: FormEvent) => {
    e.preventDefault()
    const address = email.trim()
    void run(async () => {
      await sendEmailCode(address)
      setSentTo(address)
      setCode('')
    })
  }
  const verify = (e: FormEvent) => {
    e.preventDefault()
    void run(() => verifyEmailCode(sentTo!, code.trim()))
  }

  return (
    <>
      <p className="muted small">
        Войдите, чтобы записи хранились в облаке и были одинаковыми на всех ваших устройствах. Записи, которые уже есть
        на этом устройстве, добавятся в аккаунт.
      </p>
      <button type="button" className="btn" disabled={busy} onClick={() => void run(signInWithGoogle)}>
        Войти через Google
      </button>
      {sentTo === null ? (
        <form onSubmit={send}>
          <input
            className="text"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="off"
            required
            placeholder="Электронная почта"
            aria-label="Электронная почта"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <button type="submit" className="btn ghost" disabled={busy}>
            Получить код на почту
          </button>
        </form>
      ) : (
        <form onSubmit={verify}>
          <p className="muted small">Код отправлен на {sentTo}. Письмо может идти до минуты.</p>
          <input
            className="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6,10}"
            required
            placeholder="Код из письма"
            aria-label="Код из письма"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          <button type="submit" className="btn" disabled={busy}>
            Войти
          </button>
          <button type="button" className="btn ghost" disabled={busy} onClick={() => setSentTo(null)}>
            Другой адрес
          </button>
        </form>
      )}
      {error && <p role="alert">Не получилось: {error}</p>}
    </>
  )
}

/** Sign-in and sync status. Renders nothing when the build has no server configured. */
export function Account() {
  const cloud = useCloud()
  const [privacy, setPrivacy] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (!cloudConfigured || !cloud.ready) return null

  const run = async (action: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await action()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  const remove = () => {
    if (!confirm('Удалить аккаунт и все записи на сервере? Это нельзя отменить. Записи на этом устройстве останутся.'))
      return
    void run(deleteAccount)
  }
  const replace = () => {
    if (!confirm(`Записи аккаунта ${cloud.foreign} будут убраны с этого устройства. Продолжить?`)) return
    void run(replaceLocalData)
  }
  const status = cloud.syncing
    ? 'Синхронизация…'
    : cloud.error
      ? `Ошибка синхронизации: ${cloud.error}`
      : !navigator.onLine
        ? 'Нет сети — изменения отправятся позже.'
        : cloud.lastSyncAt
          ? `Синхронизировано в ${new Date(cloud.lastSyncAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}.`
          : 'Ещё не синхронизировано.'

  return (
    <>
      <h2>Аккаунт</h2>
      <div className="card account">
        {cloud.user === null ? (
          <SignIn />
        ) : (
          <>
            <p className="account-email">{cloud.user.email}</p>
            {cloud.foreign ? (
              <>
                <p role="alert">
                  На этом устройстве лежат записи другого аккаунта ({cloud.foreign}). Синхронизация остановлена, чтобы
                  не смешать их.
                </p>
                <button type="button" className="btn" disabled={busy} onClick={replace}>
                  Заменить записями этого аккаунта
                </button>
              </>
            ) : (
              <>
                <p className="muted small" role="status">
                  {status}
                </p>
                <button type="button" className="btn ghost" disabled={busy || cloud.syncing} onClick={() => void syncNow()}>
                  Синхронизировать сейчас
                </button>
              </>
            )}
            <button type="button" className="btn ghost" disabled={busy} onClick={() => void run(signOut)}>
              Выйти
            </button>
            <button type="button" className="btn ghost danger" disabled={busy} onClick={remove}>
              Удалить аккаунт
            </button>
          </>
        )}
        {error && <p role="alert">Не получилось: {error}</p>}
        <button type="button" className="link" onClick={() => setPrivacy(true)}>
          Какие данные хранятся
        </button>
      </div>
      {privacy && <Privacy onClose={() => setPrivacy(false)} />}
    </>
  )
}
