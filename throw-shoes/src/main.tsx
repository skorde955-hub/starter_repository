import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { BossProvider } from './state/BossContext.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BossProvider>
      <App />
    </BossProvider>
  </StrictMode>,
)
