import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import styles from '../styles/components/CustomModal.module.css';

const CustomModal = ({ isOpen, onClose, title, message, type = 'info' }) => {
    return (
        <AnimatePresence>
            {isOpen && (
                <div className={styles.modalOverlay} onClick={onClose}>
                    <motion.div
                        className={styles.modalContent}
                        initial={{ opacity: 0, scale: 0.95, y: 10, rotateX: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0, rotateX: 0 }}
                        exit={{
                            opacity: 0,
                            scale: 0.9,
                            y: 15,
                            transition: {
                                duration: 0.15,
                                ease: [0.4, 0, 1, 1]
                            }
                        }}
                        transition={{ type: 'spring', damping: 20, stiffness: 300 }}
                        onClick={(e) => e.stopPropagation()}
                    >

                        <div className={styles.modalTab}>
                            <span className={styles.statusDot} data-type={type} />
                            {type.toUpperCase()} // SYSTEM_MSG
                        </div>

                        <div className={styles.modalHeader}>
                            <h3 className={styles.modalTitle}>{title || 'SYSTEM NOTICE'}</h3>
                        </div>

                        <div className={styles.messageWrapper}>
                            <p className={styles.modalMessage}>{message}</p>
                        </div>

                        <div className={styles.modalActions}>
                            <button className={styles.confirmBtn} onClick={onClose}>
                                <span className={styles.btnText}>CONFIRM</span>
                                <div className={styles.btnGlow} />
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};

export default CustomModal;