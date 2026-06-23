'use client';

import { useRouter } from 'next/navigation';
import styles from '@/app/(dashboard)/layout.module.css';

export function LogoutButton() {
  const router = useRouter();

  async function handleLogout() {
    const res = await fetch('/api/dashboard/logout', { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    router.push(data.redirectUrl || '/login');
  }

  return (
    <button className={styles.logoutButton} type="button" onClick={handleLogout}>
      ログアウト
    </button>
  );
}
