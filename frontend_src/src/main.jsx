import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './styles.css'

// StrictMode 비활성: Phaser 이중 마운트 방지
createRoot(document.getElementById('root')).render(<App />)
