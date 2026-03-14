import React from 'react';
import styles from './Button.module.css';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary';
  fullWidth?: boolean;
  children: React.ReactNode;
}

const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  fullWidth = false,
  children,
  className = '',
  ...props
}) => {
  return (
    <button
      className={`${styles.button} ${styles[variant]} ${fullWidth ? styles.fullWidth : ''} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
};

export default Button;
