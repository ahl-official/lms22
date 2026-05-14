import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import api from '../../services/api'
import toast from 'react-hot-toast'
import { MessageCircle, Wifi, WifiOff, Send, CheckCircle, XCircle, Loader, Phone, Info, RefreshCw, Shield } from 'lucide-react'

const WAHA_DASHBOARD = 'https://waha.amankhan.space/dashboard/'
const SESSION_NAME = 'ahlaiteam'

function StatusBadge({ status }) {
    const map = {
        WORKING: { color: 'bg-emerald-100 text-emerald-700 border-emerald-200', icon: <CheckCircle size={13} />, label: 'Connected' },
        STARTING: { color: 'bg-amber-100 text-amber-700 border-amber-200', icon: <Loader size={13} className="animate-spin" />, label: 'Starting…' },
        STOPPED: { color: 'bg-red-100 text-red-700 border-red-200', icon: <XCircle size={13} />, label: 'Stopped' },
        SCAN_QR_CODE: { color: 'bg-blue-100 text-blue-700 border-blue-200', icon: <Info size={13} />, label: 'Needs QR Scan' },
    }
    const cfg = map[status] || { color: 'bg-gray-100 text-gray-600 border-gray-200', icon: <Info size={13} />, label: status || 'Unknown' }
    return (
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${cfg.color}`}>
            {cfg.icon}{cfg.label}
        </span>
    )
}

function StatCard({ icon, label, value, sub, color = 'brand' }) {
    const colors = {
        brand: 'from-violet-500 to-purple-600',
        green: 'from-emerald-400 to-green-600',
        orange: 'from-orange-400 to-amber-500',
    }
    return (
        <div className="card flex items-center gap-4 p-5">
            <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${colors[color]} flex items-center justify-center text-white flex-shrink-0`}>
                {icon}
            </div>
            <div>
                <p className="text-2xl font-bold text-gray-800">{value}</p>
                <p className="text-sm font-medium text-gray-600">{label}</p>
                {sub && <p className="text-xs text-gray-400">{sub}</p>}
            </div>
        </div>
    )
}

export default function WhatsAppSettings() {
    const [testPhone, setTestPhone] = useState('')
    const [testSent, setTestSent] = useState(false)

    const { data: statusData, isLoading: statusLoading, refetch: refetchStatus, isFetching } = useQuery({
        queryKey: ['waha-status'],
        queryFn: () => api.get('/whatsapp/status').then(r => r.data),
        refetchInterval: 30000,
        retry: false,
    })

    const testMutation = useMutation({
        mutationFn: (phone) => api.post('/whatsapp/test-message', { phone }),
        onSuccess: () => {
            toast.success('Test message sent! Check your WhatsApp.')
            setTestSent(true)
            setTimeout(() => setTestSent(false), 5000)
        },
        onError: (err) => toast.error(err.response?.data?.message || 'Failed to send test message'),
    })

    const session = statusData?.session
    const isConnected = session?.status === 'WORKING'
    const hasError = statusData && !statusData.success

    const handleTestSend = (e) => {
        e.preventDefault()
        if (!testPhone.trim()) return toast.error('Enter a phone number')
        testMutation.mutate(testPhone.trim())
    }

    return (
        <div className="p-6 max-w-4xl mx-auto space-y-6">
            <div className="flex items-start justify-between flex-wrap gap-4">
                <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-green-400 to-emerald-600 flex items-center justify-center shadow-lg">
                        <MessageCircle size={24} className="text-white" />
                    </div>
                    <div>
                        <h1 className="page-title mb-0">WhatsApp Integration</h1>
                        <p className="text-gray-500 text-sm mt-0.5">WAHA-powered messaging for test reports</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {session && <StatusBadge status={session.status} />}
                    <button onClick={() => refetchStatus()} disabled={isFetching} className="btn-secondary flex items-center gap-2 py-2 px-3 text-sm">
                        <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
                        Refresh
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <StatCard
                    icon={isConnected ? <Wifi size={22} /> : <WifiOff size={22} />}
                    label="Session Status"
                    value={isConnected ? 'Live' : 'Offline'}
                    sub={`Session: ${SESSION_NAME}`}
                    color={isConnected ? 'green' : 'orange'}
                />
                <StatCard icon={<Shield size={22} />} label="WAHA Server" value="Connected" sub="waha.amankhan.space" color="brand" />
                <StatCard icon={<Send size={22} />} label="Reports Mode" value="Auto" sub="Sends on assessment complete" color="green" />
            </div>

            <div className="card p-6 space-y-4">
                <div className="flex items-center justify-between">
                    <h2 className="font-bold text-gray-800 text-lg">Session Details</h2>
                    <a href={WAHA_DASHBOARD} target="_blank" rel="noopener noreferrer"
                        className="text-xs text-brand-600 hover:text-brand-700 font-medium flex items-center gap-1 underline underline-offset-2">
                        Open WAHA Dashboard ↗
                    </a>
                </div>

                {statusLoading ? (
                    <div className="flex items-center gap-3 py-4 text-gray-400">
                        <Loader size={18} className="animate-spin" />
                        <span className="text-sm">Checking session status…</span>
                    </div>
                ) : session ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {[
                            ['Session Name', session.name || SESSION_NAME],
                            ['Status', <StatusBadge key="s" status={session.status} />],
                            ['Engine', session.config?.webhooks ? 'Webhook enabled' : 'Standard'],
                            ['Me (Phone)', session.me?.id?.replace('@c.us', '') || '—'],
                        ].map(([label, val]) => (
                            <div key={label} className="flex items-start gap-3 p-3 bg-gray-50 rounded-xl">
                                <span className="text-xs font-medium text-gray-500 w-28 flex-shrink-0 pt-0.5">{label}</span>
                                <span className="text-sm font-semibold text-gray-800">{val}</span>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="space-y-3">
                        <div className="flex items-center gap-3 p-4 bg-red-50 rounded-2xl border border-red-100">
                            <XCircle size={18} className="text-red-500 flex-shrink-0" />
                            <div>
                                <p className="text-sm font-semibold text-red-700">Cannot reach WAHA server</p>
                                <p className="text-xs text-red-500 mt-0.5">Check that the server is running and the session is active.</p>
                            </div>
                        </div>

                        {/* Show actual error details so we can debug */}
                        {hasError && (statusData.error || statusData.waha_status) && (
                            <div className="p-3 bg-gray-50 rounded-xl border border-gray-200 font-mono text-xs text-gray-600 space-y-1">
                                {statusData.waha_status && <p><span className="font-semibold">HTTP {statusData.waha_status}</span> from WAHA</p>}
                                {statusData.error && <p className="text-red-600">{statusData.error}</p>}
                                {statusData.waha_error && <p className="text-gray-500">{JSON.stringify(statusData.waha_error)}</p>}
                                <p className="text-gray-400 pt-1">Also check your backend console for <span className="text-gray-600">[WAHA]</span> logs.</p>
                            </div>
                        )}
                    </div>
                )}
            </div>

            <div className="card p-6 space-y-4">
                <h2 className="font-bold text-gray-800 text-lg">Send Test Message</h2>
                <p className="text-sm text-gray-500">Enter a WhatsApp number to verify the integration is working.</p>
                <form onSubmit={handleTestSend} className="flex gap-3 flex-wrap">
                    <div className="relative flex-1 min-w-52">
                        <Phone size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input type="tel" className="input-field pl-9 text-sm" placeholder="+91 9876543210"
                            value={testPhone} onChange={e => setTestPhone(e.target.value)} />
                    </div>
                    <button type="submit" disabled={testMutation.isPending || !isConnected} className="btn-primary flex items-center gap-2 disabled:opacity-60">
                        {testMutation.isPending ? <><Loader size={15} className="animate-spin" /> Sending…</>
                            : testSent ? <><CheckCircle size={15} /> Sent!</>
                                : <><Send size={15} /> Send Test</>}
                    </button>
                </form>
                {!isConnected && (
                    <p className="text-xs text-amber-600 flex items-center gap-1.5">
                        <Info size={12} /> Session must be WORKING to send messages.
                    </p>
                )}
            </div>

            <div className="card p-6 space-y-4 bg-gradient-to-br from-gray-50 to-white">
                <h2 className="font-bold text-gray-800 text-lg">How it works</h2>
                <div className="space-y-3">
                    {[
                        { step: '1', title: 'Trainee completes test', desc: 'After submission, the attempt is scored automatically by AI.' },
                        { step: '2', title: 'Messages sent automatically', desc: 'Trainee gets their result + AI feedback. Trainer gets a summary notification.' },
                        { step: '3', title: 'Requires phone number', desc: 'Users must have a phone number saved in their profile to receive messages.' },
                    ].map(item => (
                        <div key={item.step} className="flex items-start gap-4">
                            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-green-400 to-emerald-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0 mt-0.5">
                                {item.step}
                            </div>
                            <div>
                                <p className="text-sm font-semibold text-gray-800">{item.title}</p>
                                <p className="text-xs text-gray-500 mt-0.5">{item.desc}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}