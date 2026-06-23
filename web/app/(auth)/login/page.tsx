import { LoginForm } from '@/components/login/login-form';
import { PreviewPanel } from '@/components/login/preview-panel';
import styles from './page.module.css';

export default function LoginPage() {
  return (
    <div className={styles.split}>
      <PreviewPanel />
      <div className={styles.formPanel}>
        <div className={styles.formCard}>
          <h1>Socialencer</h1>
          <p>Instagramアカウントでログイン</p>
          <LoginForm />
        </div>
      </div>
    </div>
  );
}
