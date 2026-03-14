import React from 'react';
import BottomNav from './BottomNav';
import styles from './AppLayout.module.css';

const AppLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <div className={styles.shell}>
      <div className={styles.content}>
        {children}
      </div>
      <BottomNav />
    </div>
  );
};

export default AppLayout;
