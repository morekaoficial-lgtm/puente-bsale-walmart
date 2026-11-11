import "@/lib/logger";
import "@fontsource-variable/inter";
import "@fontsource/fira-code/400.css";
import "@fontsource/fira-code/500.css";
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import './index.css'
import { TRPCProvider } from "@/providers/trpc"
import App from './App.tsx'
import { Toaster } from "@/components/ui/sonner"

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <TRPCProvider>
        <App />
        <Toaster theme="dark" position="bottom-right" />
      </TRPCProvider>
    </BrowserRouter>
  </StrictMode>,
)
