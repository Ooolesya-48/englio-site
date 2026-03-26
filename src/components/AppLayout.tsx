import React from 'react';
import BottomNav from './BottomNav';
import styles from './AppLayout.module.css';

interface Props {
  children: React.ReactNode;
  hideNav?: boolean;
}

const AppLayout: React.FC<Props> = ({ children, hideNav }) => {
  return (
    <div className={styles.shell} id="app-shell">
      <div className={styles.content}>
        {children}
      </div>
      {!hideNav && <BottomNav />}
    </div>
  );
};

export default AppLayout;
