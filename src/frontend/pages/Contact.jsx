import { useNavigate } from 'react-router-dom';
import styles from '../styles/footer/Contact.module.css'; 

const Contact = () => {
    const navigate = useNavigate();

    return (
        <div className={styles.cont}>
            <h1 className={styles.title}>Contact us here</h1>
            
            <p className={styles.desc}>
                pathfinder.sample.email@gmail.com
            </p>

            <button 
                className={styles.backButton} 
                onClick={() => navigate('/')}
            >
                ← Back to Home
            </button>
        </div>
    );
};

export default Contact;
