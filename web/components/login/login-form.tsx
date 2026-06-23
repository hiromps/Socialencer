'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import styles from '@/app/(auth)/login/page.module.css';

type Step = 'credentials' | 'verify' | 'completing';

interface TwoFactorInfo {
  twoFactorIdentifier: string;
  verificationMethod: string;
  username: string;
}

export function LoginForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [step, setStep] = useState<Step>('credentials');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [verificationCode, setVerificationCode] = useState('');
  const [twoFactorInfo, setTwoFactorInfo] = useState<TwoFactorInfo | null>(null);
  const [status, setStatus] = useState<{ type: 'info' | 'error' | 'success'; message: string } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isPending) return;

    if (step === 'credentials') {
      await submitCredentials();
    } else if (step === 'verify') {
      await submitVerification();
    }
  }

  async function submitCredentials() {
    setStatus({ type: 'info', message: 'ログインしています...' });

    try {
      const res = await fetch('/api/instagram/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();

      if (data.twoFactorRequired) {
        setTwoFactorInfo({
          twoFactorIdentifier: data.twoFactorIdentifier,
          verificationMethod: data.verificationMethod,
          username: data.username,
        });
        setStep('verify');
        setStatus({
          type: 'info',
          message: `2段階認証が必要です。${data.verificationMethod === '1' ? 'SMS' : '認証アプリ'}のコードを入力してください。`,
        });
        return;
      }

      if (data.flowToken && data.step === 'complete') {
        await completeLogin(data.flowToken);
        return;
      }

      setStatus({ type: 'error', message: data.message || 'ログインに失敗しました。' });
    } catch (err: any) {
      setStatus({ type: 'error', message: err?.message || '通信エラーが発生しました。' });
    }
  }

  async function submitVerification() {
    if (!twoFactorInfo || !verificationCode) return;
    setStatus({ type: 'info', message: '認証コードを確認しています...' });

    try {
      const res = await fetch('/api/instagram/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: twoFactorInfo.username,
          verificationCode,
          twoFactorIdentifier: twoFactorInfo.twoFactorIdentifier,
          verificationMethod: twoFactorInfo.verificationMethod,
          remember,
        }),
      });
      const data = await res.json();

      if (data.flowToken && data.step === 'complete') {
        await completeLogin(data.flowToken);
        return;
      }

      setStatus({ type: 'error', message: data.message || '認証に失敗しました。' });
    } catch (err: any) {
      setStatus({ type: 'error', message: err?.message || '通信エラーが発生しました。' });
    }
  }

  async function completeLogin(flowToken: string) {
    setStep('completing');
    setStatus({ type: 'info', message: 'セッションをセットアップしています...' });

    try {
      const res = await fetch('/api/instagram/login/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ flowToken }),
      });
      const data = await res.json();

      if (data.redirectUrl) {
        setStatus({ type: 'success', message: data.message });
        startTransition(() => {
          router.push(data.redirectUrl);
        });
      } else {
        setStatus({ type: 'error', message: data.message || 'セットアップに失敗しました。' });
        setStep('credentials');
      }
    } catch (err: any) {
      setStatus({ type: 'error', message: err?.message || '通信エラーが発生しました。' });
      setStep('credentials');
    }
  }

  const statusClass = !status
    ? ''
    : status.type === 'error'
      ? styles.statusError
      : status.type === 'success'
        ? styles.statusSuccess
        : '';

  return (
    <form onSubmit={handleSubmit}>
      {step !== 'verify' && (
        <>
          <div className={styles.field}>
            <label htmlFor="username">ユーザー名</label>
            <input
              id="username"
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={isPending}
              required
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="password">パスワード</label>
            <div className={styles.passwordWrap}>
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isPending}
                required
              />
              <button
                type="button"
                className={styles.passwordToggle}
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={-1}
              >
                {showPassword ? '隠す' : '表示'}
              </button>
            </div>
          </div>

          <div className={styles.checkRow}>
            <input
              id="remember"
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
            />
            <label htmlFor="remember">この端末を記憶する</label>
          </div>
        </>
      )}

      {step === 'verify' && (
        <div className={styles.field}>
          <label htmlFor="verificationCode">認証コード</label>
          <input
            id="verificationCode"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={verificationCode}
            onChange={(e) => setVerificationCode(e.target.value)}
            disabled={isPending}
            required
            autoFocus
          />
        </div>
      )}

      <button className={styles.submit} type="submit" disabled={isPending || step === 'completing'}>
        {step === 'completing'
          ? 'セットアップ中...'
          : step === 'verify'
            ? '認証する'
            : isPending
              ? 'ログイン中...'
              : 'ログイン'}
      </button>

      {status && (
        <div className={`${styles.status} ${statusClass}`} role="alert">
          {status.message}
        </div>
      )}
    </form>
  );
}
