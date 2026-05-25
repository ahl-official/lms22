import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'react-hot-toast'
import App from './App'
import './index.css'

window.addEventListener('error', (event) => {
  console.error('[ui:runtime_error]', {
    message: event.message,
    source: event.filename,
    line: event.lineno,
    column: event.colno,
    stack: event.error?.stack,
  })
})

window.addEventListener('unhandledrejection', (event) => {
  console.error('[ui:unhandled_rejection]', {
    reason: event.reason?.message || event.reason,
    stack: event.reason?.stack,
  })
})

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 2 * 60_000,
      gcTime: 10 * 60_000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
  },
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <QueryClientProvider client={queryClient}>
    <App />
    <Toaster
      position="top-right"
      toastOptions={{
        style: { borderRadius: '14px', fontFamily: 'Nunito, sans-serif', fontSize: '14px' },
        success: { iconTheme: { primary: '#22c55e', secondary: '#fff' } },
        error: { iconTheme: { primary: '#ef4444', secondary: '#fff' } },
      }}
    />
  </QueryClientProvider>
)
