import Link from 'next/link';
import { LogoutButton } from '@/components/dashboard/logout-button';
import styles from './layout.module.css';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar} aria-label="Socialencer navigation">
        <div className={styles.brand}>
          <span className={styles.brandMark} aria-hidden="true" />
          <span>Socialencer</span>
        </div>
        <nav className={styles.nav}>
          <Link
            className={`${styles.navItem} ${styles.navItemActive}`}
            href="/profile"
          >
            <span className={styles.navIcon} aria-hidden="true" />
            プロフィール
          </Link>
          <Link className={styles.navItem} href="/login">
            <span className={styles.navIcon} aria-hidden="true" />
            アカウント接続
          </Link>
        </nav>
      </aside>

      <main className={styles.content}>
        <header className={styles.topbar}>
          <div>
            <h1>プロフィール</h1>
            <p>接続済みInstagramアカウント</p>
          </div>
          <LogoutButton />
        </header>
        {children}
      </main>
    </div>
  );
}
