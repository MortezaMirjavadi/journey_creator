import { createRoot } from 'react-dom/client';
import App from './App';
import './i18n';
import './engage.css';

const container = document.getElementById('root');
if (!container) throw new Error('Root element not found');

createRoot(container).render(<App />);
